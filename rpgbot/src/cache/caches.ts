import type { CachedUserId, CachedGuildConfig, CachedUserGuildProfile } from "../types/cache.js";
import { flushProfileCacheToDb } from "./profileService.js";

const USER_CACHE_TTL_MS = 10 * 60 * 1000;
const GUILD_CONFIG_TTL_MS = 60 * 1000;
const PROFILE_CONFIG_TTL_MS = 30 * 1000;

export const userIdCache = new Map<string, CachedUserId>();
export const guildConfigCache = new Map<string, CachedGuildConfig>();
export const userGuildProfileCache = new Map<string, CachedUserGuildProfile>();
export const imgCache = new Map<string, any>();

export function profileKey(guildId: number, userId: number) {
    return `${guildId}:${userId}`;
}

export function isStale(last: number, ttlMs: number) {
    return Date.now() - last > ttlMs;
}

function parseProfileKey(key: string): { guildId: number; userId: number } | null {
    const [guildIdStr, userIdStr] = key.split(":");
    const guildId = Number(guildIdStr);
    const userId = Number(userIdStr);
    if (Number.isNaN(guildId) || Number.isNaN(userId)) return null;
    return { guildId, userId };
}

export async function pruneCaches(): Promise<void> {
    const now = Date.now();

    for (const [id, value] of userIdCache) {
        if (now - value.lastRefreshed > USER_CACHE_TTL_MS * 3) {
            userIdCache.delete(id);
        }
    }

    for (const [id, value] of guildConfigCache) {
        if (now - value.lastLoaded > GUILD_CONFIG_TTL_MS * 10) {
            guildConfigCache.delete(id);
        }
    }

    for (const [key, value] of userGuildProfileCache) {
        if (now - value.lastLoaded <= PROFILE_CONFIG_TTL_MS * 10) continue;

        const ids = parseProfileKey(key);
        if (!ids) {
            userGuildProfileCache.delete(key);
            continue;
        }

        if (value.dirty && value.pendingChanges) {
            // Must land before eviction, otherwise the buffered XP/gold is gone.
            const flushed = await flushProfileCacheToDb({ ...ids, force: true });
            if (!flushed) continue; // keep the entry; retry on the next prune
        }

        userGuildProfileCache.delete(key);
    }
}

/**
 * Flushes every profile with buffered changes.
 *
 * `force` bypasses the per-profile write throttle - use it on shutdown, where
 * there is no "next flush" to fall back on.
 */
export async function flushDirtyProfiles(force = false): Promise<void> {
    const entries = Array.from(userGuildProfileCache.entries());

    for (const [key, cached] of entries) {
        if (!cached.dirty || !cached.pendingChanges) continue;

        const ids = parseProfileKey(key);
        if (!ids) continue;

        await flushProfileCacheToDb({ ...ids, force });
    }
}
