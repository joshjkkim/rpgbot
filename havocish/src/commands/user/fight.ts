import type { ButtonInteraction, ChatInputCommandInteraction, ColorResolvable, Message, User } from "discord.js";
import { announceRareFinds } from "../../ui/rareFinds.js";
import { rpgLevelUpCard } from "../../ui/rpgLevelUpCard.js";
import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    EmbedBuilder, MessageFlags, SlashCommandBuilder, ThreadAutoArchiveDuration,
} from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { commitProfileChanges, getOrCreateProfile } from "../../cache/profileService.js";
import { canManage, managerSetupRows } from "../../ui/dashboardLinks.js";
import { channelChain, fightsInThread, pickFromPlace, placeFor } from "../../player/places.js";
import { calculateStats, minutesToFull, resolveCurrentHp, type CombatStats } from "../../player/combat.js";
import {
    applyAction, applyFightRewards, busyFighting, clearActiveFight, healAmount, postResultLine,
    getActiveFight, getFightByMessageId, pickRandomEnemy, setActiveFight, startFight,
} from "../../player/fight.js";
import { intentLine, intentThreat, loadoutFor, turnOrderLine, moveById, statusesOf, usable } from "../../player/moves.js";
import { calculateLevelFromXp } from "../../leveling/levels.js";
import type { PendingProfileChanges } from "../../types/cache.js";
import { bestEffort } from "../../ui/bestEffort.js";
import type { ActiveFight, EnemyConfig, FightEndSummary, FighterState } from "../../types/combat.js";
import type { GuildConfig } from "../../types/guild.js";
import type { DbUserGuildProfile } from "../../types/userprofile.js";
import type { shopItemConfig } from "../../types/economy.js";
import { renderItemCard } from "../../ui/canvas/itemCard.js";
import { checkRequirements, memberFacts } from "../../player/requirements.js";
import { combatLevel } from "../../player/combatLevel.js";
import { questCompleteLines } from "../../player/quests.js";

// ─── Slash command definition ─────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
    .setName("fight")
    .setDescription("Hunt for an enemy where you are, for Combat XP and loot")
    .addStringOption(opt =>
        opt.setName("enemy")
            .setDescription("A specific enemy's ID (managers, or when the server allows it)")
            .setRequired(false)
    );

/**
 * Puts a fight in a thread off `line`, the short message left in chat. Null
 * when a thread can't be made here (no permission, already in a thread), and
 * the caller plays the fight in `line` instead.
 */
async function openFightThread(line: Message, title: string, userId: string): Promise<Message | null> {
    if (line.channel.isThread() || !("threads" in line.channel)) return null;
    try {
        const thread = await line.startThread({ name: title.slice(0, 100), autoArchiveDuration: ThreadAutoArchiveDuration.OneHour });
        await thread.members.add(userId).catch(() => null);
        return await thread.send({ content: "⚔️" });
    } catch {
        return null;
    }
}

/** The one line a threaded fight leaves in chat when it ends. */
function resultLine(fight: ActiveFight, summary: FightEndSummary, config: GuildConfig): string {
    const who = `<@${fight.userId}>`;
    const foe = `the ${fight.enemy.emoji} **${fight.enemy.name}**`;
    const where = fight.placeName ? ` in ${fight.placeName}` : "";
    if (summary.outcome === "loss") return `💀 ${who} was beaten by ${foe}${where}.`;
    if (summary.outcome === "flee") return `🏃 ${who} got away from ${foe}${where}.`;
    const loot = summary.itemsDropped
        .map((d) => config.shop?.items?.[d.itemId])
        .filter(Boolean)
        .map((i) => `${i!.emoji ?? "🎁"} ${i!.name}`);
    return `🏆 ${who} defeated ${foe}${where} in ${summary.rounds} round${summary.rounds === 1 ? "" : "s"}${loot.length ? ` · ${loot.join(", ")}` : ""}.`;
}

/**
 * Opens a fight where it belongs: in a thread off a short line (chat places),
 * or right in `home`. Shared by /fight and encounters. `line` is what chat sees
 * while it goes on.
 */
export async function placeFight(opts: {
    home: Message;
    threaded: boolean;
    line: string;
    title: string;
    start: (at: { messageId: string; channelId: string; origin?: { channelId: string; messageId: string } }) => ActiveFight;
    show: (fight: ActiveFight) => Parameters<Message["edit"]>[0];
    /** Edits `home` (e.g. editReply or update), since an interaction's reply is edited through it. */
    editHome: (content: Parameters<Message["edit"]>[0]) => Promise<unknown>;
    userId: string;
    guildId: string;
}): Promise<void> {
    const { home } = opts;
    if (opts.threaded) {
        await opts.editHome({ content: opts.line, embeds: [], components: [], allowedMentions: { parse: [] } });
        const inThread = await openFightThread(home, opts.title, opts.userId);
        if (inThread) {
            const fight = opts.start({ messageId: inThread.id, channelId: inThread.channelId, origin: { channelId: home.channelId, messageId: home.id } });
            try {
                await inThread.edit({ content: "", ...opts.show(fight) as object });
            } catch (err) {
                clearActiveFight(opts.userId, opts.guildId);
                throw err;
            }
            return;
        }
    }
    // Registered before the buttons exist, so the first click always finds it.
    const fight = opts.start({ messageId: home.id, channelId: home.channelId });
    try {
        await opts.editHome({ content: "", ...opts.show(fight) as object });
    } catch (err) {
        clearActiveFight(opts.userId, opts.guildId);
        throw err;
    }
}

// ─── Embed / UI helpers ───────────────────────────────────────────────────────

function buildHpBar(current: number, max: number, length = 10): string {
    const filled = Math.max(0, Math.round((current / max) * length));
    return "[" + "█".repeat(filled) + "░".repeat(length - filled) + "]";
}

const STAT_NAMES = { atk: "ATK", def: "DEF", spd: "SPD", crit: "Crit" } as const;

/** What's on a fighter right now: statuses and boosts, with turns left. */
function effectsLine(state: FighterState, config: GuildConfig): string {
    const statuses = statusesOf(config);
    return [
        ...Object.entries(state.statuses).map(([id, turns]) => {
            const stacks = state.stacks?.[id] ?? 1;
            return `${statuses[id]?.emoji ?? "•"} ${statuses[id]?.name ?? id}${stacks > 1 ? ` ×${stacks}` : ""} (${turns})`;
        }),
        ...state.boosts.map((b) => `${b.percent >= 0 ? "⬆️" : "⬇️"} ${STAT_NAMES[b.stat]} ${b.percent >= 0 ? "+" : "−"}${Math.abs(b.percent)}% (${b.turns})`),
    ].join("\n");
}

export function buildFightEmbed(fight: ActiveFight, config: GuildConfig, log: string[], title?: string): EmbedBuilder {
    const fighter = (hp: number, max: number, state: FighterState) =>
        [buildHpBar(hp, max), `❤️ **${hp}** / **${max}**`, effectsLine(state, config)].filter(Boolean).join("\n");
    // What's coming leads, as a headline: it's the one thing to read before choosing.
    const threat = intentThreat(fight, config);
    return new EmbedBuilder()
        .setTitle(title ?? `⚔️ vs ${fight.enemy.emoji} ${fight.enemy.name}`)
        .setColor(threat === "danger" ? "#B03A2E" : threat === "defend" ? "#3A6EA5" : config.style.mainThemeColor as ColorResolvable ?? "#00AE86")
        .setDescription([`### ${intentLine(fight, config).replaceAll("**", "")}`, ...log].join("\n"))
        .addFields(
            { name: "🧑 You", value: fighter(fight.playerCurrentHp, fight.playerStats.maxHp, fight.player), inline: true },
            { name: `${fight.enemy.emoji} ${fight.enemy.name}`, value: fighter(fight.enemyCurrentHp, fight.enemy.hp, fight.foe), inline: true },
        )
        .setFooter({ text: `Round ${fight.round + 1} · ${turnOrderLine(fight, config)}` });
}

function buildEndEmbed(
    fight: ActiveFight,
    summary: FightEndSummary,
    config: GuildConfig,
    playerDisplayName: string,
    log: string[],
): EmbedBuilder {
    const { outcome } = summary;
    const goldIcon = config.style.gold.icon  || "💰";

    const title =
        outcome === "win"  ? `🏆 Victory! ${fight.enemy.emoji} ${fight.enemy.name} defeated` :
        outcome === "loss" ? `💀 Defeated by ${fight.enemy.emoji} ${fight.enemy.name}` :
                             `🏃 Escaped from ${fight.enemy.emoji} ${fight.enemy.name}`;

    const color =
        outcome === "win"  ? "#FFD700" :
        outcome === "loss" ? "#FF4444" : "#FFA500";

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(color as ColorResolvable);

    if (log.length > 0) embed.setDescription(log.join("\n"));

    // Rewards
    const rewardLines: string[] = [];
    if (summary.xpGained > 0)   rewardLines.push(`⚔️ **+${summary.xpGained}** Combat XP`);
    if (summary.combatLevelUp)  rewardLines.push(`**Combat ${summary.combatLevelUp}!**`);
    if (summary.goldGained > 0) rewardLines.push(`${goldIcon} **+${summary.goldGained}** gold`);
    for (const drop of summary.itemsDropped) {
        const itemDef = config.shop?.items?.[drop.itemId];
        const label   = itemDef ? `${itemDef.emoji ?? "🎁"} ${itemDef.name}` : `\`${drop.itemId}\``;
        rewardLines.push(`${label} ×${drop.quantity}`);
    }
    if (rewardLines.length > 0) {
        embed.addFields({ name: "Rewards", value: rewardLines.join("\n"), inline: true });
    }

    embed.addFields({
        name: "Battle Stats",
        value: [
            `⚔️ Damage dealt: **${summary.totalDamageDealt}**`,
            `🩸 Damage taken: **${summary.totalDamageTaken}**`,
            `🔄 Rounds: **${summary.rounds}**`,
        ].join("\n"),
        inline: true,
    });

    if (summary.questsCompleted?.length) {
        embed.addFields({ name: "\u200b", value: questCompleteLines(summary.questsCompleted), inline: false });
    }

    embed.setFooter({ text: `${playerDisplayName}'s fight` });
    return embed;
}

// Discord will show more, but a wall of tooltips buries the fight log.
const MAX_LOOT_CARDS = 3;

/**
 * Tooltip images for whatever the enemy dropped, so loot arrives as an item
 * rather than a line of text. Rewards are already written to the profile by the
 * time this runs, so a card that fails to render must not take the reward
 * message down with it.
 */
async function lootCards(summary: FightEndSummary, config: GuildConfig) {
    const dropped = summary.itemsDropped
        .map(drop => config.shop?.items?.[drop.itemId])
        .filter((item): item is shopItemConfig => !!item)
        .slice(0, MAX_LOOT_CARDS);

    try {
        return await Promise.all(dropped.map(renderItemCard));
    } catch (err) {
        console.error("Failed to render loot cards:", err);
        return [];
    }
}

// Potions get their own row.
const MAX_POTION_BUTTONS = 5;

/** The healing potions in a bag, smallest first, as fight buttons. */
function potionButtons(profile: DbUserGuildProfile | undefined, config: GuildConfig | undefined): ButtonBuilder[] {
    const items = config?.shop?.items ?? {};
    return Object.values(profile?.inventory ?? {})
        .filter((inv) => (inv.quantity ?? 0) > 0 && healAmount(items[inv.id]) > 0)
        .sort((a, b) => healAmount(items[a.id]) - healAmount(items[b.id]))
        .slice(0, MAX_POTION_BUTTONS)
        .map((inv) => new ButtonBuilder()
            .setCustomId(`fight:potion:${inv.id}`)
            .setLabel(`${items[inv.id]!.name} ×${inv.quantity}`.slice(0, 80))
            // Fixed: an owner can type anything as an item emoji, and one Discord rejects fails the whole fight message.
            .setEmoji("🧪")
            .setStyle(ButtonStyle.Success));
}

/** An owner-typed emoji Discord will take on a button, or none: one it rejects fails the whole message. */
function buttonEmoji(emoji: string | undefined): string | undefined {
    if (!emoji) return undefined;
    return /^<a?:\w+:\d+>$/.test(emoji) || /^\p{Extended_Pictographic}/u.test(emoji) ? emoji : undefined;
}

/** The fighter's moves and Flee, then a row of healing potions. Stunned or winding up, one button to carry on. */
export function buildActionRows(
    fight: Pick<ActiveFight, "loadout" | "player">, profile: DbUserGuildProfile, config: GuildConfig,
): ActionRowBuilder<ButtonBuilder>[] {
    if (fight.player.stunned || fight.player.charging) {
        const label = fight.player.stunned ? "Recover" : `Keep winding up ${moveById(config, fight.player.charging!.moveId).name}`;
        return [new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("fight:wait").setLabel(label.slice(0, 80)).setEmoji(fight.player.stunned ? "💫" : "⏳").setStyle(ButtonStyle.Primary),
        )];
    }
    const moves = fight.loadout.map((id, i) => {
        const move = moveById(config, id);
        const wait = fight.player.cooldowns[move.id] ?? 0;
        const spent = !usable(fight.player, move);
        const button = new ButtonBuilder()
            .setCustomId(`fight:move:${move.id}`)
            .setLabel((wait > 0 ? `${move.name} (${wait})` : move.name).slice(0, 80))
            .setStyle(i === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(spent);
        const emoji = buttonEmoji(move.emoji);
        if (emoji) button.setEmoji(emoji);
        return button;
    });
    const flee = new ButtonBuilder().setCustomId("fight:flee").setLabel("Flee").setEmoji("🏃").setStyle(ButtonStyle.Danger);
    const rows = [new ActionRowBuilder<ButtonBuilder>().addComponents(...moves, flee)];
    const potions = potionButtons(profile, config);
    if (potions.length > 0) rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...potions));
    return rows;
}

// ─── Shared fight start ───────────────────────────────────────────────────────
// /fight and random encounters (player/encounters.ts) start fights the same way.

type Ready =
    | { ok: false; message: string }
    | { ok: true; profile: DbUserGuildProfile; config: GuildConfig; stats: CombatStats; currentHp: number };

/** Whether this member can start a fight right now, with what they need to start one. */
export async function readyToFight(user: User, discordGuildId: string): Promise<Ready> {
    const { user: dbUser } = await getOrCreateDbUser({
        discordUserId: user.id,
        username: user.username,
        avatarUrl: user.displayAvatarURL(),
    });
    const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId });

    if (!config.combat.enabled) return { ok: false, message: "⚔️ Combat isn't enabled on this server." };
    const busy = busyFighting(user.id, discordGuildId, "Finish it first.");
    if (busy) return { ok: false, message: busy };

    const { profile } = await getOrCreateProfile({ userId: dbUser.id, guildId: dbGuild.id });
    const stats = calculateStats(profile, config, config.shop?.items ?? {});
    const currentHp = resolveCurrentHp(profile, stats, config);
    if (currentHp <= 0) {
        return { ok: false, message: `❤️ You have **0 HP**. Rest a while (back to full in ${minutesToFull(currentHp, stats, config)} min), or eat or drink something to heal.` };
    }
    return { ok: true, profile, config, stats, currentHp };
}

// ─── /fight command ───────────────────────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
        return;
    }

    const current = getActiveFight(interaction.user.id, interaction.guildId);
    if (current) {
        await bringBackFight(interaction, current);
        return;
    }

    const ready = await readyToFight(interaction.user, interaction.guildId);
    if (!ready.ok) {
        await interaction.reply({ content: ready.message, flags: MessageFlags.Ephemeral });
        return;
    }
    const { profile, config } = ready;

    // Pick enemy
    const enemyIdOpt = interaction.options.getString("enemy");
    let enemy: EnemyConfig | null;

    // The server's channels are its map: /fight rolls from where you are.
    const place = placeFor(config, channelChain(interaction.channel as any));
    if (enemyIdOpt && !config.combat.allowEnemyChoice && !canManage(interaction)) {
        await interaction.reply({ content: "Enemies here find you: use `/fight` without picking one.", flags: MessageFlags.Ephemeral });
        return;
    }

    if (enemyIdOpt) {
        enemy = config.combat.enemies?.[enemyIdOpt] ?? null;
        if (enemy?.boss) {
            await interaction.reply({
                content: `**${enemy.emoji} ${enemy.name}** is a world boss. It takes the whole server, and only appears as a boss.`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        if (!enemy) {
            await interaction.reply({
                content: `No enemy found with ID \`${enemyIdOpt}\`. Use \`/config-enemy show\` to see available enemies.`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        const level = combatLevel(profile, config);
        if (level < enemy.minLevel || (enemy.maxLevel !== null && level > enemy.maxLevel)) {
            await interaction.reply({
                content: `You need Combat **${enemy.minLevel}**${enemy.maxLevel !== null ? `–${enemy.maxLevel}` : "+"}  to fight **${enemy.emoji} ${enemy.name}**.`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        const gate = checkRequirements(enemy.requirements, { profile, config, facts: memberFacts(interaction.member) });
        if (!gate.ok) {
            await interaction.reply({ content: `**${enemy.emoji} ${enemy.name}**: ${gate.message}`, flags: MessageFlags.Ephemeral });
            return;
        }
    } else {
        const facts = memberFacts(interaction.member);
        const allowed = (e: EnemyConfig) => checkRequirements(e.requirements, { profile, config, facts }).ok;
        const level = combatLevel(profile, config);
        enemy = place ? pickFromPlace(place, config, level, allowed) : pickRandomEnemy(config, level, allowed);
        if (!enemy) {
            await interaction.reply({
                content: place ? `Nothing in ${place.emoji} **${place.name}** suits Combat ${level}. Try somewhere else.` : "No foes roam at your level yet.",
                components: managerSetupRows(interaction, "combat", "Add enemies on the dashboard"),
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
    }

    // Fights are public — not ephemeral
    await interaction.deferReply();
    const reply = await interaction.fetchReply();
    const title = `⚔️ ${interaction.user.displayName} vs ${enemy.emoji} ${enemy.name}`;
    const loadout = loadoutFor(profile, config, memberFacts(interaction.member));
    const found = enemy;
    await placeFight({
        home: reply,
        threaded: fightsInThread(config, place),
        line: `${place?.emoji ?? "⚔️"} <@${interaction.user.id}> ${place ? `searches ${place.name}` : "goes looking for a fight"} and meets a ${found.emoji} **${found.name}**. The fight is in the thread.`,
        title,
        userId: interaction.user.id,
        guildId: interaction.guildId,
        editHome: (content) => interaction.editReply(content as any),
        start: (at) => startFight({
            discordUserId: interaction.user.id,
            discordGuildId: interaction.guildId!,
            combatType: "pve",
            profile,
            enemy: found,
            config,
            loadout,
            ...at,
            ...(place && { placeName: `${place.emoji} ${place.name}` }),
        }),
        show: (fight) => ({ embeds: [buildFightEmbed(fight, config, [], title)], components: buildActionRows(fight, profile, config) }),
    });
}

/**
 * /fight during a fight reposts it here, at the bottom of the channel, for when
 * the original got buried or deleted. The old message's buttons are removed so
 * there is only ever one live copy.
 */
async function bringBackFight(interaction: ChatInputCommandInteraction, fight: ActiveFight): Promise<void> {
    await interaction.deferReply();
    const { config } = await getOrCreateGuildConfig({ discordGuildId: fight.guildId });
    const { profile } = await getOrCreateProfile({ userId: fight.dbUserId, guildId: fight.dbGuildId });
    if (fight.resolved) {
        await interaction.editReply({ content: "That fight just ended." });
        return;
    }

    const reply = await interaction.editReply({
        embeds: [buildFightEmbed(fight, config, ["↩️ Back to your fight."])],
        components: buildActionRows(fight, profile, config),
    });
    const old = { channelId: fight.channelId, messageId: fight.messageId };
    fight.channelId = interaction.channelId;
    fight.messageId = reply.id;
    setActiveFight(fight);

    await bestEffort("moved fight message", (async () => {
        const channel = await interaction.client.channels.fetch(old.channelId);
        if (channel?.isTextBased()) {
            await channel.messages.edit(old.messageId, {
                embeds: [new EmbedBuilder().setDescription(`⚔️ This fight moved: ${reply.url}`)],
                components: [],
            });
        }
    })());
}

/**
 * Takes one of a potion out of the fighter's bag, or says why it can't. Checks
 * and removes in one synchronous step, so two quick clicks can't both drink the
 * last one.
 */
function takePotion(profile: DbUserGuildProfile, pending: PendingProfileChanges | undefined, itemId: string, config: GuildConfig): boolean {
    const have = profile.inventory?.[itemId];
    if (!have || (have.quantity ?? 0) < 1) return false;
    const inventory = { ...profile.inventory };
    if (have.quantity <= 1) delete inventory[itemId];
    else inventory[itemId] = { ...have, quantity: have.quantity - 1 };
    profile.inventory = inventory;
    commitProfileChanges({
        userId: profile.user_id, guildId: profile.guild_id, profile,
        changes: { ...(pending ?? {}), inventory } as PendingProfileChanges,
        baseline: { xp: profile.xp, gold: profile.gold },
        recomputeLevel: (xp) => calculateLevelFromXp(Number(xp), config),
    });
    return true;
}

// ─── Button handler ───────────────────────────────────────────────────────────
// Exported and wired up in interactionCreate.ts for customIds starting with "fight:".

export async function handleFightButton(interaction: ButtonInteraction): Promise<void> {
    const actionId = interaction.customId.slice("fight:".length);

    const fight = getFightByMessageId(interaction.message.id);
    if (!fight) {
        // Fight expired or was already cleaned up — remove the buttons
        await interaction.update({ components: [] });
        return;
    }

    // Only the fighter may click
    if (interaction.user.id !== fight.userId) {
        await interaction.reply({ content: "This isn't your fight!", flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferUpdate();

    const { user: dbUser } = await getOrCreateDbUser({
        discordUserId: interaction.user.id,
        username: interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL(),
    });
    const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: fight.guildId });
    const cached = await getOrCreateProfile({ userId: dbUser.id, guildId: dbGuild.id });
    const profile = cached.profile;

    if (actionId.startsWith("potion:") && !fight.resolved) {
        if (!takePotion(profile, cached.pendingChanges, actionId.slice("potion:".length), config)) {
            await interaction.followUp({ content: "You don't have any of those left.", flags: MessageFlags.Ephemeral });
            await interaction.editReply({ components: buildActionRows(fight, profile, config) });
            return;
        }
    }

    const { fight: updatedFight, result, ended, summary, alreadyResolved } = applyAction(
        fight, actionId, dbGuild, profile, config,
    );

    // A second click that raced the winning one. The click that ended the fight
    // has already paid out and rendered the end embed; this one does nothing.
    if (alreadyResolved) return;

    if (ended && summary) {
        await applyFightRewards(summary, updatedFight, profile, config);
        const endEmbed = buildEndEmbed(
            updatedFight, summary, config, interaction.user.displayName, result.log,
        );
        const levelCard = summary.combatLevelUp
            ? await rpgLevelUpCard({ config, kind: "combat", user: interaction.user, label: "Combat", before: summary.combatLevelUp - 1, after: summary.combatLevelUp })
            : null;
        await interaction.editReply({
            embeds: [endEmbed],
            components: [],
            files: [...(levelCard ? [levelCard] : []), ...await lootCards(summary, config)],
        });
        await postResultLine(interaction.client, updatedFight, resultLine(updatedFight, summary, config));
        await announceRareFinds({
            client: interaction.client, config, discordUserId: interaction.user.id, verb: "found",
            items: summary.itemsDropped, where: `from ${updatedFight.enemy.emoji} ${updatedFight.enemy.name}`,
        });
        return;
    }

    // Fight continues — update embed with new HP values and last round log
    const updatedEmbed = buildFightEmbed(updatedFight, config, result.log);
    await interaction.editReply({ embeds: [updatedEmbed], components: buildActionRows(updatedFight, profile, config) });
}
