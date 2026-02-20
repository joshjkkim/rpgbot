import type { GuildConfig } from "./guild.js";
import type { DbUserGuildProfile } from "./userprofile.js";
import type { PendingProfileChanges } from "./cache.js";

export type QuestCondition =
  | { type: "messages"; target: number; channelIds?: string[] }
  | { type: "vcMinutes"; target: number; channelIds?: string[] }
  | { type: "spendGold"; target: number }
  | { type: "earnXp"; target: number }
  | { type: "dailyClaim"; target: number };

export type QuestEvent =
  | { type: "message"; guildId: string; userId: string; channelId: string }
  | { type: "vcMinute"; guildId: string; userId: string; channelId: string; minutes: number }
  | { type: "spendGold"; guildId: string; userId: string; amount: number }
  | { type: "earnXp"; guildId: string; userId: string; amount: number }
  | { type: "dailyClaim"; guildId: string; userId: string };

export type QuestNotify = {
  quest: QuestConfig;
  message: string;
  channelId?: string | null; // optional if you later want public announce
};

export interface QuestReward {
    xp?: number;
    gold?: number;
    itemId?: string;
    quantity?: number;
    roleId?: string;
    message?: string;
    channelId?: string;
}

export interface QuestConfig {
    id: string;
    name: string;
    description: string;
    conditions: QuestCondition;
    reward?: QuestReward;
    active: boolean;
    cooldown: number; // in seconds
    overrideChannelId?: string | null;
    overrideAnnouncement?: string | null;
}

export interface QuestCheckArgs {
    profile: DbUserGuildProfile;
    pending: PendingProfileChanges;
    config: GuildConfig;
}

export interface QuestCheckResult {
    profile: DbUserGuildProfile;
    pending: PendingProfileChanges;
    unlockedQuests: QuestConfig[];
}

export interface QuestRewardEffects {
    profile: DbUserGuildProfile;
    pending: PendingProfileChanges;
    totalXp: number;
    totalGold: number;
    grantedItems: { itemId: string; quantity: number }[];
    grantedRoles: string[];
    messages: { channelId: string; message: string }[];
}

export type UserQuestState = {
  acceptedAt: string | null;
  progress: number;
  completedAt: string | null;
  claimedAt: string | null;
};