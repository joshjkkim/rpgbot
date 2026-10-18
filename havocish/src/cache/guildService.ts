import { upsertGuild, mergeConfig } from "../db/guilds.js";
import type { CachedGuildConfig } from "../types/cache.js";
import { guildConfigCache, isStale } from "./caches.js";

const GUILD_CONFIG_TTL_MS = 60 * 1000;

/** `fresh` skips the cache, for a read that is about to decide a write. */
export async function getOrCreateGuildConfig(opts: { discordGuildId: string; fresh?: boolean }): Promise<CachedGuildConfig> {
    const cached = guildConfigCache.get(opts.discordGuildId);
    const now = Date.now();

    if (cached && !opts.fresh && !isStale(cached.lastLoaded, GUILD_CONFIG_TTL_MS)) {
        const toReturn: CachedGuildConfig = {
            guild: cached.guild,
            config: cached.config,
            lastLoaded: cached.lastLoaded,
        };
        return toReturn;
    }

    const dbGuild = await upsertGuild({
        discordGuildId: opts.discordGuildId,
    });

   const mergedConfig = mergeConfig(dbGuild.config);

    const fresh: CachedGuildConfig = {
        guild: dbGuild,
        config: mergedConfig,
        lastLoaded: now,
    };

    guildConfigCache.set(opts.discordGuildId, fresh);
    return fresh;
}