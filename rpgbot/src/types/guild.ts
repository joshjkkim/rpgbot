import type { shopCategoryConfig, shopItemConfig } from "./economy.js";
import type { EventCategory } from "./logging.js";
import type { AchievementConfig } from "./achievement.js";
import type { QuestConfig } from "./quest.js";
import type { EnemyConfig } from "./combat.js";
export interface DbGuild {
    id: number;
    discord_guild_id: string;
    name: string | null;
    icon_url: string | null;
    created_at: string;
    config: GuildConfig | null;
}

export interface RoleXpConfig {
    extraXp?: number;
    multiplier?: number;
    cooldownSeconds?: number;
}

export interface RoleDailyBonusConfig {
    xpBonus?: number;
    goldBonus?: number;
    multiplier?: number;
}

export interface RoleTempConfig {
    defaultDurationMinutes?: number | null;
    hardExpiryat?: string | null;
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
        template: "default" | "fantasy";
        mainThemeColor: string;
        mainTextColor: string;
        gold: {
            icon?: string;
            name?: string;
        };
        xp: {
            icon?: string;
            name?: string;
        };
    },
    combat: {
        enabled: boolean;
        hpBase?: number;
        hpPerLevel?: number;
        attackBase?: number;
        attackPerLevel?: number;
        defenseBase?: number;
        defensePerLevel?: number;
        speedBase?: number;
        speedPerLevel?: number;
        critChanceBase?: number;
        critChancePerLevel?: number;
        critMultiplierBase?: number;
        critMultiplierPerLevel?: number;
        enemies?: Record<string, EnemyConfig>;
        pveDeathPenalty?: {
            goldPercent?: number;   // % of current gold lost (e.g. 5 = 5%). Default: 0
            goldFlat?: number;      // minimum flat gold lost regardless of percent. Default: 0
            xpPercent?: number;     // % of current XP lost. Default: 0 (not recommended)
        };
        pvpDeathPenalty?: {
            goldPercent?: number;
            goldFlat?: number;
            xpPercent?: number;
            loserGoldToWinner?: boolean; // if true, loser's lost gold goes to winner
        };
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
        roleDailyBonus: Record<string, RoleDailyBonusConfig>;
        roleTemp: Record<string, RoleTempConfig>; 

        autoDailyEnabled: boolean;
        replyToDailyInChannel: boolean;
        replyToDailyEphemeral: boolean;
        replyToDailyMessage: string;
        announceDailyInChannelId: string | null;
        announceDailyMessage: string;
    },
    achievements: {
        enabled: boolean;
        progress: boolean;
        achievements: Record<string, AchievementConfig>;
        announceAllId: string | null;
        announceMessage: string | null;
    },
    quests: {
        enabled: boolean;
        progress: boolean;
        quests: Record<string, QuestConfig>;
        announceAllId: string | null;
        announceMessage: string | null;
        dmUser: boolean;
        replyMessage: boolean;
    },
    levels: {
        maxLevel: number | null;
        announceLevelUpInChannelId: string | null;
        announceLevelUpMessage: string;
        curveType: "linear" | "exponential" | "polynomial" | "logarithmic";
        curveParams: Record<string, number>; // depends on curve type
        xpOverrides: Record<number, number>; // level -> total xp required
        levelActions: Record<number, LevelAction[]>; // level -> actions to perform
    },
    shop: {
        enabled?: boolean;
        categories?: Record<string, shopCategoryConfig>;
        items?: Record<string, shopItemConfig>;
        gifting?: { enabled: boolean, message: string | null, announceChannel: string | null, dm: boolean, levelReq: number  };
    },
    logging: {
        enabled?: boolean;
        mainChannelId?: string | null;
        allowedCategories?: Record<EventCategory, string | null | false>; // category -> channelId to override log if so needed
    }
}

export const DEFAULT_GUILD_CONFIG: GuildConfig = {
    style: {
        mainThemeColor: "#00AE86",
        mainTextColor: "#FFFFFF",
        template: "default",
        gold: {
            icon: "💰",
            name: "Gold"
        },
        xp: {
            icon: "⭐",
            name: "XP"
        }
    },
    combat: {
        enabled: false,
        hpBase: 100,
        hpPerLevel: 10,
        attackBase: 10,
        attackPerLevel: 2,
        defenseBase: 5,
        defensePerLevel: 1,
        speedBase: 5,
        speedPerLevel: 1,
        critChanceBase: 0.05,
        critChancePerLevel: 0.01,
        critMultiplierBase: 1.5,
        critMultiplierPerLevel: 0.1,
        enemies: {}
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
        roleDailyBonus: {},
        roleTemp: {},

        autoDailyEnabled: true,
        replyToDailyInChannel: true,
        replyToDailyEphemeral: true,
        replyToDailyMessage: "You have claimed your daily reward of {xp} {xpName} {xpIcon} and {gold} {goldName} {goldIcon}! Your current streak is {streak} days.",
        announceDailyInChannelId: null,
        announceDailyMessage: "🎉 {user}, you have received your daily reward of {xp} {xpName} {xpIcon} and {gold} {goldName} {goldIcon}!"
    },
    achievements: {
        enabled: false,
        progress: false,
        achievements: {},
        announceAllId: null,
        announceMessage: null,
    },
    quests: {
        enabled: false,
        progress: false,
        quests: {},
        announceAllId: null,
        announceMessage: null,
        dmUser: false,
        replyMessage: false,
    },
    levels: {
        maxLevel: 100,
        announceLevelUpInChannelId: null,
        announceLevelUpMessage: "🎉 {user}, you have reached level {level}!",
        curveType: "linear",
        curveParams: { rate: 100},
        xpOverrides: {},
        levelActions: {}
    },
    shop: {
        enabled: false,
        categories: {},
        items: {},
        gifting: { enabled: false, message: null, announceChannel: null, dm: false,levelReq: 0 },
    },
    logging: {
        enabled: false,
        mainChannelId: null,
        allowedCategories: {
            economy: false,
            xp: false,
            daily: false,
            streak: false,
            level: false,
            config: false,
            inventory: false,
            admin: false,
            quests: false
        }
    }
};