import { query } from "../db/index.js";
import { upsertUserGuildProfile } from "../db/userGuildProfiles.js";
import { isStale, userGuildProfileCache, profileKey } from "./caches.js";
import type { CachedUserGuildProfile } from "../types/cache.js";
import type { DbUserGuildProfile } from "../types/userprofile.js";

const PROFILE_CONFIG_TTL_MS = 30 * 1000;

export async function getOrCreateProfile(opts: { userId: number; guildId: number; }): Promise<CachedUserGuildProfile> {
    const cached = userGuildProfileCache.get(profileKey(opts.guildId, opts.userId));
    const now = Date.now();

    if (cached && !isStale(cached.lastLoaded, PROFILE_CONFIG_TTL_MS)) {
        console.log(`Cache hit for profile ${profileKey(opts.guildId, opts.userId)}`);
        return cached;
    }

    const profile = await upsertUserGuildProfile({
        userId: opts.userId,
        guildId: opts.guildId,
    });

    userGuildProfileCache.set(profileKey(opts.guildId, opts.userId), {
        profile,
        lastLoaded: now,
    });

    return { profile, lastLoaded: now };
}

export async function flushProfileCacheToDb(opts: { userId: number; guildId: number; }) {
    const { userId, guildId } = opts;
    const now = Date.now();
    const cached = userGuildProfileCache.get(profileKey(opts.guildId, opts.userId));

    if (!cached || !cached.dirty || !cached.pendingChanges) return;

    const MIN_INTERVAL_DB_WRITE_MS = 5000;

    if (cached.lastWroteToDb && now - cached.lastWroteToDb < MIN_INTERVAL_DB_WRITE_MS) return;

    const changes = cached.pendingChanges;

    const setClauses: string[] = [];
    const values: any[] = [userId, guildId];
    let idx = 3;

    if (changes.xp !== undefined) {
        setClauses.push(`xp = $${idx++}`);
        values.push(changes.xp);
    }

    if (changes.gold !== undefined) {
        setClauses.push(`gold = $${idx++}`);
        values.push(changes.gold);
    }

    if (changes.level !== undefined) {
        setClauses.push(`level = $${idx++}`);
        values.push(changes.level);
    }

    if (changes.streak_count !== undefined) {
        setClauses.push(`streak_count = $${idx++}`);
        values.push(changes.streak_count);
    }

    if (changes.last_message_at !== undefined) {
        setClauses.push(`last_message_at = $${idx++}`);
        values.push(changes.last_message_at);
    }

    if (changes.last_daily_at !== undefined) {
        setClauses.push(`last_daily_at = $${idx++}`);
        values.push(changes.last_daily_at);
    }

    if (changes.user_stats !== undefined) {
        setClauses.push(`user_stats = $${idx++}`);
        values.push(JSON.stringify(changes.user_stats));
    }

    if (changes.temp_roles !== undefined) {
        setClauses.push(`temp_roles = $${idx++}`);
        values.push(JSON.stringify(changes.temp_roles));
    }

    if (changes.inventory !== undefined) {
        setClauses.push(`inventory = $${idx++}`);
        values.push(JSON.stringify(changes.inventory));
    }

    if (changes.achievements !== undefined) {
        setClauses.push(`achievements = $${idx++}`);
        values.push(JSON.stringify(changes.achievements));
    }

    if (setClauses.length === 0) {
        cached.dirty = false;
        cached.pendingChanges = undefined;
        return;
    }

    setClauses.push(`updated_at = NOW()`);

    const sql = `
        UPDATE user_guild_profiles
        SET ${setClauses.join(", ")}
        WHERE user_id = $1 AND guild_id = $2
        RETURNING *;
    `;

    console.log(sql, values);

    const res = await query<DbUserGuildProfile>(sql, values);
    const updatedRow = res.rows[0];

    if (updatedRow) {
        cached.profile = updatedRow;
    }

    cached.dirty = false;
    cached.pendingChanges = undefined;
    cached.lastWroteToDb = now;
    cached.lastLoaded = now;

    userGuildProfileCache.set(profileKey(guildId, userId), cached);
    
}

