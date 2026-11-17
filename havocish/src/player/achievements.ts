import type { PendingProfileChanges } from "../types/cache.js";
import { combatXp } from "./combatLevel.js";
import type { GuildConfig } from "../types/guild.js";
import type { DbUserGuildProfile } from "../types/userprofile.js";
import type { AchievementConfig, AchievementCondition, AchievementCheckArgs, AchievementCheckResult, AchievementRewardEffects } from "../types/achievement.js";
import type { Client, GuildMember, MessageMentionOptions, TextChannel, TextBasedChannel } from "discord.js";
import { bestEffort } from "../ui/bestEffort.js";
import { mentionsFor } from "../ui/mentions.js";
import { announcer, speak, speaker, type Speaker } from "../ui/characters.js";
import { checkRequirements, memberFacts, type MemberFacts } from "./requirements.js";
import { getOrCreateGuildConfig } from "../cache/guildService.js";
import { getOrCreateDbUser } from "../cache/userService.js";
import { commitProfileChanges, getOrCreateProfile } from "../cache/profileService.js";
import { userGuildProfileCache } from "../cache/caches.js";
import { query } from "../db/index.js";

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
    const { facts } = args;

    const achievementsConfig = config.achievements ?? { enabled: false, achievements: {} };
    const unlockedAchievements: AchievementConfig[] = [];

    if (!achievementsConfig.enabled) {
        return { profile, pending, unlockedAchievements };
    }

    const unlockedMap = profile.achievements ?? {};
    const nowIso = new Date().toISOString();
    let rearmed = false;

    for (const [achievementId, achievement] of Object.entries(achievementsConfig.achievements)) {
        const entry = unlockedMap[achievementId];
        if (entry?.unlockedAt) {
            continue;
        }

        const condition: AchievementCondition = achievement.conditions;
        const req = achievement.requirements;
        // null: can't tell (it has requirements, and this path has no member details).
        let qualifies: boolean | null = true;
        if (condition.type === "requirements") {
            // Nothing set must not mean everyone gets it.
            if (!req || !Object.keys(req).length) qualifies = false;
        } else if (!compare(condition.operator, getConditionCurrentValue(condition, profile), condition.value)) {
            qualifies = false;
        }
        if (qualifies && req) qualifies = facts ? checkRequirements(req, { profile, config, facts }).ok : null;

        // Reset while they still qualified: wait until they don't, then it can unlock again.
        if (entry?.waiting) {
            if (qualifies === false) {
                delete unlockedMap[achievementId];
                rearmed = true;
            }
            continue;
        }
        if (!qualifies) continue;

        unlockedAchievements.push(achievement);
        unlockedMap[achievementId] = { unlockedAt: nowIso };
    }

    if (unlockedAchievements.length > 0 || rearmed) {
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

        // Combat XP: achievements are part of the RPG, so they never pay chat XP.
        if (reward.xp && reward.xp > 0) {
            totalXp += reward.xp;
            stats.combat = { xp: combatXp(profile) + reward.xp };
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

export async function runAchievementPipeline(args: {profile: DbUserGuildProfile; pending: PendingProfileChanges; config: GuildConfig; facts?: MemberFacts | undefined;}):  Promise<{ profile: DbUserGuildProfile; pending: PendingProfileChanges; unlocked: AchievementConfig[]; rewards: AchievementRewardEffects | null; }> {
    let { profile, pending, config } = args;

    const evalRes = evaluateAchievements({ profile, pending, config, facts: args.facts });
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

async function safeSend(channel: TextBasedChannel | null, content: string, allowedMentions: MessageMentionOptions, who: Speaker | null) {
    if (!channel) return;
    if (!content?.trim()) return;
    await bestEffort("achievement announcement", speak(channel as TextChannel, who, { content, allowedMentions }));
}

export async function applyAchievementSideEffects(args: { client: Client; discordGuildId: string; discordUserId: string; member?: GuildMember | null; channelIdHint?: string | null; config: GuildConfig; unlocked: AchievementConfig[]; rewards: RewardEffectsLike | null;}) {
    const { client, discordGuildId, discordUserId, member, channelIdHint, config, unlocked, rewards } = args;

    const guild = client.guilds.cache.get(discordGuildId) ?? null;
    if (!guild) return;

    const userMention = `<@${discordUserId}>`;
    const pings = await mentionsFor(discordGuildId, discordUserId);

    const globalChannelId = config.achievements?.announceAllId ?? null;
    const globalTemplate = config.achievements?.announceMessage ?? null;

    for (const ach of unlocked) {
        const channelId = (ach.overrideChannelId ?? null) ?? globalChannelId ?? channelIdHint ?? null;
        const template = (ach.overrideAnnouncement ?? null) ?? globalTemplate ?? null;
        if (!channelId || !template) continue;

        const ch = await guild.channels.fetch(channelId).catch(() => null);
        const textCh = ch && ch.isTextBased() ? ch : null;

        await safeSend(textCh, formatTemplate(template, { userMention, achievement: ach }), pings, announcer(config));
    }

    if (rewards?.messages?.length) {
        for (const m of rewards.messages) {
        const ch = await guild.channels.fetch(m.channelId).catch(() => null);
        const textCh = ch && ch.isTextBased() ? ch : null;

        await safeSend(textCh, formatTemplate(m.message, { userMention }), pings, announcer(config));
        }
    }

    if (member && rewards?.grantedRoles?.length) {
        for (const roleId of rewards.grantedRoles) {
        await member.roles.add(roleId).catch(() => null);
        }
    }
}

/**
 * Unlocks achievements that wait on a member's roles, when those roles change:
 * another bot handing out a level role unlocks "Reached Bard" straight away.
 * (Members who already held the role get it from their next message that earns XP.)
 */
export async function checkRoleAchievements(member: GuildMember) {
    if (member.user.bot) return;
    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId: member.guild.id });
    // Checked first: on a big server this runs for every role change, and most servers have none of these.
    if (!config.achievements?.enabled || !Object.values(config.achievements.achievements).some((a) => a.requirements)) return;

    const { user } = await getOrCreateDbUser({ discordUserId: member.id, username: member.user.username });
    const cached = await getOrCreateProfile({ userId: user.id, guildId: guild.id });
    const baseline = { xp: cached.profile.xp, gold: cached.profile.gold };
    const pendingIn = cached.pendingChanges ?? {} as PendingProfileChanges;
    const res = await runAchievementPipeline({ profile: cached.profile, pending: pendingIn, config, facts: memberFacts(member) });
    // A new pending object means an unlock, or a reset achievement re-arming (they lost the role).
    if (res.pending === pendingIn) return;
    commitProfileChanges({ userId: user.id, guildId: guild.id, profile: res.profile, changes: res.pending, baseline });
    if (!res.unlocked.length) return;
    await applyAchievementSideEffects({
        client: member.client, discordGuildId: member.guild.id, discordUserId: member.id, member, config, unlocked: res.unlocked,
        rewards: res.rewards ? { grantedRoles: res.rewards.grantedRoles, messages: res.rewards.messages } : null,
    });
}

/** Everyone who has the achievement unlocked: the DB, plus unlocks still only in the cache. */
export async function achievementHolders(guildId: number, achievementId: string): Promise<number[]> {
    const res = await query<{ user_id: number }>(
        `SELECT user_id FROM user_guild_profiles WHERE guild_id = $1 AND achievements -> $2 ? 'unlockedAt'`, [guildId, achievementId],
    );
    const ids = new Set(res.rows.map((r) => Number(r.user_id)));
    // A cached profile is newer than its row (writes flush later), so it wins.
    for (const [key, c] of userGuildProfileCache) {
        if (!key.startsWith(`${guildId}:`)) continue;
        const userId = Number(c.profile.user_id);
        if (c.profile.achievements?.[achievementId]?.unlockedAt) ids.add(userId);
        else ids.delete(userId);
    }
    return [...ids];
}

/**
 * Lets an achievement be earned again (/admin reset-achievement). Rewards
 * already paid stay paid. Each one is left `waiting`: it unlocks again only
 * after the member stops qualifying and qualifies again (loses the role and
 * gets it back), never straight away. Returns how many were reset.
 */
export async function resetAchievement(opts: { guildId: number; achievementId: string; userIds: number[] }): Promise<number> {
    const { guildId, achievementId, userIds } = opts;
    let count = 0;
    for (const userId of userIds) {
        const cached = await getOrCreateProfile({ userId, guildId });
        const p = cached.profile;
        if (!p.achievements?.[achievementId]?.unlockedAt) continue;
        p.achievements = { ...p.achievements, [achievementId]: { waiting: true } };
        commitProfileChanges({
            userId, guildId, profile: p,
            changes: { ...(cached.pendingChanges ?? {}), achievements: p.achievements },
            baseline: { xp: p.xp, gold: p.gold },
        });
        count++;
    }
    return count;
}
