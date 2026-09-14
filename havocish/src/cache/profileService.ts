import { upsertUserGuildProfile } from "../db/userGuildProfiles.js";
import { query } from "../db/index.js";
import { isStale, userGuildProfileCache, profileKey } from "./caches.js";
import type { CachedUserGuildProfile, PendingProfileChanges } from "../types/cache.js";
import type { DbUserGuildProfile } from "../types/userprofile.js";

const PROFILE_CONFIG_TTL_MS = 30 * 1000;

/** Don't write the same profile to the DB more often than this, unless forced. */
const MIN_INTERVAL_DB_WRITE_MS = 5000;

/**
 * Profiles currently being written to the DB, keyed by profileKey.
 * Prevents two overlapping flushes for the same profile from racing each other
 * (the 30s interval, pruneCaches, and getOrCreateProfile can all trigger one).
 */
const inFlight = new Map<string, Promise<boolean>>();

/** Columns that can be flushed, and how to serialize them. `null` = pass through. */
const FLUSHABLE_COLUMNS = {
    xp: null,
    gold: null,
    level: null,
    streak_count: null,
    last_message_at: null,
    last_daily_at: null,
    user_stats: JSON.stringify,
    temp_roles: JSON.stringify,
    inventory: JSON.stringify,
    achievements: JSON.stringify,
    quests: JSON.stringify,
    equips: JSON.stringify,
    settings: JSON.stringify,
} as const satisfies Record<keyof PendingProfileChanges, ((v: any) => string) | null>;

export async function getOrCreateProfile(opts: { userId: number; guildId: number; }): Promise<CachedUserGuildProfile> {
    const key = profileKey(opts.guildId, opts.userId);
    const cached = userGuildProfileCache.get(key);

    if (cached && !isStale(cached.lastLoaded, PROFILE_CONFIG_TTL_MS)) {
        return cached;
    }

    // The entry is stale, but it may still hold writes that never reached the DB.
    // Reloading without flushing first would silently discard them, which is how
    // XP and gold used to go missing when a user chatted and then ran a command
    // a little over the TTL later.
    if (cached?.dirty && cached.pendingChanges) {
        await flushProfileCacheToDb({ ...opts, force: true });

        // A successful flush refreshed the entry from its RETURNING * row, so
        // there is nothing left to read.
        const flushed = userGuildProfileCache.get(key);
        if (flushed && !isStale(flushed.lastLoaded, PROFILE_CONFIG_TTL_MS)) {
            return flushed;
        }
    }

    const profile = await upsertUserGuildProfile({
        userId: opts.userId,
        guildId: opts.guildId,
    });

    // The flush may have failed, or new writes may have landed while we awaited
    // the reload. Anything still pending wins over the row we just read.
    const current = userGuildProfileCache.get(key);
    const stillPending = current?.dirty ? current.pendingChanges : undefined;

    const fresh: CachedUserGuildProfile = {
        profile: (stillPending ? { ...profile, ...stillPending } : profile) as DbUserGuildProfile,
        pendingChanges: stillPending,
        dirty: Boolean(stillPending),
        lastWroteToDb: current?.lastWroteToDb,
        lastLoaded: Date.now(),
    };

    userGuildProfileCache.set(key, fresh);
    return fresh;
}

/**
 * Writes a profile's buffered changes to the DB.
 *
 * Returns true when the cache entry is clean afterwards (either it was flushed,
 * or there was nothing to flush). Returns false when changes are still pending,
 * in which case the caller must not evict the entry.
 *
 * Never throws: a failed write leaves the changes buffered for the next attempt.
 *
 * `force` both skips the write throttle and refuses to settle for a flush that
 * is already running, so a forced call always reflects the buffer as of the
 * moment it was made.
 */
export async function flushProfileCacheToDb(
    opts: { userId: number; guildId: number; force?: boolean }
): Promise<boolean> {
    const key = profileKey(opts.guildId, opts.userId);

    // Wait out any flush already running for this profile, so two writes for the
    // same row never overlap.
    //
    // A non-forced caller takes that flush's result and is done. A forced caller
    // cannot: the in-flight flush may be throttled into a no-op, or may have
    // snapshotted the buffer before the writes this caller needs persisted. So
    // it waits for the flush to settle and then runs a pass of its own. That
    // matters on shutdown, where there is no later flush to fall back on.
    while (inFlight.has(key)) {
        const settled = await inFlight.get(key)!.catch(() => false);
        if (!opts.force) return settled;
    }

    const run = doFlush(opts, key).finally(() => inFlight.delete(key));
    inFlight.set(key, run);
    return run;
}

async function doFlush(
    opts: { userId: number; guildId: number; force?: boolean },
    key: string
): Promise<boolean> {
    const { userId, guildId, force = false } = opts;
    const cached = userGuildProfileCache.get(key);

    if (!cached || !cached.dirty || !cached.pendingChanges) return true;

    const now = Date.now();
    if (!force && cached.lastWroteToDb && now - cached.lastWroteToDb < MIN_INTERVAL_DB_WRITE_MS) {
        return false; // still dirty - caller must keep the entry alive
    }

    const changes = cached.pendingChanges;

    const setClauses: string[] = [];
    const values: any[] = [userId, guildId];
    let idx = 3;

    for (const [column, serialize] of Object.entries(FLUSHABLE_COLUMNS)) {
        const value = changes[column as keyof PendingProfileChanges];
        if (value === undefined) continue;
        setClauses.push(`${column} = $${idx++}`);
        values.push(serialize ? (serialize as (v: any) => string)(value) : value);
    }

    if (setClauses.length === 0) {
        cached.dirty = false;
        cached.pendingChanges = undefined;
        return true;
    }

    setClauses.push(`updated_at = NOW()`);

    const sql = `
        UPDATE user_guild_profiles
        SET ${setClauses.join(", ")}
        WHERE user_id = $1 AND guild_id = $2
        RETURNING *;
    `;

    // Clear the buffer up front so writes that land while we await the query are
    // recorded separately rather than being wiped by this flush's completion.
    cached.pendingChanges = undefined;
    cached.dirty = false;

    try {
        const res = await query<DbUserGuildProfile>(sql, values);
        const updatedRow = res.rows[0];

        // Re-read: other handlers may have buffered new writes while we awaited.
        const current = userGuildProfileCache.get(key) ?? cached;
        const buffered = current.pendingChanges;

        if (!updatedRow) {
            // The UPDATE matched no row, so nothing was persisted. Restore the
            // buffer rather than letting the changes evaporate.
            current.pendingChanges = { ...changes, ...(buffered ?? {}) };
            current.dirty = true;
            userGuildProfileCache.set(key, current);

            console.error(`Flush for profile ${key} matched no row; changes kept buffered.`);
            return false;
        }

        // Anything buffered during the await wins over the row we just wrote.
        current.profile = (buffered
            ? { ...updatedRow, ...buffered }
            : updatedRow) as DbUserGuildProfile;

        current.lastWroteToDb = Date.now();
        current.lastLoaded = Date.now();
        userGuildProfileCache.set(key, current);

        return !current.dirty;
    } catch (err) {
        // Put the snapshot back so the next attempt retries it, letting any
        // newer value for the same column win over the one that failed.
        const current = userGuildProfileCache.get(key) ?? cached;
        current.pendingChanges = { ...changes, ...(current.pendingChanges ?? {}) };
        current.dirty = true;
        userGuildProfileCache.set(key, current);

        console.error(`Failed to flush profile ${key} to DB:`, err);
        return false;
    }
}

/** Columns two writers can both add to, so merging has to combine the deltas. */
const ADDITIVE_COLUMNS = ["xp", "gold"] as const;

/** `xp` and `gold` as a writer read them, before it touched anything. */
export type ProfileBaseline = { xp: string; gold: string };

/**
 * Commits one writer's changes into the cached profile.
 *
 * Writers read the profile, mutate it, and buffer the columns they touched.
 * That work awaits in between - the quest and achievement pipelines, and on the
 * Discord side DMs and role grants - so another writer can buffer its own
 * columns before this one gets back. Replacing the entry wholesale erased them
 * from the buffer: the shared profile object still showed the value, so the
 * cache looked right, but the column was never flushed and reverted the next
 * time the row was reloaded. That is how gold went missing when a purchase
 * landed while a message was still being processed.
 *
 * So merge rather than replace. Anything buffered while this writer was away
 * survives, and for the columns both writers add to, this writer's delta is
 * re-applied on top of the value that is live now instead of the stale one it
 * was computed from.
 *
 * Returns the merged profile.
 */
export function commitProfileChanges(opts: {
    userId: number;
    guildId: number;
    profile: DbUserGuildProfile;
    changes: PendingProfileChanges;
    baseline: ProfileBaseline;
    /** Recomputes the level when merging moves xp off what the caller saw. */
    recomputeLevel?: (xp: string) => number;
}): DbUserGuildProfile {
    const { userId, guildId, profile, changes, baseline, recomputeLevel } = opts;

    const key = profileKey(guildId, userId);
    const current = userGuildProfileCache.get(key);
    const buffered = current?.pendingChanges ?? {};

    const merged: PendingProfileChanges = { ...buffered, ...changes };

    for (const column of ADDITIVE_COLUMNS) {
        const ours = changes[column];
        if (ours === undefined) continue;

        const delta = BigInt(ours) - BigInt(baseline[column]);
        if (delta === 0n) continue;

        // Whatever is buffered now already carries the other writer's delta;
        // with nothing buffered, this writer is the only contributor.
        const live = buffered[column] ?? baseline[column];
        merged[column] = (BigInt(live) + delta).toString();
    }

    // user_stats is a bag of counters. Writers normally increment the same
    // object in place, so this is a no-op, but a writer that replaced it would
    // otherwise drop every counter it did not set.
    if (buffered.user_stats && changes.user_stats && buffered.user_stats !== changes.user_stats) {
        merged.user_stats = { ...buffered.user_stats, ...changes.user_stats };
    }

    // Level follows from xp, so recompute it whenever the merge moved xp.
    if (recomputeLevel && merged.xp !== undefined && merged.xp !== changes.xp) {
        merged.level = recomputeLevel(merged.xp);
    }

    const mergedProfile = { ...profile, ...merged } as DbUserGuildProfile;

    userGuildProfileCache.set(key, {
        profile: mergedProfile,
        pendingChanges: Object.keys(merged).length > 0 ? merged : undefined,
        dirty: Object.keys(merged).length > 0,
        // Prefer the live timestamp: a flush may have completed while this
        // writer was awaiting, and restoring the stale one would reopen the
        // write-throttle window it just closed.
        lastWroteToDb: current?.lastWroteToDb,
        lastLoaded: Date.now(),
    });

    return mergedProfile;
}
