import type { PendingProfileChanges } from "../types/cache.js";
import type { GuildConfig } from "../types/guild.js";
import type { DbUserGuildProfile } from "../types/userprofile.js";
import type { AchievementConfig, AchievementCondition, AchievementCheckArgs, AchievementCheckResult, AchievementRewardEffects } from "../types/achievement.js";
import type { Client, GuildMember, TextChannel, TextBasedChannel } from "discord.js";

function getConditionCurrentValue(condition: AchievementCondition, profile: DbUserGuildProfile): number {
    switch (condition.type) {
        case "stat": {
            const stats = (profile.user_stats ?? {}) as any;
            if (!condition.statKey) return 0;
            return stats[condition.statKey] ?? 0;
        }
        case "level":
            return profile.level;
        case "xp":
            return Number(profile.xp ?? "0");
        case "gold":
            return Number(profile.gold ?? "0");
        case "streak":
            return profile.streak_count ?? 0;
        default:
            return 0;
    }
}

function compare(operator: AchievementCondition["operator"], left: number, right: number): boolean {
  switch (operator) {
    case ">=": return left >= right;
    case "<=": return left <= right;
    case "==": return left === right;
    case "!=": return left !== right;
    case ">":  return left > right;
    case "<":  return left < right;
  }
}

function evaluateAchievements(args: AchievementCheckArgs): AchievementCheckResult {
    let { profile, pending, config } = args;

    const achievementsConfig = config.achievements ?? { enabled: false, achievements: {} };
    const unlockedAchievements: AchievementConfig[] = [];

    if (!achievementsConfig.enabled) {
        return { profile, pending, unlockedAchievements };
    }

    const unlockedMap = profile.achievements ?? {};
    const nowIso = new Date().toISOString();

    for (const [achievementId, achievement] of Object.entries(achievementsConfig.achievements)) {
        if (unlockedMap[achievementId]?.unlockedAt) {
            continue;
        }

        const condition: AchievementCondition = achievement.conditions;
        const currentValue = getConditionCurrentValue(condition, profile);

        if (!compare(condition.operator, currentValue, condition.value)) {
            continue;
        }

        unlockedAchievements.push(achievement);
        unlockedMap[achievementId] = { unlockedAt: nowIso };
    }

    if (unlockedAchievements.length > 0) {
        profile = {
            ...profile,
            achievements: unlockedMap,
        };

        pending = {
            ...pending,
            achievements: unlockedMap,
        };
    }

    return { profile, pending, unlockedAchievements };
}

function applyAchievementRewards(args: { profile: DbUserGuildProfile; pending: PendingProfileChanges; unlocked: AchievementConfig[]; config: GuildConfig; }): AchievementRewardEffects {
    let { profile, pending, unlocked, config } = args;

    let totalXp = 0;
    let totalGold = 0;
    const grantedItems: { itemId: string; quantity: number }[] = [];
    const grantedRoles: string[] = [];
    const messages: { channelId: string; message: string }[] = [];

    const stats = (profile.user_stats ?? {}) as any;
    stats.xpFromAchievements = stats.xpFromAchievements ?? 0;
    stats.goldFromAchievements = stats.goldFromAchievements ?? 0;
    profile.user_stats = stats;

    const inventory = profile.inventory ?? {};

    for (const achievement of unlocked) {
        const reward = achievement.reward;
        if (!reward) continue;

        if (reward.xp && reward.xp > 0) {
            totalXp += reward.xp;
            const currentXp = BigInt(profile.xp ?? "0");
            profile.xp = (currentXp + BigInt(reward.xp)).toString();
            stats.xpFromAchievements += reward.xp;
        }

        if (reward.gold && reward.gold > 0) {
            totalGold += reward.gold;
            const currentGold = BigInt(profile.gold ?? "0");
            profile.gold = (currentGold + BigInt(reward.gold)).toString();
            stats.goldFromAchievements += reward.gold;
        }

        if (reward.itemId && reward.quantity) {
            const currentQty = inventory[reward.itemId]?.quantity ?? 0;
            const itemTo = config.shop?.items?.[reward.itemId] ?? null;

            if(!itemTo) {
                continue;
            }

            inventory[itemTo.id] = {
                id: itemTo.id,
                name: itemTo.name,
                emoji: itemTo.emoji ?? "",
                description: itemTo.description ?? "",
                quantity: currentQty + reward.quantity,
            };
            grantedItems.push({ itemId: reward.itemId, quantity: reward.quantity });
        }
        if (reward.roleId) {
            grantedRoles.push(reward.roleId);
        }
        if (reward.message && reward.channelId) {
            messages.push({ channelId: reward.channelId, message: reward.message });
        }
    }

    profile.inventory = inventory;
    profile.user_stats = stats;
    pending = {
        ...pending,
        xp: profile.xp,
        gold: profile.gold,
        user_stats: profile.user_stats,
        inventory: profile.inventory,
    };
    return { profile, pending, totalXp, totalGold, grantedItems, grantedRoles, messages };
}

export async function runAchievementPipeline(args: {profile: DbUserGuildProfile; pending: PendingProfileChanges; config: GuildConfig;}):  Promise<{ profile: DbUserGuildProfile; pending: PendingProfileChanges; unlocked: AchievementConfig[]; rewards: AchievementRewardEffects | null; }> {
    let { profile, pending, config } = args;

    const evalRes = evaluateAchievements({ profile, pending, config });
    profile = evalRes.profile;
    pending = evalRes.pending;

    if (evalRes.unlockedAchievements.length === 0) {
        return { profile, pending, unlocked: [] as AchievementConfig[], rewards: null as AchievementRewardEffects | null };
    }

    const rewards = applyAchievementRewards({ profile, pending, unlocked: evalRes.unlockedAchievements, config });
    profile = rewards.profile;
    pending = rewards.pending;

    return { profile, pending, unlocked: evalRes.unlockedAchievements, rewards };
}

type RewardEffectsLike = {
    grantedRoles: string[];
    messages: { channelId: string; message: string }[];
};

function formatTemplate(template: string, args: { userMention: string; achievement?: AchievementConfig; }) {
    let out = template.replaceAll("{user}", args.userMention);
    if (args.achievement) {
        out = out
        .replaceAll("{achievementName}", args.achievement.name)
        .replaceAll("{achievementDescription}", args.achievement.description);
    }
    return out;
}

async function safeSend(channel: TextBasedChannel | null, content: string) {
    if (!channel) return;
    if (!content?.trim()) return;
    await (channel as TextChannel).send({ content });
}

export async function applyAchievementSideEffects(args: { client: Client; discordGuildId: string; discordUserId: string; member?: GuildMember | null; channelIdHint?: string | null; config: GuildConfig; unlocked: AchievementConfig[]; rewards: RewardEffectsLike | null;}) {
    const { client, discordGuildId, discordUserId, member, channelIdHint, config, unlocked, rewards } = args;

    const guild = client.guilds.cache.get(discordGuildId) ?? null;
    if (!guild) return;

    const userMention = `<@${discordUserId}>`;

    const globalChannelId = config.achievements?.announceAllId ?? null;
    const globalTemplate = config.achievements?.announceMessage ?? null;

    for (const ach of unlocked) {
        const channelId = (ach.overrideChannelId ?? null) ?? globalChannelId ?? channelIdHint ?? null;
        const template = (ach.overrideAnnouncement ?? null) ?? globalTemplate ?? null;
        if (!channelId || !template) continue;

        const ch = await guild.channels.fetch(channelId).catch(() => null);
        const textCh = ch && ch.isTextBased() ? ch : null;

        await safeSend(textCh, formatTemplate(template, { userMention, achievement: ach }));
    }

    if (rewards?.messages?.length) {
        for (const m of rewards.messages) {
        const ch = await guild.channels.fetch(m.channelId).catch(() => null);
        const textCh = ch && ch.isTextBased() ? ch : null;

        await safeSend(textCh, formatTemplate(m.message, { userMention }));
        }
    }

    if (member && rewards?.grantedRoles?.length) {
        for (const roleId of rewards.grantedRoles) {
        await member.roles.add(roleId).catch(() => null);
        }
    }
}
