import type { QuestEvent, QuestConfig, UserQuestState, QuestRewardEffects, QuestNotify } from "../types/quest.js";
import type { DbUserGuildProfile, item } from "../types/userprofile.js";
import type { PendingProfileChanges } from "../types/cache.js";
import type { GuildConfig } from "../types/guild.js";
import type { TextBasedChannel, Client, TextChannel, GuildMember } from "discord.js";

function questTarget(cond: any): number {
  return cond.target ?? cond.value ?? 0; // support your existing naming
}

export function canStartQuest(state: UserQuestState | undefined, qc: QuestConfig, nowMs: number) {
  if (state?.acceptedAt && !state?.completedAt) return { ok: false, reason: "already_active" as const };
  if (state?.completedAt && !state?.claimedAt) return { ok: false, reason: "needs_claim" as const };

  const { onCooldown, readyAt } = getRepeatCooldown(state, qc, nowMs);
  if (onCooldown) return { ok: false, reason: "cooldown" as const, readyAt };

  return { ok: true, reason: null, readyAt: null } as const;
}


function getRepeatCooldown(state: UserQuestState | undefined, qc: QuestConfig, nowMs: number) {
  const claimedAtMs = state?.claimedAt ? new Date(state.claimedAt).getTime() : null;
  if (!claimedAtMs) return { onCooldown: false, readyAt: null };

  const readyAt = claimedAtMs + (qc.cooldown ?? 0) * 1000;
  return { onCooldown: nowMs < readyAt, readyAt };
}


function eventMatchesCondition(ev: QuestEvent, cond: any): number {
  // Returns how much to increment progress by (delta), or 0 if no match
  console.log(cond.type && ev.type && `Checking event type ${ev.type} against condition type ${cond.type}`);
  switch (cond.type) {
    case "messages": {
      if (ev.type !== "message") return 0;
      if (cond.channelIds?.length && !cond.channelIds.includes(ev.channelId)) return 0;
      return 1;
    }
    case "vcMinutes": {
      if (ev.type !== "vcMinute") return 0;
      if (cond.channelIds?.length && !cond.channelIds.includes(ev.channelId)) return 0;
      return ev.minutes ?? 1;
    }
    case "spendGold": {
      if (ev.type !== "spendGold") return 0;
      return ev.amount;
    }
    case "earnXp": {
      if (ev.type !== "earnXp") return 0;
      return ev.amount;
    }
    case "dailyClaim": {
      if (ev.type !== "dailyClaim") return 0;
      return 1;
    }
    default:
      return 0;
  }
}

export function applyQuestEvent(args: {
  profile: DbUserGuildProfile;
  pending: PendingProfileChanges;
  config: GuildConfig;
  event: QuestEvent;
}): { profile: DbUserGuildProfile; pending: PendingProfileChanges; completedQuestIds: string[] } {
  let { profile, pending, config, event } = args;

  const questsCfg = config.quests?.quests ?? {};
  if (!config.quests?.enabled) return { profile, pending, completedQuestIds: [] };

  const userMap = (profile.quests ?? {}) as Record<string, any>;
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  const completedQuestIds: string[] = [];

  for (const [questId, state] of Object.entries(userMap)) {
    const qc = questsCfg[questId];
    if (!qc) continue;
    if (qc.active === false) continue;

    // must be accepted + not completed
    if (!state?.acceptedAt) continue;
    if (state?.completedAt) continue;

    // optional: cooldown anti-spam per quest condition (messages)
    // (better to do globally, but this is a simple hook)

    const cond = qc.conditions;
    console.log(qc, qc.conditions)
    const delta = eventMatchesCondition(event, cond);
    if (delta <= 0) continue;

    // increment
    const prev = typeof state.progress === "number" ? state.progress : 0;
    const next = prev + delta;
    state.progress = next;
    console.log(`Quest ${questId} progress: ${prev} -> ${next}`);

    // completion
    const target = questTarget(cond);
    if (target > 0 && next >= target) {
      state.completedAt = nowIso;
      completedQuestIds.push(questId);

    }
  }

  // write back if changed
  profile = { ...profile, quests: userMap };
  pending = { ...pending, quests: userMap };

  return { profile, pending, completedQuestIds };
}

export function applyQuestRewards(args: {
  profile: DbUserGuildProfile;
  pending: PendingProfileChanges;
  quest: QuestConfig;
  config: GuildConfig;
}): QuestRewardEffects {
  let { profile, pending, quest, config } = args;

  const reward = quest.reward;
  let totalXp = 0;
  let totalGold = 0;
  const grantedItems: { itemId: string; quantity: number }[] = [];
  const grantedRoles: string[] = [];
  const messages: { channelId: string; message: string }[] = [];

  if (!reward) {
    return { profile, pending, totalXp, totalGold, grantedItems, grantedRoles, messages };
  }

  // init stats bucket if you want (optional)
  const stats = (profile.user_stats ?? {}) as any;
  profile.user_stats = stats;

  // XP
  if (reward.xp && reward.xp > 0) {
    totalXp += reward.xp;
    const currentXp = BigInt(profile.xp ?? "0");
    profile.xp = (currentXp + BigInt(reward.xp)).toString();
  }

  // Gold
  if (reward.gold && reward.gold > 0) {
    totalGold += reward.gold;
    const currentGold = BigInt(profile.gold ?? "0");
    profile.gold = (currentGold + BigInt(reward.gold)).toString();
  }

  // Item
  if (reward.itemId && (reward.quantity ?? 0) > 0) {
    const inventory = profile.inventory ?? {};
    const qty = reward.quantity ?? 0;

    const itemDef = config.shop?.items?.[reward.itemId] ?? null;
    if (itemDef) {
      const currentQty = inventory[itemDef.id]?.quantity ?? 0;
      inventory[itemDef.id] = {
        id: itemDef.id,
        name: itemDef.name,
        emoji: itemDef.emoji ?? "",
        description: itemDef.description ?? "",
        quantity: currentQty + qty,
      } as item;

      profile.inventory = inventory;
      grantedItems.push({ itemId: itemDef.id, quantity: qty });
    }
  }

  // Role + message are side-effects (we *collect* them here)
  if (reward.roleId) grantedRoles.push(reward.roleId);

  // channelId/message: allow quest-level overrideChannelId too
  const chId = reward.channelId ?? quest.overrideChannelId ?? null;
  if (reward.message && chId) messages.push({ channelId: chId, message: reward.message });

  pending = {
    ...pending,
    xp: profile.xp,
    gold: profile.gold,
    inventory: profile.inventory,
    user_stats: profile.user_stats,
  };

  return { profile, pending, totalXp, totalGold, grantedItems, grantedRoles, messages };
}

async function safeSend(channel: TextBasedChannel | null, content: string) {
  if (!channel) return;
  if (!content?.trim()) return;
  await (channel as TextChannel).send({ content });
}

function formatTemplate(template: string, args: { userMention: string }) {
  return template.replaceAll("{user}", args.userMention);
}

export async function applyQuestSideEffects(args: {
  client: Client;
  discordGuildId: string;
  discordUserId: string;
  member?: GuildMember | null;
  channelIdHint?: string | null;
  config: GuildConfig;
  rewards: { grantedRoles: string[]; messages: { channelId: string; message: string }[] } | null;
}) {
  const { client, discordGuildId, discordUserId, member, rewards } = args;
  if (!rewards) return;

  const guild = client.guilds.cache.get(discordGuildId) ?? null;
  if (!guild) return;

  const userMention = `<@${discordUserId}>`;

  if (rewards.messages?.length) {
    for (const m of rewards.messages) {
      const ch = await guild.channels.fetch(m.channelId).catch(() => null);
      const textCh = ch && ch.isTextBased() ? ch : null;
      await safeSend(textCh, formatTemplate(m.message, { userMention }));
    }
  }

  if (member && rewards.grantedRoles?.length) {
    for (const roleId of rewards.grantedRoles) {
      await member.roles.add(roleId).catch(() => null);
    }
  }
}

export async function runQuestPipeline(args: {
    profile: DbUserGuildProfile;
    pending: PendingProfileChanges;
    config: GuildConfig;
    event: QuestEvent;
}): Promise<{
  profile: DbUserGuildProfile;
  pending: PendingProfileChanges;
  completed: QuestConfig[];
  notifications: QuestNotify[];
}> {
  let { profile, pending, config, event } = args;

  const res = applyQuestEvent({ profile, pending, config, event });
  profile = res.profile;
  pending = res.pending;

  if(!res.completedQuestIds.length) {
    return { profile, pending, completed: [], notifications: [] };
  }

  const questDefs = config.quests?.quests ?? {};
  const completed: QuestConfig[] = res.completedQuestIds
    .map(id => questDefs[id])
    .filter((q): q is QuestConfig => Boolean(q));

  const notifications: QuestNotify[] = completed.map(q => ({
    quest: q,
    message: q.overrideAnnouncement ?? `You have completed the quest: ${q.name}!`,
    channelId: q.overrideChannelId ?? null,
  }));

  return { profile, pending, completed, notifications };
}

