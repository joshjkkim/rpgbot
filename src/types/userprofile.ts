import type { QueryResultRow } from "pg";

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
}