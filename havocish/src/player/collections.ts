import type { Client } from "discord.js";
import type { CollectionConfig, CollectionEntry, GuildConfig, LevelAction } from "../types/guild.js";
import type { DbUserGuildProfile } from "../types/userprofile.js";
import { commitProfileChanges, getOrCreateProfile } from "../cache/profileService.js";
import { applyRewards } from "./levelRewards.js";
import { bestEffort } from "../ui/bestEffort.js";
import { mentionsFor } from "../ui/mentions.js";
import { getOrCreateDbUser } from "../cache/userService.js";
import { getOrCreateGuildConfig } from "../cache/guildService.js";
import { announcer, speak } from "../ui/characters.js";

/**
 * Collections: owner-made groups of items to find and enemies to defeat, like
 * "Ores & Gems" or a bestiary. Progress reads what's already recorded (items
 * found, enemies defeated); rewards come at owner-set milestones, each paid
 * once, so the first one never needs the whole set.
 */

export function collectionSets(config: GuildConfig): CollectionConfig[] {
    return Object.values(config.collections?.sets ?? {});
}

/** Whether one entry is done for this member. A deleted item or enemy never counts. */
export function entryDone(e: CollectionEntry, profile: DbUserGuildProfile, config: GuildConfig): boolean {
    if (e.kind === "item") return !!config.shop?.items?.[e.id] && (profile.user_stats?.found ?? []).includes(e.id);
    return !!config.combat?.enemies?.[e.id] && (profile.user_stats?.defeated ?? []).includes(e.id);
}

/** The entries that still exist, and how many are done. */
export function setProgress(set: CollectionConfig, profile: DbUserGuildProfile, config: GuildConfig) {
    const live = (set.entries ?? []).filter((e) => (e.kind === "item" ? config.shop?.items?.[e.id] : config.combat?.enemies?.[e.id]));
    const done = live.filter((e) => entryDone(e, profile, config)).length;
    return { done, total: live.length, complete: live.length > 0 && done >= live.length };
}

/** A milestone's count, where anything at or past the set's size means completing it. */
const target = (at: number, total: number) => Math.min(Math.max(1, at), total);

export function isComplete(setId: string, profile: DbUserGuildProfile, config: GuildConfig): boolean {
    const set = config.collections?.sets?.[setId];
    return !!set && setProgress(set, profile, config).complete;
}

const PAYS = new Set<LevelAction["type"]>(["giveGold", "giveItem", "giveCombatXp"]);

export type MilestonePaid = { set: CollectionConfig; at: number; complete: boolean; given: string[]; roles: string[] };

/**
 * Pays every milestone a member has reached and not been paid for, in one
 * commit, and marks them paid. Returns what was paid, for the announcement;
 * roles to give are left to the caller, which has Discord.
 */
export async function payCollectionMilestones(userId: number, guildId: number, config: GuildConfig): Promise<MilestonePaid[]> {
    const sets = collectionSets(config).filter((s) => s.milestones?.length);
    if (!sets.length) return [];
    const cached = await getOrCreateProfile({ userId, guildId });
    const p = cached.profile;
    const paid = new Set(p.user_stats?.collectionMilestones ?? []);
    const baseline = { xp: p.xp, gold: p.gold };
    const out: MilestonePaid[] = [];
    let changes = {};
    for (const set of sets) {
        const { done, total } = setProgress(set, p, config);
        if (!total) continue;
        for (const m of set.milestones ?? []) {
            const at = target(m.at, total);
            const key = `${set.id}:${at}`;
            if (done < at || paid.has(key)) continue;
            paid.add(key);
            const r = applyRewards(p, config, m.actions.filter((a) => PAYS.has(a.type)));
            changes = { ...changes, ...r.changes };
            out.push({ set, at, complete: at >= total, given: r.given, roles: m.actions.filter((a) => a.type === "assignRole" && a.roleId).map((a) => a.roleId!) });
        }
    }
    if (!out.length) return [];
    const completed = out.filter((x) => x.complete).length;
    p.user_stats = {
        ...(p.user_stats ?? {}), collectionMilestones: [...paid],
        // For achievements: how many collections they've finished.
        ...(completed && { collectionsCompleted: (p.user_stats?.collectionsCompleted ?? 0) + completed }),
    } as typeof p.user_stats;
    commitProfileChanges({
        userId, guildId, profile: p,
        changes: { ...(cached.pendingChanges ?? {}), ...changes, user_stats: p.user_stats },
        baseline,
    });
    return out;
}

/**
 * Checks a member's collections after something that can move them on (a
 * win, a gathering run, a craft, a purchase): pays milestones, gives their
 * roles, and announces them in the collections channel, or `fallbackChannelId`.
 */
export async function checkCollections(opts: {
    client: Client; config: GuildConfig;
    discordUserId: string; discordGuildId: string;
    fallbackChannelId?: string | null;
}): Promise<void> {
    if (!collectionSets(opts.config).some((s) => s.milestones?.length)) return;
    const { user } = await getOrCreateDbUser({ discordUserId: opts.discordUserId });
    const { guild: dbGuild } = await getOrCreateGuildConfig({ discordGuildId: opts.discordGuildId });
    const paid = await payCollectionMilestones(user.id, dbGuild.id, opts.config);
    if (!paid.length) return;
    const guild = opts.client.guilds.cache.get(opts.discordGuildId);
    const member = guild ? await guild.members.fetch(opts.discordUserId).catch(() => null) : null;
    for (const roleId of paid.flatMap((x) => x.roles)) await member?.roles.add(roleId).catch(() => null);

    const lines = paid.map(({ set, at, complete, given, roles }) => {
        const what = [...given, ...roles.map((r) => `<@&${r}>`)];
        const head = complete
            ? `📖 <@${opts.discordUserId}> completed **${set.emoji} ${set.name}**!`
            : `📖 <@${opts.discordUserId}> reached ${at} in **${set.emoji} ${set.name}**.`;
        return what.length ? `${head} ${what.join(", ")}` : head;
    });
    const channelId = opts.config.collections?.channelId || opts.fallbackChannelId;
    if (!channelId) return;
    const channel = await opts.client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased() || !channel.isSendable()) return;
    await bestEffort("collection announcement", speak(channel, announcer(opts.config), {
        content: lines.join("\n"),
        allowedMentions: await mentionsFor(opts.discordGuildId, opts.discordUserId, { users: [opts.discordUserId] }),
    }));
}
