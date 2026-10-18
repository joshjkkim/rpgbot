import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, GuildMember, MessageFlags, SectionBuilder, SlashCommandBuilder, TextDisplayBuilder } from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateProfile, commitProfileChanges } from "../../cache/profileService.js";
import { calculateLevelFromXp } from "../../leveling/levels.js";
import { applyQuestRewards, applyQuestSideEffects, canStartQuest } from "../../player/quests.js";
import type { PendingProfileChanges } from "../../types/cache.js";
import type { GuildConfig } from "../../types/guild.js";
import type { QuestConfig, QuestCondition, UserQuestState } from "../../types/quest.js";
import { logAndBroadcastEvent } from "../../db/events.js";
import { ownerSetupRows } from "../../ui/dashboardLinks.js";
import { accentColor, pageOf, pagerButtons } from "../../ui/pager.js";

/**
 * /quests: the quest log. Every quest is a card saying what to do, how far
 * along you are and what it pays, with the button that fits: Accept, Claim,
 * or a disabled In progress / On cooldown. It replaced two embeds of names and
 * Start/Claim buttons that asked members to type the quest's id.
 *
 * Buttons: quests:{accept|claim}:{questId}:{page}, quests:claimall:{page},
 * quests:page:{page}. The log is ephemeral, so whoever clicks owns it.
 */

export const data = new SlashCommandBuilder()
    .setName("quests")
    .setDescription("Your quest log: what to do, your progress and the rewards");

type Status =
    | { kind: "claim" }
    | { kind: "active" }
    | { kind: "available" }
    | { kind: "cooldown"; readyAt: number };

/** Where a member stands on a quest. Order is how the log sorts them. */
export function questStatus(state: UserQuestState | undefined, def: QuestConfig, now: number): Status {
    const claimedAt = state?.claimedAt ? Date.parse(state.claimedAt) : NaN;
    const readyAt = claimedAt + (def.cooldown ?? 0) * 1000;
    if (Number.isFinite(claimedAt) && def.cooldown > 0 && now < readyAt && !state?.acceptedAt) {
        return { kind: "cooldown", readyAt };
    }
    if (state?.completedAt && !state.claimedAt) return { kind: "claim" };
    if (state?.acceptedAt && !state.completedAt) return { kind: "active" };
    return { kind: "available" };
}

const ORDER: Record<Status["kind"], number> = { claim: 0, active: 1, available: 2, cooldown: 3 };

const channels = (ids?: string[]) => (ids?.length ? ` in ${ids.map((id) => `<#${id}>`).join(", ")}` : "");

/** The condition in words: "Send 25 messages in #general". */
export function objective(cond: QuestCondition, config: GuildConfig): string {
    const n = cond.target.toLocaleString();
    switch (cond.type) {
        case "messages": return `Send ${n} messages${channels(cond.channelIds)}`;
        case "vcMinutes": return `Spend ${n} minutes in voice${channels(cond.channelIds)}`;
        case "spendGold": return `Spend ${n} ${config.style.gold.name || "gold"} in the shop`;
        case "earnXp": return `Earn ${n} ${config.style.xp.name || "XP"}`;
        case "dailyClaim": return `Claim your daily reward ${n} time${cond.target === 1 ? "" : "s"}`;
        case "defeatEnemies": {
            const names = (cond.enemyIds ?? []).map((id) => config.combat.enemies?.[id]?.name ?? id);
            // Enemy names don't pluralise reliably (Wolf → Wolves), so a count goes after them.
            if (!names.length) return `Defeat ${n} enem${cond.target === 1 ? "y" : "ies"}`;
            return `Defeat ${names.join(" or ")}${cond.target === 1 ? "" : ` ×${n}`}`;
        }
        case "winDuels": return `Win ${n} duel${cond.target === 1 ? "" : "s"}`;
    }
}

function repeats(cooldown: number): string {
    if (!cooldown) return "repeatable";
    if (cooldown === 86400) return "daily";
    if (cooldown === 604800) return "weekly";
    const hours = Math.round(cooldown / 3600);
    return hours >= 1 ? `every ${hours}h` : `every ${Math.max(1, Math.round(cooldown / 60))}m`;
}

/** "75 XP · 30 gold · 🧪 Minor Healing Draught ×1 · @Role". */
export function rewardLine(def: QuestConfig, config: GuildConfig): string {
    const parts: string[] = [];
    for (const r of Object.values(def.reward ?? {})) {
        if (r.xp) parts.push(`${config.style.xp.icon || "⭐"} ${r.xp} ${config.style.xp.name || "XP"}`);
        if (r.gold) parts.push(`${config.style.gold.icon || "💰"} ${r.gold} ${config.style.gold.name || "gold"}`);
        if (r.itemId) {
            const item = config.shop?.items?.[r.itemId];
            parts.push(`${item?.emoji ?? "🎁"} ${item?.name ?? r.itemId} ×${r.quantity ?? 1}`);
        }
        if (r.roleId) parts.push(`<@&${r.roleId}>`);
    }
    return parts.join(" · ") || "No reward";
}

function bar(cur: number, target: number) {
    const filled = Math.round((Math.min(cur, target) / Math.max(1, target)) * 10);
    return `\`${"█".repeat(filled)}${"░".repeat(10 - filled)}\` ${Math.min(cur, target)}/${target}`;
}

export function renderQuestLog(config: GuildConfig, userQuests: Record<string, UserQuestState>, page: number, status?: string) {
    const now = Date.now();
    const quests = Object.values(config.quests?.quests ?? {})
        .filter((q) => q.active !== false)
        .map((q) => ({ q, s: questStatus(userQuests[q.id], q, now) }))
        .sort((a, b) => ORDER[a.s.kind] - ORDER[b.s.kind] || a.q.name.localeCompare(b.q.name));

    const claimable = quests.filter((x) => x.s.kind === "claim").length;
    const active = quests.filter((x) => x.s.kind === "active").length;
    const view = pageOf(quests, page);

    const c = new ContainerBuilder().setAccentColor(accentColor(config.style.mainThemeColor));
    if (status) c.addTextDisplayComponents((t) => t.setContent(`-# ${status}`));
    c.addTextDisplayComponents((t) => t.setContent([
        "## 📜 Quest Log",
        `-# ${claimable ? `🎁 ${claimable} ready to claim · ` : ""}${active} in progress · ${quests.length} on the board`,
    ].join("\n")));

    if (quests.length === 0) {
        c.addSeparatorComponents((s) => s).addTextDisplayComponents((t) => t.setContent("_The quest board is empty._"));
    }

    for (const { q, s } of view.items) {
        const state = userQuests[q.id];
        const progress = s.kind === "active" ? `\n${bar(state?.progress ?? 0, q.conditions.target)}` : "";
        const icon = s.kind === "claim" ? "🎁" : s.kind === "active" ? "🟡" : s.kind === "cooldown" ? "⏳" : "📜";
        const lines = [
            `### ${icon} ${q.name}`,
            q.description ? `-# ${q.description}` : "",
            `🎯 ${objective(q.conditions, config)} · 🔁 ${repeats(q.cooldown)}${progress}`,
            `🎁 ${rewardLine(q, config)}`,
            s.kind === "cooldown" ? `-# Available again <t:${Math.floor(s.readyAt / 1000)}:R>` : "",
        ].filter(Boolean);

        const button = new ButtonBuilder();
        if (s.kind === "claim") button.setCustomId(`quests:claim:${q.id}:${view.page}`).setLabel("Claim").setEmoji("✨").setStyle(ButtonStyle.Success);
        else if (s.kind === "available") button.setCustomId(`quests:accept:${q.id}:${view.page}`).setLabel("Accept").setStyle(ButtonStyle.Primary);
        else button.setCustomId(`quests:noop:${q.id}`).setLabel(s.kind === "active" ? "In progress" : "On cooldown").setStyle(ButtonStyle.Secondary).setDisabled(true);

        c.addSeparatorComponents((sep) => sep).addSectionComponents(
            new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join("\n"))).setButtonAccessory(button),
        );
    }

    const nav = pagerButtons((p) => `quests:page:${p}`, view.page, view.pages);
    if (claimable >= 2) {
        nav.push(new ButtonBuilder().setCustomId(`quests:claimall:${view.page}`).setLabel(`Claim all (${claimable})`).setEmoji("✨").setStyle(ButtonStyle.Success));
    }
    return nav.length ? [c, new ActionRowBuilder<ButtonBuilder>().addComponents(...nav)] : [c];
}

// ─── Command ──────────────────────────────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) {
        await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
        return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { config, userQuests } = await load(interaction);
    if (!config.quests?.enabled) {
        await interaction.editReply({
            content: "The quest board is empty. No quests are on offer here yet.",
            components: ownerSetupRows(interaction, "quests", "Set up quests on the dashboard"),
        });
        return;
    }
    await interaction.editReply({ components: renderQuestLog(config, userQuests, 0), flags: MessageFlags.IsComponentsV2 });
}

async function load(interaction: ChatInputCommandInteraction | ButtonInteraction) {
    const { user: dbUser } = await getOrCreateDbUser({
        discordUserId: interaction.user.id,
        username: interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL(),
    });
    const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId! });
    const cached = await getOrCreateProfile({ userId: dbUser.id, guildId: dbGuild.id });
    const userQuests = (cached.profile.quests ?? {}) as Record<string, UserQuestState>;
    return { dbUser, dbGuild, config, cached, userQuests };
}

// ─── Buttons ──────────────────────────────────────────────────────────────────

export async function handleQuestsButton(interaction: ButtonInteraction) {
    if (!interaction.inGuild()) return;
    const [, action = "", a = "", b = ""] = interaction.customId.split(":");

    // Logs from before the rework carried view/action buttons and id-typing
    // modals; send them to a fresh log rather than half-handle them.
    if (!["accept", "claim", "claimall", "page"].includes(action)) {
        await interaction.reply({ content: "This quest menu is out of date. Run `/quests` again.", flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferUpdate();
    const page = Number(action === "accept" || action === "claim" ? b : a) || 0;
    let status: string | undefined;

    if (action === "accept") status = await acceptQuest(interaction, a);
    else if (action === "claim") status = await claimQuests(interaction, [a]);
    else if (action === "claimall") {
        const { config, userQuests } = await load(interaction);
        const ready = Object.values(config.quests?.quests ?? {})
            .filter((q) => q.active !== false && questStatus(userQuests[q.id], q, Date.now()).kind === "claim")
            .map((q) => q.id);
        status = await claimQuests(interaction, ready);
    }

    const { config, userQuests } = await load(interaction);
    await interaction.editReply({ components: renderQuestLog(config, userQuests, page, status), flags: MessageFlags.IsComponentsV2 });
}

/** Starts a quest. Returns the status line shown at the top of the log. */
async function acceptQuest(interaction: ButtonInteraction, questId: string): Promise<string> {
    const { dbUser, dbGuild, config, cached } = await load(interaction);
    const qc = config.quests?.quests?.[questId];
    if (!config.quests?.enabled || !qc || qc.active === false) return "❌ That quest is no longer on the board.";

    const userQuests = { ...(cached.profile.quests ?? {}) } as Record<string, UserQuestState>;
    const check = canStartQuest(userQuests[questId], qc, Date.now());
    if (!check.ok) {
        if (check.reason === "cooldown" && check.readyAt) return `⏳ **${qc.name}** is available again <t:${Math.floor(check.readyAt / 1000)}:R>.`;
        if (check.reason === "needs_claim") return `🎁 You already finished **${qc.name}**. Claim it first.`;
        return `🟡 You're already on **${qc.name}**.`;
    }

    userQuests[questId] = { acceptedAt: new Date().toISOString(), progress: 0, completedAt: null, claimedAt: null };
    const profile = { ...cached.profile, quests: userQuests };
    const pending = { ...(cached.pendingChanges ?? {}), quests: userQuests } as PendingProfileChanges;
    commitProfileChanges({
        userId: dbUser.id, guildId: dbGuild.id, profile, changes: pending,
        baseline: { xp: cached.profile.xp, gold: cached.profile.gold },
    });

    await logAndBroadcastEvent(interaction, {
        guildId: dbGuild.id, discordGuildId: dbGuild.discord_guild_id, userId: dbUser.id,
        category: "quests", eventType: "startQuest", questId, timestamp: new Date(),
    }, config);
    return `✅ Accepted **${qc.name}**. ${objective(qc.conditions, config)}!`;
}

/** Claims every finished quest in `questIds`, one commit each. Returns the status line. */
async function claimQuests(interaction: ButtonInteraction, questIds: string[]): Promise<string> {
    const claimed: string[] = [];
    const totals = { xp: 0, gold: 0, items: [] as string[] };

    for (const questId of questIds) {
        // Reloaded per quest: each claim commits, and the next must start from it.
        const { dbUser, dbGuild, config, cached } = await load(interaction);
        const qc = config.quests?.quests?.[questId];
        const userQuests = { ...(cached.profile.quests ?? {}) } as Record<string, UserQuestState>;
        const state = userQuests[questId];
        if (!qc || !state?.completedAt || state.claimedAt) continue;

        userQuests[questId] = { ...state, claimedAt: new Date().toISOString(), acceptedAt: null, completedAt: null, progress: 0 };
        let profile = { ...cached.profile, quests: userQuests };
        let pending = { ...(cached.pendingChanges ?? {}), quests: userQuests } as PendingProfileChanges;

        const effects = applyQuestRewards({ profile, pending, quest: qc, config });
        profile = effects.profile;
        pending = effects.pending;
        commitProfileChanges({
            userId: dbUser.id, guildId: dbGuild.id, profile, changes: pending,
            baseline: { xp: cached.profile.xp, gold: cached.profile.gold },
            recomputeLevel: (xp) => calculateLevelFromXp(Number(xp), config),
        });

        await applyQuestSideEffects({
            client: interaction.client,
            discordGuildId: interaction.guildId!,
            discordUserId: interaction.user.id,
            member: interaction.member instanceof GuildMember ? interaction.member : null,
            channelIdHint: interaction.channelId,
            config,
            rewards: { grantedRoles: effects.grantedRoles, messages: effects.messages },
        });

        await logAndBroadcastEvent(interaction, {
            guildId: dbGuild.id, discordGuildId: dbGuild.discord_guild_id, userId: dbUser.id,
            category: "quests", eventType: "claimQuest", questId,
            xpDelta: effects.totalXp, goldDelta: effects.totalGold,
            itemId: effects.grantedItems.map((it) => it.itemId).join(", "),
            itemQuantity: effects.grantedItems.reduce((sum, it) => sum + it.quantity, 0),
            timestamp: new Date(),
        }, config);

        claimed.push(qc.name);
        totals.xp += effects.totalXp;
        totals.gold += effects.totalGold;
        for (const it of effects.grantedItems) {
            const item = config.shop?.items?.[it.itemId];
            totals.items.push(`${item?.emoji ?? "🎁"} ${item?.name ?? it.itemId} ×${it.quantity}`);
        }
    }

    if (claimed.length === 0) return "❌ Nothing to claim right now.";
    const { config } = await load(interaction);
    const gains = [
        totals.xp && `+${totals.xp} ${config.style.xp.name || "XP"}`,
        totals.gold && `+${totals.gold} ${config.style.gold.name || "gold"}`,
        ...totals.items,
    ].filter(Boolean).join(", ");
    return `✨ Claimed **${claimed.join("**, **")}**${gains ? `: ${gains}` : ""}`;
}
