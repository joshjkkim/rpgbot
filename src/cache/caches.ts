import type { DbGuild, GuildConfig } from "../db/guilds.js";
import type { DbUser } from "../db/users.js";
import type { DbUserGuildProfile } from "../db/userGuildProfiles.js";

const USER_CACHE_TTL_MS = 10 * 60 * 1000;
const GUILD_CONFIG_TTL_MS = 60 * 1000;
const PROFILE_CONFIG_TTL_MS = 30 * 1000;

export interface CachedUserId {
    user: DbUser;
    lastRefreshed: number;
}

export interface CachedGuildConfig {
    guild: DbGuild;
    config: GuildConfig 
    lastLoaded: number;
}

export interface CachedUserGuildProfile {
    profile: DbUserGuildProfile;
    lastLoaded: number;
}

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
        userGuildProfileCache.delete(id);
        }
    }
}
