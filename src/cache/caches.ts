import type { CachedUserId, CachedGuildConfig, CachedUserGuildProfile } from "../types/cache.js";
import { flushProfileCacheToDb } from "./profileService.js";

const USER_CACHE_TTL_MS = 10 * 60 * 1000;
const GUILD_CONFIG_TTL_MS = 60 * 1000;
const PROFILE_CONFIG_TTL_MS = 30 * 1000;

export const userIdCache = new Map<string, CachedUserId>();
export const guildConfigCache = new Map<string, CachedGuildConfig>();
export const userGuildProfileCache = new Map<string, CachedUserGuildProfile>();

export function profileKey(guildId: number, userId: number) {
    return `${guildId}:${userId}`;
}

export function isStale(last: number, ttlMs: number) {
    return Date.now() - last > ttlMs;
}

export function pruneCaches() {
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

    for (const [id, value] of userGuildProfileCache) {
        if (now - value.lastLoaded > PROFILE_CONFIG_TTL_MS * 10) {
            const [guildIdStr, userIdStr] = id.split(":");
            const guildId = Number(guildIdStr);
            const userId = Number(userIdStr);

            if (value.dirty && value.pendingChanges) {
                void flushProfileCacheToDb({ guildId, userId });
            }
            userGuildProfileCache.delete(id);
        }
    }
}

export async function flushDirtyProfiles(): Promise<void> {
    const entries = Array.from(userGuildProfileCache.entries());

    for (const [key, cached] of entries) {
        if (!cached.dirty || !cached.pendingChanges) continue;

        const [guildIdStr, userIdStr] = key.split(":");
        const guildId = Number(guildIdStr);
        const userId = Number(userIdStr);
        if (Number.isNaN(guildId) || Number.isNaN(userId)) continue;

        await flushProfileCacheToDb({ guildId, userId });
    }
}