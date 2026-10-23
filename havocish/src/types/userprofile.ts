import type { GatheringProgress } from "./gathering.js";
import type { CraftingProgress } from "./crafting.js";
import type { QueryResultRow } from "pg";
import type { UserQuestState } from "./quest.js";

export interface UserStats {
    messagesSent: number;
    itemsPurchased: number;
    itemsUsed: number;
    goldFromDailies: number;
    goldFromItems: number;
    goldFromAchievements: number;
    goldEarned: number;
    goldSpent: number;
    xpFromMessages: number;
    xpFromDaily: number;
    xpFromVC: number;
    xpFromItems: number;
    xpFromAchievements: number;
    dailiesClaimed: number;
    maxStreak: number;
    timeSpentInVC: number; // in seconds

    currentHp: number;
    /** When currentHp was set; regen counts from here (player/combat.ts). */
    hpAt?: string;
    enemiesDefeated: number;
    fightsWon: number;
    fightsLost: number;
    totalDamageDealt: number;
    totalDamageTaken: number;

    /** ISO timestamp of the last duel this member finished, for the duel cooldown. */
    lastDuelAt?: string | null;
    duelsWon?: number;
    duelsLost?: number;

    /** Skill XP, cooldown and run count per gathering activity. */
    gathering?: GatheringProgress;
    /** Skill XP, craft count and learned hidden recipes per crafting station. */
    crafting?: CraftingProgress;
    /** Combat XP. Missing means "not split off yet": combatLevel.ts starts it from chat XP. */
    combat?: { xp: number };
    /** Role ids whose role reward this member has had, so re-adding a role pays nothing. */
    roleRewards?: string[];
    /** What they bought today, for items with a daily limit (db/shop.ts). */
    boughtToday?: { day: string; items: Record<string, number> };
    /** Every item this member has ever had: their collection (see cache/profileService.ts). */
    found?: string[];
    /** One-time tips this member has had (player/tips.ts). */
    tips?: string[];
    /** Fight moves: the ones learned from scrolls, and the up-to-four picked in /moves. */
    moves?: { learned?: string[]; loadout?: string[] };
}
export interface item {
    id: string;
    name: string;
    emoji?: string;
    description?: string;
    quantity: number;
}

export interface TempRoleState {
    expiresAt: string; // ISO date string
    source?: "item" | "command";
    sourceId?: string;
}
export interface DbUserGuildProfile extends QueryResultRow {
    id: number;
    user_id: number;
    guild_id: number;
    xp: string;              // bigint comes back as string
    level: number;
    gold: string;
    streak_count: number;
    last_daily_at: string | null;
    last_message_at: string | null;
    inventory: Record<string, item>;
    temp_roles: Record<string, TempRoleState>;
    user_stats: UserStats;
    achievements: Record<string, { unlockedAt: string; progress?: number;}>;
    quests: Record<string, UserQuestState>; // questId -> UserQuestState
    equips: {
        head?: string;
        body?: string;
        legs?: string;
        feet?: string;
        hands?: string;
        weapon?: string;
        shield?: string;
        accessory?: string;
        aura?: string;
    };
    settings: {
        inventoryPrivate?: boolean;
        goldPrivate?: boolean;
        xpPrivate?: boolean;
        dmOnTradeInbound?: boolean;
        /** Quiet: announcements about them still post, but never ping them. */
        quiet?: boolean;
        profilePrivate?: boolean;
    }
}