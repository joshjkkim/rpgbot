import { query } from "./index.js";
import { guildConfigCache } from "../cache/caches.js";
import type { EventCategory } from "../types/logging.js";
import type { GuildConfig, DbGuild } from "../types/guild.js";
import { DEFAULT_GUILD_CONFIG } from "../types/guild.js";

type UpsertGuildArgs = {
    discordGuildId: string;
    name?: string;
    iconUrl?: string | null;
};

export async function upsertGuild(args: UpsertGuildArgs): Promise<DbGuild> {
    const { discordGuildId, name, iconUrl } = args;

    const result = await query<DbGuild>(
        `
        INSERT INTO guilds (discord_guild_id, name, icon_url)
        VALUES ($1, $2, $3)
        ON CONFLICT (discord_guild_id)
        DO UPDATE SET
        name = EXCLUDED.name,
        icon_url = EXCLUDED.icon_url
        RETURNING *;
        `,
        [discordGuildId, name ?? null, iconUrl ?? null]
    );

    if (!result.rows[0]) {
        throw new Error("Failed to upsert guild");
    }

    const guild = result.rows[0];
    if(guild.config === null || Object.keys(guild.config).length === 0) {
        await setGuildConfig(discordGuildId, DEFAULT_GUILD_CONFIG);
        guild.config = DEFAULT_GUILD_CONFIG;
    }

    return guild;
}

export async function getGuildByDiscordId(
    discordGuildId: string
    ): Promise<DbGuild | null> {
    const result = await query<DbGuild>(
        `SELECT * FROM guilds WHERE discord_guild_id = $1`,
        [discordGuildId]
    );
    return result.rows[0] ?? null;
}

export function mergeConfig(raw: GuildConfig | null): GuildConfig {
    return {
        ...DEFAULT_GUILD_CONFIG,
        ...(raw ?? {}),
            style: {
                ...DEFAULT_GUILD_CONFIG.style,
                ...(raw?.style ?? {}),
            },
            xp: {
                ...DEFAULT_GUILD_CONFIG.xp,
                ...(raw?.xp ?? {}),
                vc: {
                    ...DEFAULT_GUILD_CONFIG.xp.vc,
                    ...(raw?.xp?.vc ?? {}),
                    channelIds: {
                        ...DEFAULT_GUILD_CONFIG.xp.vc.channelIds,
                        ...(raw?.xp?.vc?.channelIds ?? {}),
                    },
                    roleXpBonus: {
                        ...DEFAULT_GUILD_CONFIG.xp.vc.roleXpBonus,
                        ...(raw?.xp?.vc?.roleXpBonus ?? {}),
                    }
                },
                xpChannelIds: {
                    ...DEFAULT_GUILD_CONFIG.xp.xpChannelIds,
                    ...(raw?.xp?.xpChannelIds ?? {}),
                },
                streakRewards: {
                    ...DEFAULT_GUILD_CONFIG.xp.streakRewards,
                    ...(raw?.xp?.streakRewards ?? {}),
                },
                roleXp: {
                    ...DEFAULT_GUILD_CONFIG.xp.roleXp,
                    ...(raw?.xp?.roleXp ?? {}),
                },
                roleDailyBonus: {
                    ...DEFAULT_GUILD_CONFIG.xp.roleDailyBonus,
                    ...(raw?.xp?.roleDailyBonus ?? {}),
                },
                roleTemp: {
                    ...DEFAULT_GUILD_CONFIG.xp.roleTemp,
                    ...(raw?.xp?.roleTemp ?? {}),
                }
            },
            achievements: {
                ...DEFAULT_GUILD_CONFIG.achievements,
                ...(raw?.achievements ?? {}),
            },
            levels: {
                ...DEFAULT_GUILD_CONFIG.levels,
                ...(raw?.levels ?? {}),
                xpOverrides: {
                    ...DEFAULT_GUILD_CONFIG.levels.xpOverrides,
                    ...(raw?.levels?.xpOverrides ?? {}),
                },
                levelActions: {
                    ...DEFAULT_GUILD_CONFIG.levels.levelActions,
                    ...(raw?.levels?.levelActions ?? {}),
                }
            },
            shop: {
                ...DEFAULT_GUILD_CONFIG.shop,
                ...(raw?.shop ?? {}),
                categories: {
                    ...DEFAULT_GUILD_CONFIG.shop.categories,
                    ...(raw?.shop?.categories ?? {}),
                },
                items: {
                    ...DEFAULT_GUILD_CONFIG.shop.items,
                    ...(raw?.shop?.items ?? {}),
                }
            },
        logging: {
            ...DEFAULT_GUILD_CONFIG.logging,
            ...(raw?.logging ?? {}),
            allowedCategories: {
                ...DEFAULT_GUILD_CONFIG.logging.allowedCategories,
                ...(raw?.logging?.allowedCategories ?? {}),
            } as Record<EventCategory, string | null>
        }
    }
}

export async function setGuildConfig(guildId: string, config: GuildConfig): Promise<void> {
    const res = await query(
        `
        UPDATE guilds
        SET config = $2
        WHERE discord_guild_id = $1
        `,
        [guildId, config]
    );

    if (res.rowCount === 0) {
        throw new Error("Failed to set guild config");
    }

    guildConfigCache.delete(guildId);
}

export async function getGuildConfig(guildId: string): Promise<{guild: DbGuild, config: GuildConfig}> {
    const result = await query<DbGuild>(
        `SELECT * FROM guilds WHERE discord_guild_id = $1`,
        [guildId]
    );

    let guild = result.rows[0];
    if (!guild) {
        throw new Error("Guild not found");
    }

    const config = mergeConfig(guild.config);
    return { guild, config };
}
