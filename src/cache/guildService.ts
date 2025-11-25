import { upsertGuild, mergeConfig } from "../db/guilds.js";
import type { CachedGuildConfig } from "./caches.js";
import { guildConfigCache, isStale } from "./caches.js";

const GUILD_CONFIG_TTL_MS = 60 * 1000;

export async function getOrCreateGuildConfig(opts: { discordGuildId: string; }): Promise<CachedGuildConfig> {
    const cached = guildConfigCache.get(opts.discordGuildId);
    const now = Date.now();

    if (cached && !isStale(cached.lastLoaded, GUILD_CONFIG_TTL_MS)) {
        console.log(`Cache hit for guild ${opts.discordGuildId}`);
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