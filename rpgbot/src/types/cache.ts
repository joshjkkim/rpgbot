import type { DbUser } from "./dbuser.js"
import type { DbGuild, GuildConfig } from "./guild.js";
import type { UserQuestState } from "./quest.js";
import type { item, TempRoleState, UserStats, DbUserGuildProfile } from "./userprofile.js";

export interface CachedUserId {
    user: DbUser;
    lastRefreshed: number;
}

export interface CachedGuildConfig {
    guild: DbGuild;
    config: GuildConfig 
    lastLoaded: number;
}

export interface PendingProfileChanges {
    xp?: string;              // bigint comes back as string
    level?: number;
    gold?: string;
    streak_count?: number;
    last_daily_at?: string | null;
    last_message_at?: string | null;
    inventory?: Record<string, item>;
    temp_roles?: Record<string, TempRoleState>;
    user_stats?: UserStats;
    achievements?: Record<string, { unlockedAt: string; progress?: number;}>;
    quests?: Record<string, UserQuestState>; 
}
export interface CachedUserGuildProfile {
    profile: DbUserGuildProfile;
    pendingChanges?: PendingProfileChanges | undefined;
    dirty?: boolean;
    lastWroteToDb?: number | undefined;
    lastLoaded: number;
}