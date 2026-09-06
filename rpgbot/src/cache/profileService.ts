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
 */
export async function flushProfileCacheToDb(
    opts: { userId: number; guildId: number; force?: boolean }
): Promise<boolean> {
    const key = profileKey(opts.guildId, opts.userId);

    const existing = inFlight.get(key);
    if (existing) return existing;

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
