import type { ButtonInteraction, ChatInputCommandInteraction, Client, ColorResolvable, Message, User } from "discord.js";
import { announceRareFinds } from "../../ui/rareFinds.js";
import { rpgLevelUpCard } from "../../ui/rpgLevelUpCard.js";
import {
    ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle,
    EmbedBuilder, MessageFlags, SlashCommandBuilder, ThreadAutoArchiveDuration,
} from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { commitProfileChanges, getOrCreateProfile } from "../../cache/profileService.js";
import { canManage, managerSetupRows } from "../../ui/dashboardLinks.js";
import { channelChain, fightsInThread, pickFromPlace, placeFor } from "../../player/places.js";
import { calculateStats, minutesToFull, resolveCurrentHp, type CombatStats } from "../../player/combat.js";
import {
    applyFightRewards, busyFighting, cantJoin, clearActiveFight, everyonePicked, healAmount, joinFight, newMember,
    partyRules, postResultLine, resolveRound, submitPick,
    getActiveFight, getFightByMessageId, pickRandomEnemy, setActiveFight, startFight,
} from "../../player/fight.js";
import { intentLine, intentThreat, loadoutFor, turnOrderLine, moveById, statusesOf, usable } from "../../player/moves.js";
import { calculateLevelFromXp } from "../../leveling/levels.js";
import type { PendingProfileChanges } from "../../types/cache.js";
import { bestEffort } from "../../ui/bestEffort.js";
import type { ActiveFight, EnemyConfig, FightEndSummary, FightMember, FighterState } from "../../types/combat.js";
import type { GuildConfig } from "../../types/guild.js";
import type { DbUserGuildProfile } from "../../types/userprofile.js";
import type { shopItemConfig } from "../../types/economy.js";
import { renderItemCard } from "../../ui/canvas/itemCard.js";
import { renderBattleScene } from "../../ui/canvas/battleScene.js";
import { checkRequirements, memberFacts } from "../../player/requirements.js";
import { combatLevel } from "../../player/combatLevel.js";
import { questCompleteLines } from "../../player/quests.js";
import { tipOnce, type Tip } from "../../player/tips.js";
import { checkCollections } from "../../player/collections.js";
import { newMoveLines, nextFightLine } from "../../player/nextSteps.js";

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
function resultLine(fight: ActiveFight, outcome: string, results: { member: FightMember; summary: FightEndSummary }[], config: GuildConfig): string {
    const names = fight.members.filter((m) => m.out !== "fled").map((m) => `<@${m.userId}>`);
    const who = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0] ?? `<@${fight.userId}>`;
    const foe = `the ${fight.enemy.emoji} **${fight.enemy.name}**`;
    const where = fight.placeName ? ` in ${fight.placeName}` : "";
    if (outcome === "loss") return `💀 ${who} ${names.length > 1 ? "were" : "was"} beaten by ${foe}${where}.`;
    if (outcome !== "win") return `🏃 ${who} got away from ${foe}${where}.`;
    const loot = results.flatMap((r) => r.summary.itemsDropped)
        .map((d) => config.shop?.items?.[d.itemId])
        .filter(Boolean)
        .map((i) => `${i!.emoji ?? "🎁"} ${i!.name}`);
    return `🏆 ${who} defeated ${foe}${where} in ${fight.round} round${fight.round === 1 ? "" : "s"}${loot.length ? ` · ${loot.join(", ")}` : ""}.`;
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
    show: (fight: ActiveFight) => Promise<object>;
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
                await inThread.edit({ content: "", ...await opts.show(fight) });
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
        await opts.editHome({ content: "", ...await opts.show(fight) });
    } catch (err) {
        clearActiveFight(opts.userId, opts.guildId);
        throw err;
    }
}

// ─── Embed / UI helpers ───────────────────────────────────────────────────────

function buildHpBar(current: number, max: number, length = 10): string {
    const filled = Math.max(0, Math.min(length, Math.round((current / Math.max(1, max)) * length)));
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

function fighterBlock(hp: number, max: number, state: FighterState, config: GuildConfig): string {
    return [buildHpBar(hp, max), `❤️ **${hp}** / **${max}**`, effectsLine(state, config)].filter(Boolean).join("\n");
}

function boardTitle(fight: ActiveFight): string {
    return `⚔️ ${fight.members.map((m) => m.name).join(", ")} vs ${fight.enemy.emoji} ${fight.enemy.name}`;
}

/**
 * The fight message. With a scene, the picture carries the fighters and HP;
 * the text keeps the headline, the log, statuses and (in a party) who has
 * picked. Without one, fields show everyone's HP.
 */
export function buildFightEmbed(fight: ActiveFight, config: GuildConfig, log: string[], scene = false): EmbedBuilder {
    // What's coming leads, as a headline: it's the one thing to read before choosing.
    const threat = intentThreat(fight, config);
    const party = fight.members.length > 1;
    const lines = [`### ${intentLine(fight, config).replaceAll("**", "")}`, ...log];
    if (scene) {
        const effects = [
            ...fight.members.filter((m) => !m.out).map((m) => [party ? m.name : "You", effectsLine(m.state, config)] as const),
            [fight.enemy.name, effectsLine(fight.foe, config)] as const,
        ].filter(([, e]) => e).map(([who, e]) => `**${who}:** ${e.replaceAll("\n", " · ")}`);
        if (effects.length) lines.push("", ...effects);
        if (party) lines.push("", fight.members.map((m) => `${m.out === "down" ? "💀" : m.out === "fled" ? "🏃" : m.pick ? "✅" : "⏳"} ${m.name}`).join("  ·  "));
    }
    if (party && fight.roundEndsAt) lines.push(`-# The round plays <t:${Math.ceil(fight.roundEndsAt / 1000)}:R>, or as soon as everyone has picked.`);
    const members = fight.members.map((m) => ({
        name: party ? `🧑 ${m.name} ${m.out === "down" ? "💀" : m.out === "fled" ? "🏃" : m.pick ? "✅" : "⏳"}` : "🧑 You",
        value: m.out === "fled" ? "Fled" : fighterBlock(m.hp, m.stats.maxHp, m.state, config),
        inline: true,
    }));
    const enemy = { name: `${fight.enemy.emoji} ${fight.enemy.name}`, value: fighterBlock(fight.enemyCurrentHp, fight.enemyMaxHp, fight.foe, config) };
    const embed = new EmbedBuilder()
        .setTitle(boardTitle(fight))
        .setColor(threat === "danger" ? "#B03A2E" : threat === "defend" ? "#3A6EA5" : config.style.mainThemeColor as ColorResolvable ?? "#00AE86")
        .setDescription(lines.join("\n"))
        // Alone: you and the enemy side by side. In a party the enemy gets its
        // own row on top, so it doesn't read as one more member.
        .setFooter({ text: `Round ${fight.round + 1} · ${turnOrderLine(fight, config)}` });
    if (scene) return embed.setImage("attachment://scene.png");
    return embed.addFields(...(party ? [{ ...enemy, inline: false }, ...members] : [...members, { ...enemy, inline: true }]));
}

/** A slow or failed drawing never holds up a fight: it falls back to text. */
const SCENE_TIMEOUT_MS = 4000;
/**
 * Drawings in progress at once. Each canvas holds a few MB the garbage
 * collector frees late, so a burst past this shows text for that turn
 * rather than spiking memory on the small bot machine.
 */
const MAX_SCENES_AT_ONCE = 3;
let scenesInFlight = 0;

/** The fight drawn as a picture, or null when the server turned scenes off or it couldn't be drawn. */
async function sceneFile(fight: ActiveFight, config: GuildConfig): Promise<AttachmentBuilder | null> {
    if (config.style?.battleScenes === false || scenesInFlight >= MAX_SCENES_AT_ONCE) return null;
    scenesInFlight++;
    try {
        return await drawScene(fight, config);
    } finally {
        scenesInFlight--;
    }
}

async function drawScene(fight: ActiveFight, config: GuildConfig): Promise<AttachmentBuilder | null> {
    const place = fight.placeId ? config.combat.places?.[fight.placeId] : undefined;
    const hits = fight.lastHits;
    const statuses = statusesOf(config);
    // What's on a fighter, as icons: statuses with turns left, then a stun or a wind-up.
    const effects = (st: FighterState) => [
        ...Object.entries(st.statuses).map(([id, turns]) => ({ emoji: statuses[id]?.emoji ?? "✨", turns })),
        ...(st.stunned ? [{ emoji: "💫" }] : []),
        ...(st.charging ? [{ emoji: "⏳" }] : []),
    ];
    const render = renderBattleScene({
        place: place ? { emoji: place.emoji, ...(place.colour && { colour: place.colour }), ...(place.image && { image: place.image }) } : null,
        enemy: {
            name: fight.enemy.name, emoji: fight.enemy.emoji, ...(fight.enemy.image && { image: fight.enemy.image }),
            hp: fight.enemyCurrentHp, maxHp: fight.enemyMaxHp, ...(hits?.enemy && { hit: hits.enemy }),
            effects: effects(fight.foe),
        },
        members: fight.members.filter((m) => m.out !== "fled").map((m) => ({
            name: m.name, hp: m.hp, maxHp: m.stats.maxHp,
            ...(m.avatarUrl && { avatarUrl: m.avatarUrl }),
            ...(m.out === "down" && { down: true }),
            ...(fight.members.length > 1 && m.userId === fight.enemyTarget && { targeted: true }),
            ...(hits?.members[m.userId] && { hit: hits.members[m.userId] }),
            effects: effects(m.state),
        })),
    });
    const timeout = new Promise<null>((resolve) => setTimeout(resolve, SCENE_TIMEOUT_MS, null).unref());
    const png = await Promise.race([render, timeout]).catch((err) => {
        console.error("Failed to draw a battle scene:", err);
        return null;
    });
    return png ? new AttachmentBuilder(png, { name: "scene.png" }) : null;
}

/** The Join button, while there's room and the server allows it. */
function joinRow(fight: ActiveFight, config: GuildConfig): ActionRowBuilder<ButtonBuilder>[] {
    if (cantJoin(fight, "", config)) return [];
    const max = partyRules(config).maxPlayers;
    return [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("fight:join").setLabel(`Join (${fight.members.length}/${max})`).setEmoji("🙋").setStyle(ButtonStyle.Success),
    )];
}

/**
 * The whole fight message. Alone, your buttons sit on it; in a party each
 * player picks privately through "Choose my move", since loadouts differ.
 */
export async function boardView(fight: ActiveFight, config: GuildConfig, log: string[], soloProfile: DbUserGuildProfile | null) {
    const scene = await sceneFile(fight, config);
    // `attachments: []` drops last turn's picture, so edits don't pile them up.
    const media = { embeds: [buildFightEmbed(fight, config, log, !!scene)], files: scene ? [scene] : [], attachments: [] };
    if (fight.members.length === 1 && soloProfile) {
        return { ...media, components: [...buildActionRows(fight.members[0]!, soloProfile, config), ...joinRow(fight, config)] };
    }
    const choose = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("fight:choose").setLabel("Choose my move").setEmoji("🎯").setStyle(ButtonStyle.Primary),
    );
    return { ...media, components: [choose, ...joinRow(fight, config)] };
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
    if (summary.easyShare)      rewardLines.push(`-# Too easy for you: ${Math.round(summary.easyShare * 100)}% XP. Tougher enemies pay in full.`);
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
    member: Pick<FightMember, "loadout" | "state">, profile: DbUserGuildProfile, config: GuildConfig,
): ActionRowBuilder<ButtonBuilder>[] {
    const st = member.state;
    if (st.stunned || st.charging) {
        const label = st.stunned ? "Recover" : `Keep winding up ${moveById(config, st.charging!.moveId).name}`;
        return [new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("fight:wait").setLabel(label.slice(0, 80)).setEmoji(st.stunned ? "💫" : "⏳").setStyle(ButtonStyle.Primary),
        )];
    }
    // One button per move: a move deleted mid-fight falls back to Attack, and two
    // buttons with one id would make Discord refuse the whole message.
    const ids = [...new Set(member.loadout.map((id) => moveById(config, id).id))];
    const moves = ids.map((id, i) => {
        const move = moveById(config, id);
        const wait = st.cooldowns[move.id] ?? 0;
        const spent = !usable(st, move);
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
    const name = interaction.member && "displayName" in interaction.member ? interaction.member.displayName : interaction.user.displayName;
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
            name,
            avatarUrl: interaction.user.displayAvatarURL({ extension: "png", size: 128 }),
            ...at,
            ...(place && { placeName: `${place.emoji} ${place.name}`, placeId: place.id }),
        }),
        show: (fight) => boardView(fight, config, [], profile),
    });
    await tip(interaction, profile.user_id, profile.guild_id, config, "firstFight");
}

/**
 * /fight during a fight reposts it here, at the bottom of the channel, for when
 * the original got buried or deleted. The old message's buttons are removed so
 * there is only ever one live copy.
 */
async function bringBackFight(interaction: ChatInputCommandInteraction, fight: ActiveFight): Promise<void> {
    await interaction.deferReply();
    const { config } = await getOrCreateGuildConfig({ discordGuildId: fight.guildId });
    const { profile } = await getOrCreateProfile({ userId: fight.members[0]!.dbUserId, guildId: fight.dbGuildId });
    if (fight.resolved) {
        await interaction.editReply({ content: "That fight just ended." });
        return;
    }

    const reply = await interaction.editReply(await boardView(fight, config, ["↩️ Back to the fight."], profile));
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

// ─── Rounds ───────────────────────────────────────────────────────────────────

async function editBoard(client: Client, fight: ActiveFight, view: Parameters<Message["edit"]>[0]) {
    await bestEffort("fight board", (async () => {
        const channel = await client.channels.fetch(fight.channelId);
        if (channel?.isTextBased()) await channel.messages.edit(fight.messageId, view);
    })());
}

/** In a party, the round plays after the turn timer even if someone hasn't picked. */
function scheduleRound(fight: ActiveFight, client: Client, config: GuildConfig) {
    if (fight.members.length < 2 || fight.resolved || fight.roundTimer) return;
    const ms = partyRules(config).turnSeconds * 1000;
    fight.roundEndsAt = Date.now() + ms;
    fight.roundTimer = setTimeout(() => {
        delete fight.roundTimer;
        // Nobody picked at all: the party is away, so the fight waits (and ends
        // as a walk-away after the usual timeout) instead of playing itself.
        if (!fight.members.some((m) => !m.out && m.pick)) {
            delete fight.roundEndsAt;
            void boardView(fight, config, ["⏸️ Nobody picked a move: the fight waits for you."], null)
                .then((view) => editBoard(client, fight, view))
                .catch((err) => console.error("Failed to show a waiting fight:", err));
            return;
        }
        void playRound(fight, client).catch((err) => console.error("Failed to play a fight round:", err));
    }, ms);
    fight.roundTimer.unref();
}

/**
 * Plays the round and shows it: the board for the next one, or the end with
 * everyone's rewards. Members who fled this round are paid off on the spot.
 */
async function playRound(fight: ActiveFight, client: Client): Promise<{ member: FightMember; summary: FightEndSummary }[]> {
    if (fight.playing) return [];
    fight.playing = true;
    try {
        return await playRoundNow(fight, client);
    } finally {
        fight.playing = false;
    }
}

async function playRoundNow(fight: ActiveFight, client: Client): Promise<{ member: FightMember; summary: FightEndSummary }[]> {
    const { config } = await getOrCreateGuildConfig({ discordGuildId: fight.guildId });
    // Potions are used up now, as the round plays. One that's gone since it was picked becomes an attack.
    for (const m of fight.members) {
        // Stunned or winding up, they won't drink it this round.
        if (m.out || !m.pick?.startsWith("potion:") || m.state.stunned || m.state.charging) continue;
        const cached = await getOrCreateProfile({ userId: m.dbUserId, guildId: fight.dbGuildId });
        if (!takePotion(cached.profile, cached.pendingChanges, m.pick.slice("potion:".length), config)) delete m.pick;
    }
    const round = resolveRound(fight, config);
    if (round.alreadyResolved) return [];

    const results: { member: FightMember; summary: FightEndSummary }[] = [];
    // "What's next" for each member: moves a level-up just opened, then what to aim for.
    const next = new Map<string, string[]>();
    for (const { member, summary } of round.settled) {
        const { profile } = await getOrCreateProfile({ userId: member.dbUserId, guildId: fight.dbGuildId });
        const after = await applyFightRewards(summary, fight, member, profile, config);
        results.push({ member, summary });
        const level = combatLevel(after, config);
        const goal = summary.outcome === "flee" ? null : nextFightLine(config, level, !!summary.easyShare);
        next.set(member.userId, [...newMoveLines(config, member.level ?? level, level), ...(goal ? [goal] : [])]);
    }

    if (!round.ended) {
        scheduleRound(fight, client, config);
        const solo = fight.members.length === 1 ? (await getOrCreateProfile({ userId: fight.members[0]!.dbUserId, guildId: fight.dbGuildId })).profile : null;
        await editBoard(client, fight, await boardView(fight, config, round.log, solo));
        return results;
    }

    const party = fight.members.length > 1;
    if (!party) {
        const { summary } = results[0]!;
        const user = await client.users.fetch(fight.userId).catch(() => null);
        const levelCard = summary.combatLevelUp && user
            ? await rpgLevelUpCard({ config, kind: "combat", user, label: "Combat", before: summary.combatLevelUp - 1, after: summary.combatLevelUp })
            : null;
        await editBoard(client, fight, {
            embeds: [buildEndEmbed(fight, summary, config, fight.members[0]!.name, [...round.log, ...(next.get(fight.members[0]!.userId)?.length ? ["", ...next.get(fight.members[0]!.userId)!] : [])])],
            components: [],
            files: [...(levelCard ? [levelCard] : []), ...await lootCards(summary, config)],
            attachments: [],
        });
    } else {
        await editBoard(client, fight, { embeds: [buildPartyEndEmbed(fight, results, config, round.outcome, round.log, next)], components: [], attachments: [] });
    }
    await postResultLine(client, fight, resultLine(fight, round.outcome, results, config));
    for (const { member } of results) {
        await checkCollections({ client, config, discordUserId: member.userId, discordGuildId: fight.guildId, fallbackChannelId: fight.origin?.channelId ?? fight.channelId });
    }
    for (const { member, summary } of results) {
        await announceRareFinds({
            client, config, discordUserId: member.userId, verb: "found",
            items: summary.itemsDropped, where: `from ${fight.enemy.emoji} ${fight.enemy.name}`,
        });
    }
    return results;
}

/** A one-time tip, privately, to whoever clicked. */
async function tip(interaction: ButtonInteraction | ChatInputCommandInteraction, userId: number, guildId: number, config: GuildConfig, which: Tip) {
    const text = await tipOnce(userId, guildId, config, which);
    // A tip is extra: it never gets in the way of the fight.
    if (text) try { await interaction.followUp({ content: text, flags: MessageFlags.Ephemeral }); } catch { /* not needed */ }
}

/** The end of a party fight: what each member got. */
function buildPartyEndEmbed(
    fight: ActiveFight, results: { member: FightMember; summary: FightEndSummary }[], config: GuildConfig, outcome: string, log: string[],
    next: Map<string, string[]> = new Map(),
): EmbedBuilder {
    const goldIcon = config.style.gold.icon || "💰";
    const title =
        outcome === "win" ? `🏆 Victory! ${fight.enemy.emoji} ${fight.enemy.name} defeated` :
        outcome === "loss" ? `💀 The party fell to ${fight.enemy.emoji} ${fight.enemy.name}` :
        `🏃 The party escaped from ${fight.enemy.emoji} ${fight.enemy.name}`;
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor((outcome === "win" ? "#FFD700" : outcome === "loss" ? "#FF4444" : "#FFA500") as ColorResolvable);
    if (log.length) embed.setDescription(log.join("\n").slice(0, 4000));
    for (const { member, summary } of results) {
        const lines = [
            summary.xpGained > 0 ? `⚔️ +${summary.xpGained} Combat XP` : "",
            summary.combatLevelUp ? `**Combat ${summary.combatLevelUp}!**` : "",
            summary.goldGained > 0 ? `${goldIcon} +${summary.goldGained}` : "",
            summary.goldLost > 0 ? `${goldIcon} −${summary.goldLost}` : "",
            ...summary.itemsDropped.map((d) => {
                const def = config.shop?.items?.[d.itemId];
                return `${def?.emoji ?? "🎁"} ${def?.name ?? d.itemId} ×${d.quantity}`;
            }),
            summary.knockedOut ? "-# Knocked out: half rewards" : "",
            summary.easyShare ? `-# Too easy: ${Math.round(summary.easyShare * 100)}% XP` : "",
            summary.questsCompleted?.length ? questCompleteLines(summary.questsCompleted) : "",
            `-# ${summary.totalDamageDealt} dealt · ${summary.totalDamageTaken} taken`,
            // New moves only: in a party, each member's own goal line would crowd the board.
            ...(next.get(member.userId) ?? []).filter((l) => l.startsWith("🆕")),
        ].filter(Boolean);
        embed.addFields({ name: `🧑 ${member.name}`, value: lines.join("\n").slice(0, 1024), inline: true });
    }
    return embed;
}

// ─── Button handler ───────────────────────────────────────────────────────────
// Exported and wired up in interactionCreate.ts for customIds starting with "fight:".

export async function handleFightButton(interaction: ButtonInteraction): Promise<void> {
    const actionId = interaction.customId.slice("fight:".length);
    // The board, or (for a party member's private move picker) the fight they're in.
    const onBoard = getFightByMessageId(interaction.message.id);
    const fight = onBoard ?? (interaction.guildId ? getActiveFight(interaction.user.id, interaction.guildId) : null);
    if (!fight || fight.resolved) {
        if (onBoard || !interaction.message.flags.has(MessageFlags.Ephemeral)) await interaction.update({ components: [] });
        else await interaction.update({ content: "That fight is over.", components: [] });
        return;
    }
    const { config } = await getOrCreateGuildConfig({ discordGuildId: fight.guildId });

    if (actionId === "join") return joinButton(interaction, fight, config);

    const member = fight.members.find((m) => m.userId === interaction.user.id);
    if (!member || member.out) {
        const why = member?.out === "down" ? "You're knocked out: the fight goes on without you."
            : cantJoin(fight, interaction.user.id, config) === null ? "This isn't your fight yet: click **Join** to help." : "This isn't your fight!";
        await interaction.reply({ content: why, flags: MessageFlags.Ephemeral });
        return;
    }

    const cached = await getOrCreateProfile({ userId: member.dbUserId, guildId: fight.dbGuildId });
    const profile = cached.profile;

    // In a party, each player picks privately: their own moves and potions.
    if (actionId === "choose") {
        await interaction.reply({
            content: `❤️ **${member.hp}** / **${member.stats.maxHp}**${member.pick ? ` · picked ${pickLabel(member.pick, config)}, pick again to change it` : ""}`,
            components: buildActionRows(member, profile, config),
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    await interaction.deferUpdate();
    // Only checked here: the potion is used up when the round plays, so changing your pick doesn't waste one.
    if (actionId.startsWith("potion:") && (profile.inventory?.[actionId.slice("potion:".length)]?.quantity ?? 0) < 1) {
        await interaction.followUp({ content: "You don't have any of those left.", flags: MessageFlags.Ephemeral });
        return;
    }
    const pick = submitPick(fight, member.userId, actionId, config);
    if (pick.refused) {
        await interaction.followUp({ content: pick.refused, flags: MessageFlags.Ephemeral });
        return;
    }

    // Alone, or the last to pick: the round plays now. Checked and resolved
    // without awaiting in between, so two last picks can't both play it.
    if (fight.members.length === 1 || everyonePicked(fight)) {
        if (fight !== onBoard) await interaction.editReply({ content: `✅ ${pickLabel(actionId, config)}: the round is playing.`, components: [] });
        const settled = await playRound(fight, interaction.client);
        const mine = settled.find((r) => r.member.userId === member.userId)?.summary;
        if (mine?.outcome === "win") await tip(interaction, member.dbUserId, fight.dbGuildId, config, "firstWin");
        if (mine?.outcome === "loss" || mine?.knockedOut) await tip(interaction, member.dbUserId, fight.dbGuildId, config, "firstLoss");
        return;
    }
    if (fight !== onBoard) await interaction.editReply({ content: `✅ You picked ${pickLabel(actionId, config)}. Waiting for the others…`, components: [] });
    scheduleRound(fight, interaction.client, config); // restarts the clock after a round that waited
    await editBoard(interaction.client, fight, await boardView(fight, config, [], null));
}

/** "🪓 Heavy Strike" for a pick's action id. */
function pickLabel(actionId: string, config: GuildConfig): string {
    if (actionId.startsWith("move:")) {
        const m = moveById(config, actionId.slice("move:".length));
        return `${m.emoji} **${m.name}**`;
    }
    if (actionId.startsWith("potion:")) return `🧪 **${config.shop?.items?.[actionId.slice("potion:".length)]?.name ?? "a potion"}**`;
    return actionId === "flee" ? "🏃 **Flee**" : "⏳ **Wait**";
}

/** Someone joins a fight in progress: same checks as starting one, then the enemy toughens up. */
async function joinButton(interaction: ButtonInteraction, fight: ActiveFight, config: GuildConfig): Promise<void> {
    const no = cantJoin(fight, interaction.user.id, config);
    if (no) return void await interaction.reply({ content: no, flags: MessageFlags.Ephemeral });
    if (!interaction.guildId) return;
    const ready = await readyToFight(interaction.user, interaction.guildId);
    if (!ready.ok) return void await interaction.reply({ content: ready.message, flags: MessageFlags.Ephemeral });
    const { profile } = ready;
    const enemy = fight.enemy;
    const level = combatLevel(profile, config);
    const inRange = level >= enemy.minLevel && (enemy.maxLevel === null || level <= enemy.maxLevel);
    if (partyRules(config).levelRange && !inRange) {
        return void await interaction.reply({
            content: `You need Combat **${enemy.minLevel}**${enemy.maxLevel !== null ? `–${enemy.maxLevel}` : "+"} to fight **${enemy.emoji} ${enemy.name}**.`,
            flags: MessageFlags.Ephemeral,
        });
    }
    const facts = memberFacts(interaction.member);
    const gate = checkRequirements(enemy.requirements, { profile, config, facts });
    if (!gate.ok) return void await interaction.reply({ content: `**${enemy.emoji} ${enemy.name}**: ${gate.message}`, flags: MessageFlags.Ephemeral });
    // Re-checked after the awaits: two people can click Join for the last spot at once.
    const late = cantJoin(fight, interaction.user.id, config);
    if (late) return void await interaction.reply({ content: late, flags: MessageFlags.Ephemeral });

    const name = interaction.member && "displayName" in interaction.member ? interaction.member.displayName : interaction.user.displayName;
    joinFight(fight, newMember({
        discordUserId: interaction.user.id, name, profile, config, loadout: loadoutFor(profile, config, facts),
        avatarUrl: interaction.user.displayAvatarURL({ extension: "png", size: 128 }),
    }), config);
    scheduleRound(fight, interaction.client, config);
    if (interaction.channel?.isThread()) await interaction.channel.members.add(interaction.user.id).catch(() => null);
    // Answered first (the picture takes a moment), then the board redrawn.
    await interaction.deferUpdate();
    await interaction.editReply(await boardView(fight, config, [`🙋 **${name}** joins the fight! The ${enemy.emoji} ${enemy.name} grows stronger.`], null));
    await tip(interaction, profile.user_id, profile.guild_id, config, "firstParty");
}
