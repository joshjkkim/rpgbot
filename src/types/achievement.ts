import type { GuildConfig } from "./guild.js";
import type { DbUserGuildProfile } from "./userprofile.js";
import type { PendingProfileChanges } from "./cache.js";

export interface AchievementCondition {
    type: "stat" | "level" | "xp" | "gold" | "streak";
    statKey?: string;
    operator: ">=" | "<=" | "==" | ">" | "<" | "!=";
    value: number;
}

export interface AchievementReward {
    xp?: number;
    gold?: number;
    itemId?: string;
    quantity?: number;
    roleId?: string;
    message?: string;
    channelId?: string;
}

export interface AchievementConfig {
    id: string;
    name: string;
    description: string;
    category: "xp" | "social" | "daily" | "economy" | "vc" | "misc";
    conditions: AchievementCondition;
    reward?: AchievementReward;
    secret?: boolean;
    overrideChannelId?: string | null;
    overrideAnnouncement?: string | null;
}

export interface AchievementCheckArgs {
    profile: DbUserGuildProfile;
    pending: PendingProfileChanges;
    config: GuildConfig;
}

export interface AchievementCheckResult {
    profile: DbUserGuildProfile;
    pending: PendingProfileChanges;
    unlockedAchievements: AchievementConfig[];
}

export interface AchievementRewardEffects {
    profile: DbUserGuildProfile;
    pending: PendingProfileChanges;
    totalXp: number;
    totalGold: number;
    grantedItems: { itemId: string; quantity: number }[];
    grantedRoles: string[];
    messages: { channelId: string; message: string }[];
}
