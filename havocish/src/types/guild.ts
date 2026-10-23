import type { ItemRarity, shopCategoryConfig, shopItemConfig } from "./economy.js";
import type { EventCategory } from "./logging.js";
import type { AchievementConfig } from "./achievement.js";
import type { QuestConfig } from "./quest.js";
import type { EnemyConfig, MoveConfig, PlaceConfig, StatusConfig } from "./combat.js";
import type { GatheringConfig } from "./gathering.js";
import type { CraftingConfig } from "./crafting.js";
export interface DbGuild {
    id: number;
    discord_guild_id: string;
    name: string | null;
    icon_url: string | null;
    created_at: string;
    config: GuildConfig | null;
    /** Set while the bot is not in the guild; cleared when it rejoins. */
    removed_at: string | null;
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
    type: "assignRole" | "removeRole" | "sendMessage" | "giveGold" | "giveItem" | "giveCombatXp";
    roleId?: string; // for assignRole/removeRole
    message?: string; // for sendMessage
    channelId?: string; // for sendMessage
    amount?: number; // for giveGold/giveCombatXp
    itemId?: string; // for giveItem
    quantity?: number; // for giveItem, default 1
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
    cooldownOverride?: number;   // text channels only
    minMinutesOverride?: number; // voice channels only
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
        /** Banner cards for RPG level-ups. Unset means on. */
        /** On unless false; `channelId` also posts a copy there. */
        levelUpCards?: { combat?: boolean; skills?: boolean; channelId?: string | null };
        /** One-time tips for new players (player/tips.ts); on unless false. */
        tips?: boolean;
        /** Fights drawn as a scene image (ui/canvas/battleScene.ts); on unless false. */
        battleScenes?: boolean;
    },
    combat: {
        enabled: boolean;
        /** Combat level's own curve and cap, separate from chat levels. */
        curve?: { maxLevel: number; curveType: "linear" | "exponential" | "polynomial" | "logarithmic"; curveParams: Record<string, number> };
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
        /**
         * Stats added per chat level, on top of the Combat-level stats: chatting
         * makes you a bit stronger (leveling feeds the RPG, never the reverse).
         * Kept well below the per-Combat-level values so fighting stays the way up.
         */
        chatBonus?: { hp?: number; atk?: number; def?: number; spd?: number; crit?: number };
        enemies?: Record<string, EnemyConfig>;
        /** HP refills fully over `regenMinutes` (120); a loss leaves you at `respawnPercent` of max (25). */
        hp?: { regenMinutes?: number; respawnPercent?: number };
        /**
         * Others joining a fight: on unless false; cap, turn timer, enemy HP added per extra player (%),
         * and whether joiners must be in the enemy's Combat level range (on unless false), so nobody gets carried.
         */
        /** Enemies below your Combat level range pay less XP: `perLevel`% less for each level over, never below `floor`%. On unless enabled is false. */
        easyXp?: { enabled?: boolean; perLevel?: number; floor?: number };
        party?: { enabled?: boolean; maxPlayers?: number; turnSeconds?: number; hpPerExtraPlayer?: number; levelRange?: boolean };
        /** Places: channels mapped to enemy pools (types/combat.ts PlaceConfig). */
        places?: Record<string, PlaceConfig>;
        /** Lets anyone pick an enemy with /fight's option; managers always can. Off: /fight rolls from where you are. */
        allowEnemyChoice?: boolean;
        /** Fights in channels outside any place: "channel" (default) or "thread". */
        fightsIn?: "thread" | "channel";
        /** Fight moves, players' and enemies'. Unset means the built-in Attack / Heavy Strike / Guard. */
        moves?: Record<string, MoveConfig>;
        /** Lasting effects moves can put on: Bleeding, Poisoned... Unset means the built-in set. */
        statuses?: Record<string, StatusConfig>;
        pveDeathPenalty?: {
            goldPercent?: number;   // % of current gold lost (e.g. 5 = 5%). Default: 0
            goldFlat?: number;      // minimum flat gold lost regardless of percent. Default: 0
            xpPercent?: number;     // % of current XP lost. Default: 0 (not recommended)
        };
        pvpDeathPenalty?: {
            goldPercent?: number;
            goldFlat?: number;
            xpPercent?: number;
        };
        pvp?: {
            enabled?: boolean;
            minWager?: number;
            maxWager?: number;
            /** Cut of the pot removed from circulation. The only part of a duel that is a sink. */
            rakePercent?: number;
            challengeTimeoutSeconds?: number;
            /** Duels stop here and are called a draw, so two tanks cannot loop forever. */
            maxRounds?: number;
            /** How long a member must wait after finishing a duel before starting another. */
            cooldownSeconds?: number;
        };
        /** Wild enemies that turn up while people chat; see player/encounters.ts. */
        encounters?: {
            enabled?: boolean;
            /** Chance per XP-earning message, in percent (2 = 2%). */
            chancePercent?: number;
            /** Minimum gap between two encounters in the same server. */
            cooldownSeconds?: number;
            /** How long an unclaimed encounter waits before it leaves. */
            fleeSeconds?: number;
            /** Channels encounters may appear in. Empty means any channel that gives XP. */
            channelIds?: string[];
        };
        /** World bosses; see player/bosses.ts. Bosses themselves are enemies with `boss: true`. */
        bosses?: {
            /** Lets bosses spawn on their own. /boss summon works either way. */
            enabled?: boolean;
            /** Chance per XP-earning message, in percent. */
            chancePercent?: number;
            /** Minimum gap between two random boss spawns in the same server. */
            cooldownSeconds?: number;
            /** How long the server has to kill it before it escapes. */
            durationSeconds?: number;
            /** How often one member can attack. */
            attackCooldownSeconds?: number;
            /** Channels random bosses may appear in. Empty means any channel that gives XP. */
            channelIds?: string[];
        };
    },
    xp: {
        /**
         * havocish's own leveling: chat and voice XP, daily XP, level-ups and the
         * chat-level stat bonus. Off for servers that keep another leveling bot;
         * the RPG runs either way, gated by that bot's roles through Requirements.
         */
        enabled: boolean;
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
        achievements: Record<string, AchievementConfig>;
        announceAllId: string | null;
        announceMessage: string | null;
    },
    quests: {
        enabled: boolean;
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
    },
    gathering: GatheringConfig;
    crafting: CraftingConfig;
    /** Announces rare items as they're found or made (ui/rareFinds.ts). Off without a channel. */
    rareFinds?: { channelId?: string | null; minRarity?: ItemRarity };
    /**
     * Rewards for getting a role, from any source: another leveling bot's level
     * roles, a booster role, a role a mod hands out. Paid once per member per role.
     */
    roleRewards?: {
        /** Where "@member got the @Role reward" is posted. Unset: rewards arrive quietly. */
        channelId?: string | null;
        /** Role id → rewards. Only giveGold, giveItem and giveCombatXp apply. */
        roles: Record<string, LevelAction[]>;
    };
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
        // Tuned for fighting: about 60 early fights to Combat 10, a few hundred to 30, a long road to 99.
        curve: { maxLevel: 99, curveType: "polynomial", curveParams: { factor: 15, degree: 2.2 } },
        hpBase: 100,
        hpPerLevel: 10,
        attackBase: 10,
        attackPerLevel: 2,
        defenseBase: 5,
        defensePerLevel: 1,
        speedBase: 5,
        speedPerLevel: 1,
        // Percentage points (combat rolls against 0-100), so 5 means a 5% chance.
        critChanceBase: 5,
        critChancePerLevel: 0.5,
        critMultiplierBase: 1.5,
        critMultiplierPerLevel: 0.1,
        chatBonus: { hp: 2, atk: 0.5 },
        enemies: {},
        pvp: {
            enabled: false,
            minWager: 0,
            maxWager: 0,
            rakePercent: 0,
            challengeTimeoutSeconds: 120,
            maxRounds: 50,
            // Without one, a stronger member can re-challenge a weaker one back to back.
            cooldownSeconds: 300,
        },
    },
    xp: {
        enabled: true,
        // The wizard's Standard pace (web/app/lib/setupWizard.ts): level 10 is
        // about 1,250 XP-earning messages, so levels and gear feel earned.
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
        achievements: {},
        announceAllId: null,
        announceMessage: null,
    },
    quests: {
        enabled: false,
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
        curveType: "polynomial",
        curveParams: { factor: 78, degree: 2 },
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
    },
    gathering: {
        enabled: false,
        // About 25 runs to skill 10 and 400 to skill 50, at roughly 20 skill XP a run.
        skill: { maxLevel: 50, curveType: "polynomial", curveParams: { factor: 13, degree: 1.62 } },
        activities: {},
    },
    // Crafting skills share gathering's skill curve (gathering.skill).
    crafting: {
        enabled: false,
        stations: {},
    },
};