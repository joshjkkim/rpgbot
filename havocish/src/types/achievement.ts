import type { GuildConfig } from "./guild.js";
import type { DbUserGuildProfile } from "./userprofile.js";
import type { PendingProfileChanges } from "./cache.js";
import type { Requirements } from "./requirements.js";
import type { MemberFacts } from "../player/requirements.js";

export interface AchievementCondition {
    /** "requirements": nothing to count, the achievement's requirements alone unlock it. */
    type: "stat" | "level" | "xp" | "gold" | "streak" | "requirements";
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
    /** Must also hold. Roles are how this reads another leveling bot: it hands out roles at levels. */
    requirements?: Requirements;
    reward?: AchievementReward;
    secret?: boolean;
    overrideChannelId?: string | null;
    overrideAnnouncement?: string | null;
}

export interface AchievementCheckArgs {
    profile: DbUserGuildProfile;
    pending: PendingProfileChanges;
    config: GuildConfig;
    /** The member's roles and so on. Without them, achievements with requirements wait. */
    facts?: MemberFacts | undefined;
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
