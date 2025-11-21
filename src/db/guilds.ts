import { query } from "./index.js";

export interface DbGuild {
    id: number;
    discord_guild_id: string;
    name: string | null;
    icon_url: string | null;
    created_at: string;
    config: any; // you can type this later
}

export interface RoleXpConfig {
    extraXp?: number;
    multiplier?: number;
    cooldownSeconds?: number;
    dailyXpBonus?: number;
    dailyGoldBonus?: number;
}

export interface LevelAction {
    type: "assignRole" | "removeRole" | "sendMessage" | "runCommand";
    roleId?: string; // for assignRole/removeRole
    message?: string; // for sendMessage
    channelId?: string; // for sendMessage
    command?: string; // for runCommand
}

export interface StreakReward {
    streakCount: number;
    xpBonus: number;
    goldBonus: number;
    message: string | null;
    channelId: string | null;
}

export interface xpChannelConfig {
    enabled: boolean;
    channelId: string;
    multiplier: number;
    flatBonus: number;
    cooldownOverride?: number;
}

export interface GuildConfig {
    style: {
        mainThemeColor: string;
    },
    xp: {
        basePerMessage: number;
        xpMessageCooldown: number;
        xpChannelIds: Record<string, xpChannelConfig>; // channelId -> xp multiplier
        dailyXp: number;
        dailyGold: number;

        vc: {
            enabled: boolean;
            basePerMinute: number;
            minMinutesForXp: number;
            channelIds: Record<string, xpChannelConfig>;
            roleXpBonus: Record<string, RoleXpConfig>;
        };

        streakMultiplier: number;
        streakAnnounceChannelId: string | null;
        streakAnnounceMessage: string;
        streakRewards: Record<number, StreakReward>;

        roleXp: Record<string, RoleXpConfig>;

        autoDailyEnabled: boolean;
        replyToDailyInChannel: boolean;
        replyToDailyEphemeral: boolean;
        replyToDailyMessage: string;
        announceDailyInChannelId: string | null;
        announceDailyMessage: string;
    },
    levels: {
        maxLevel: number | null;
        announceLevelUpInChannelId: string | null;
        announceLevelUpMessage: string;
        curveType: "linear" | "exponential" | "polynomial" | "logarithmic";
        curveParams: Record<string, number>; // depends on curve type
        xpOverrides: Record<number, number>; // level -> total xp required
        levelActions: Record<number, LevelAction[]>; // level -> actions to perform
    }
}

export const DEFAULT_GUILD_CONFIG: GuildConfig = {
    style: {
        mainThemeColor: "#00AE86",
    },
    xp: {
        basePerMessage: 5,
        xpMessageCooldown: 60,
        xpChannelIds: {},

        dailyXp: 50,
        dailyGold: 20,

        vc: {
            enabled: false,
            basePerMinute: 2,
            minMinutesForXp: 0,
            channelIds: {},
            roleXpBonus: {},
        },

        streakMultiplier: 0.1,
        streakAnnounceChannelId: null,
        streakAnnounceMessage: "🔥 {user}, you are on a {streak}-day streak! You've earned a bonus of {xp} XP and {gold} gold!",
        streakRewards: {},

        roleXp: {},

        autoDailyEnabled: true,
        replyToDailyInChannel: true,
        replyToDailyEphemeral: true,
        replyToDailyMessage: "You have claimed your daily reward of {xp} XP and {gold} gold! Your current streak is {streak} days.",
        announceDailyInChannelId: null,
        announceDailyMessage: "🎉 {user}, you have received your daily reward of {xp} XP and {gold} gold!"
    },
    levels: {
        maxLevel: 100,
        announceLevelUpInChannelId: null,
        announceLevelUpMessage: "🎉 {user}, you have reached level {level}!",
        curveType: "linear",
        curveParams: { rate: 100},
        xpOverrides: {},
        levelActions: {}
    }
};

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
                }
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
