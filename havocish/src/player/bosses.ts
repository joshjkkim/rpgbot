import type { ButtonInteraction, Client, ColorResolvable, Message, SendableChannels } from "discord.js";
import { announceRareFinds } from "../ui/rareFinds.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from "discord.js";
import type { EnemyConfig, FightEndSummary } from "../types/combat.js";
import type { GuildConfig } from "../types/guild.js";
import { canPost } from "./canPost.js";
import { commitProfileChanges, getOrCreateProfile } from "../cache/profileService.js";
import { getOrCreateDbUser } from "../cache/userService.js";
import { getOrCreateGuildConfig } from "../cache/guildService.js";
import { afterLoss, calculateStats, resolveCurrentHp, storeHp, woundedUntil, woundLine } from "./combat.js";
import { applyFightRewards, getActiveFight, resolveHit } from "./fight.js";
import { checkProgress } from "./collections.js";
import { readyToFight } from "../commands/user/fight.js";
import { enemyMoveList, moveById } from "./moves.js";
import { query } from "../db/index.js";
import { editSpoken, lineOf, speak, speaker } from "../ui/characters.js";

/**
 * World bosses: one big enemy the whole server fights together. Everyone hits
 * it from a single message. The boss acts in waves: its next move is shown as
 * the message's headline, everyone can Guard against it, and when it lands it
 * hits everyone fighting. When it falls its XP and gold are split by damage
 * dealt, and the top damage dealer rolls its drops.
 *
 * Bosses spawn by chance on XP-earning messages (like encounters, but rarer) or
 * when a manager picks one in /fight. One per server at a time.
 *
 * Live bosses are kept in memory and mirrored to the live_bosses table, so a
 * restart picks them back up (restoreBosses) instead of losing the fight.
 * Attack cooldowns are not saved; they reset on restart.
 */

const DEFAULTS = { chancePercent: 0.2, cooldownSeconds: 6 * 3600, durationSeconds: 30 * 60, attackCooldownSeconds: 20, strikeSeconds: 25 };
/** Guarding takes this share off a wave. */
const GUARD_BLOCK = 0.7;
/** Everyone who landed a hit gets at least this share of the pool. */
const FLOOR_SHARE = 0.05;
/** Discord rate-limits message edits, so many attacks at once redraw the boss at most this often. */
const REDRAW_MS = 1500;

type Fighter = { username: string; damage: number; taken: number; hits: number };

type LiveBoss = {
    enemy: EnemyConfig;
    hp: number;
    discordGuildId: string;
    message: Message;
    endsAt: number;
    fighters: Map<string, Fighter>;
    lastAttackAt: Map<string, number>;
    ended: boolean;
    escapeTimer: NodeJS.Timeout;
    redrawTimer: NodeJS.Timeout | null;
    /** The move its next wave will be, shown before it lands. */
    intent: string;
    strikeAt: number;
    waveTimer: NodeJS.Timeout | null;
    /** Who braced for the coming wave. */
    guards: Set<string>;
    /** Until the next wave: hits on it lose this share (a guard move). */
    guarding: number;
    /** What the last wave did, for the message. */
    lastWave: string | null;
    /** Each fighter's latest button press, to tell them privately what a wave did to them. */
    touch: Map<string, ButtonInteraction>;
};

/** Discord guild id -> its live boss. */
const live = new Map<string, LiveBoss>();
/** Discord guild id -> when its last random boss appeared. */
const lastSpawnAt = new Map<string, number>();

export function bossesIn(config: GuildConfig): EnemyConfig[] {
    return Object.values(config.combat.enemies ?? {}).filter((e) => e.boss);
}

export function liveBoss(discordGuildId: string) {
    return live.get(discordGuildId) ?? null;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function saveBoss(boss: LiveBoss) {
    return query(
        `INSERT INTO live_bosses (discord_guild_id, channel_id, message_id, enemy, hp, ends_at, fighters, updated_at)
         VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0), $7, NOW())
         ON CONFLICT (discord_guild_id) DO UPDATE SET
             channel_id = EXCLUDED.channel_id, message_id = EXCLUDED.message_id, enemy = EXCLUDED.enemy,
             hp = EXCLUDED.hp, ends_at = EXCLUDED.ends_at, fighters = EXCLUDED.fighters, updated_at = NOW()`,
        [boss.discordGuildId, boss.message.channelId, boss.message.id, JSON.stringify(boss.enemy),
            boss.hp, boss.endsAt, JSON.stringify(Object.fromEntries(boss.fighters))],
    ).catch((err) => console.error(`Saving the boss in ${boss.discordGuildId} failed:`, err));
}

function forgetBoss(discordGuildId: string) {
    return query(`DELETE FROM live_bosses WHERE discord_guild_id = $1`, [discordGuildId])
        .catch((err) => console.error(`Removing the saved boss in ${discordGuildId} failed:`, err));
}

/** Saves every live boss's latest HP and damage. Called on shutdown, before the process exits. */
export async function saveLiveBosses() {
    await Promise.all([...live.values()].filter((b) => !b.ended).map(saveBoss));
}

function arm(boss: LiveBoss, config: GuildConfig) {
    boss.escapeTimer = setTimeout(() => void finish(boss, "escaped"), Math.max(0, boss.endsAt - Date.now()));
    boss.escapeTimer.unref();
    live.set(boss.discordGuildId, boss);
    scheduleWave(boss, config);
}

/** The boss's next move, by its moves' weights; heal moves only when it's hurt. */
export function nextIntent(boss: Pick<LiveBoss, "enemy" | "hp">, config: GuildConfig): string {
    const hurt = boss.hp < boss.enemy.hp * 0.5;
    const options = enemyMoveList(boss.enemy).filter((m) => {
        const move = moveById(config, m.moveId);
        if (m.when?.type === "selfHpBelow") return boss.hp < (boss.enemy.hp * m.when.percent) / 100;
        return hurt || !move.effects.some((e) => e.type === "heal" && (e.target ?? "self") === "self");
    });
    const total = options.reduce((sum, m) => sum + Math.max(0, m.weight ?? 1), 0);
    let r = Math.random() * total;
    for (const m of options) {
        r -= Math.max(0, m.weight ?? 1);
        if (r < 0) return moveById(config, m.moveId).id;
    }
    return moveById(config, "attack").id;
}

function scheduleWave(boss: LiveBoss, config: GuildConfig) {
    if (boss.ended) return;
    if (boss.waveTimer) clearTimeout(boss.waveTimer);
    const ms = (config.combat.bosses?.strikeSeconds ?? DEFAULTS.strikeSeconds) * 1000;
    if (!boss.intent) boss.intent = nextIntent(boss, config);
    boss.strikeAt = Date.now() + ms;
    boss.waveTimer = setTimeout(() => void wave(boss).catch((err) => console.error("Boss wave failed:", err)), ms);
    boss.waveTimer.unref();
}

/**
 * The boss's move lands. Its hits strike everyone who fought in the last two
 * waves (guarded ones take far less); a guard move makes it harder to hurt
 * until the next wave; a heal heals it. Then the next move is picked and shown.
 */
async function wave(boss: LiveBoss) {
    if (boss.ended) return;
    const { config } = await getOrCreateGuildConfig({ discordGuildId: boss.discordGuildId });
    const move = moveById(config, boss.intent);
    const power = move.effects.reduce((sum, e) => sum + (e.type === "hit" && e.target !== "self" ? e.power * (e.hits ?? 1) : 0), 0);
    const guard = move.effects.reduce((sum, e) => sum + (e.type === "guard" ? e.percent : 0), 0);
    const heal = move.effects.reduce((sum, e) => sum + (e.type === "heal" && (e.target ?? "self") === "self" ? e.percent : 0), 0);
    // Only those who attacked since the last wave (or braced for this one) are in its path.
    const recent = boss.strikeAt - (config.combat.bosses?.strikeSeconds ?? DEFAULTS.strikeSeconds) * 1000;
    const targets = [...boss.fighters.keys()].filter((id) => (boss.lastAttackAt.get(id) ?? 0) >= recent || boss.guards.has(id));

    let hitCount = 0;
    let guarded = 0;
    if (power > 0) {
        for (const id of targets) {
            // Someone in a /fight has their HP held by it, which would overwrite this.
            if (getActiveFight(id, boss.discordGuildId)) continue;
            const { user } = await getOrCreateDbUser({ discordUserId: id });
            const { guild } = await getOrCreateGuildConfig({ discordGuildId: boss.discordGuildId });
            const { profile } = await getOrCreateProfile({ userId: user.id, guildId: guild.id });
            const stats = calculateStats(profile, config, config.shop?.items ?? {});
            const hp = resolveCurrentHp(profile, stats, config);
            if (hp <= 0) continue;
            const braced = boss.guards.has(id);
            const raw = resolveHit(boss.enemy.atk * power, stats.def, boss.enemy.critChance, boss.enemy.critMultiplier).damage;
            const taken = Math.max(1, Math.round(raw * (braced ? 1 - GUARD_BLOCK : 1)));
            // Knocked out, it's the same as losing a fight: back at the respawn share.
            const down = hp - taken <= 0;
            const userStats = { ...(profile.user_stats ?? {}), ...(down ? afterLoss(stats, config) : storeHp(hp - taken)) };
            const after = userStats.currentHp;
            profile.user_stats = userStats;
            commitProfileChanges({ userId: profile.user_id, guildId: profile.guild_id, profile, changes: { user_stats: userStats }, baseline: { xp: profile.xp, gold: profile.gold } });
            const fighter = boss.fighters.get(id);
            if (fighter) fighter.taken += taken;
            hitCount++;
            if (braced) guarded++;
            const told = [
                `${move.emoji} **${move.name}** hit you for **${taken}**${braced ? ` (🛡️ guarded: ${Math.round(GUARD_BLOCK * 100)}% blocked)` : ""}.`,
                down ? `💀 Knocked out. You're back at ❤️ ${after} / ${stats.maxHp}.` : `❤️ ${after} / ${stats.maxHp}`,
                ...(() => {
                    const wound = down ? woundedUntil(profile, config) : null;
                    return wound ? [woundLine(wound.status, wound.until)] : [];
                })(),
                "-# Attack again to stay in; stop and the next one skips you.",
            ].join("\n");
            void boss.touch.get(id)?.followUp({ content: told, flags: MessageFlags.Ephemeral }).catch(() => null);
        }
    }
    boss.guarding = Math.min(90, guard) / 100;
    if (heal > 0) boss.hp = Math.min(boss.enemy.hp, boss.hp + Math.round((boss.enemy.hp * heal) / 100));
    boss.lastWave = [
        `${move.emoji} **${move.name}**`,
        power > 0 ? (hitCount ? `hit ${hitCount} fighter${hitCount === 1 ? "" : "s"}${guarded ? `, ${guarded} guarded` : ""}` : "hit nobody") : "",
        guard > 0 ? "it's guarding: hits do less until its next move" : "",
        heal > 0 ? "it healed" : "",
    ].filter(Boolean).join(" · ");

    // It may have fallen while this wave was landing: its victory message stays.
    if (boss.ended) return;
    boss.guards.clear();
    boss.intent = nextIntent(boss, config);
    scheduleWave(boss, config);
    await editSpoken(boss.message, { embeds: [bossEmbed(boss, config)], components: [attackRow()] }).catch(() => null);
}

/**
 * Picks up the bosses that were live when the bot last stopped. A boss whose
 * time ran out while the bot was down escapes straight away; one whose message
 * is gone (deleted, or the bot lost access) is dropped.
 */
export async function restoreBosses(client: Client): Promise<number> {
    const { rows } = await query<{
        guild_id: string; channel_id: string; message_id: string;
        enemy: EnemyConfig; hp: number; ends_at: Date; fighters: Record<string, Fighter>;
    }>(
        `SELECT discord_guild_id::text AS guild_id, channel_id::text AS channel_id, message_id::text AS message_id,
                enemy, hp, ends_at, fighters
         FROM live_bosses`,
    );

    let restored = 0;
    for (const row of rows) {
        const channel = await client.channels.fetch(row.channel_id).catch(() => null);
        const message = channel?.isTextBased() ? await channel.messages.fetch(row.message_id).catch(() => null) : null;
        if (!message) {
            await forgetBoss(row.guild_id);
            continue;
        }
        arm({
            enemy: row.enemy,
            hp: row.hp,
            discordGuildId: row.guild_id,
            message,
            endsAt: new Date(row.ends_at).getTime(),
            fighters: new Map(Object.entries(row.fighters ?? {})),
            lastAttackAt: new Map(),
            ended: false,
            escapeTimer: undefined as unknown as NodeJS.Timeout,
            redrawTimer: null,
            intent: "", strikeAt: 0, waveTimer: null, guards: new Set(), guarding: 0, lastWave: null, touch: new Map(),
        }, (await getOrCreateGuildConfig({ discordGuildId: row.guild_id })).config);
        restored++;
    }
    return restored;
}

/** Called for every message that earned XP. Rarely, wakes a boss. */
export async function maybeSpawnBoss(message: Message<true>, config: GuildConfig) {
    const cfg = config.combat.bosses;
    if (!config.combat.enabled || !cfg?.enabled || live.has(message.guildId)) return;
    if (cfg.channelIds?.length && !cfg.channelIds.includes(message.channelId)) return;

    const now = Date.now();
    if (now - (lastSpawnAt.get(message.guildId) ?? 0) < (cfg.cooldownSeconds ?? DEFAULTS.cooldownSeconds) * 1000) return;
    if (Math.random() * 100 >= (cfg.chancePercent ?? DEFAULTS.chancePercent)) return;

    const bosses = bossesIn(config);
    const enemy = bosses[Math.floor(Math.random() * bosses.length)];
    if (!enemy || !canPost(message)) return;
    lastSpawnAt.set(message.guildId, now);
    await spawnBoss(message.channel, message.guildId, config, enemy);
}

/** Puts a boss in the channel. Callers check there is no live boss already. */
export async function spawnBoss(channel: SendableChannels, discordGuildId: string, config: GuildConfig, enemy: EnemyConfig) {
    const durationMs = (config.combat.bosses?.durationSeconds ?? DEFAULTS.durationSeconds) * 1000;
    const endsAt = Date.now() + durationMs;
    const strikeAt = Date.now() + (config.combat.bosses?.strikeSeconds ?? DEFAULTS.strikeSeconds) * 1000;
    const draft = { enemy, hp: enemy.hp, endsAt, fighters: new Map<string, Fighter>(), intent: "", strikeAt, guarding: 0, lastWave: null };
    draft.intent = nextIntent(draft, config);
    // A boss with a character arrives in its own voice.
    const who = speaker(config, enemy.characterId);
    const line = lineOf(who);
    const message = await speak(channel, who, { ...(line && { content: line }), embeds: [bossEmbed(draft, config)], components: [attackRow()] });

    const boss: LiveBoss = {
        ...draft,
        discordGuildId,
        message,
        lastAttackAt: new Map(),
        ended: false,
        escapeTimer: undefined as unknown as NodeJS.Timeout,
        redrawTimer: null,
        waveTimer: null,
        guards: new Set(),
        touch: new Map(),
    };
    arm(boss, config);
    await saveBoss(boss);
    return boss;
}

function hpBar(current: number, max: number, length = 20) {
    const filled = Math.max(0, Math.round((current / max) * length));
    return "█".repeat(filled) + "░".repeat(length - filled);
}

function topFighters(fighters: Map<string, Fighter>, n: number) {
    return [...fighters.entries()].sort((a, b) => b[1].damage - a[1].damage).slice(0, n);
}

function bossEmbed(boss: Pick<LiveBoss, "enemy" | "hp" | "endsAt" | "fighters" | "intent" | "strikeAt" | "guarding" | "lastWave">, config: GuildConfig) {
    const { enemy } = boss;
    const goldIcon = config.style.gold.icon || "💰";
    const top = topFighters(boss.fighters, 5)
        .map(([id, f], i) => `${["🥇", "🥈", "🥉", "4.", "5."][i]} <@${id}> · ${f.damage} dmg`);
    // What's coming leads, as on any fight: the whole channel reads it and decides together.
    const move = moveById(config, boss.intent || "attack");
    const big = move.effects.reduce((sum, e) => sum + (e.type === "hit" && e.target !== "self" ? e.power * (e.hits ?? 1) : 0), 0) >= 1.5;

    return new EmbedBuilder()
        .setTitle(`${enemy.emoji} WORLD BOSS: ${enemy.name}`)
        .setColor(big ? "#B03A2E" : config.style.mainThemeColor as ColorResolvable ?? "#00AE86")
        .setDescription([
            `### ${big ? "❗" : "👁️"} ${enemy.name} ${move.telegraph ?? `prepares ${move.name}.`}`,
            `-# ${move.emoji} ${move.name} lands <t:${Math.ceil(boss.strikeAt / 1000)}:R>${big ? " · 🛡️ Guard to take far less" : ""}`,
            ...(boss.lastWave ? [`-# Last: ${boss.lastWave}`] : []),
            "",
            `\`${hpBar(boss.hp, enemy.hp)}\``,
            `❤️ **${boss.hp.toLocaleString()}** / ${enemy.hp.toLocaleString()} · ⚔️ ${enemy.atk} ATK · 🛡️ ${enemy.def} DEF`,
            "",
            `Everyone can fight! Rewards are split by damage: ⚔️ ${enemy.xpReward} Combat XP · ${goldIcon} ${enemy.goldReward}${boss.guarding ? `\n🛡️ It's guarding: hits do ${Math.round(boss.guarding * 100)}% less.` : ""}`,
            `It escapes <t:${Math.floor(boss.endsAt / 1000)}:R>.`,
        ].join("\n"))
        .addFields({ name: `Fighters (${boss.fighters.size})`, value: top.length ? top.join("\n") : "Nobody yet. Be the first!" });
}

function attackRow() {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("boss:attack").setLabel("Attack").setEmoji("⚔️").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("boss:guard").setLabel("Guard").setEmoji("🛡️").setStyle(ButtonStyle.Secondary),
    );
}

function scheduleRedraw(boss: LiveBoss, config: GuildConfig) {
    if (boss.redrawTimer || boss.ended) return;
    boss.redrawTimer = setTimeout(() => {
        boss.redrawTimer = null;
        if (boss.ended) return;
        void editSpoken(boss.message, { embeds: [bossEmbed(boss, config)] }).catch(() => null);
        void saveBoss(boss);
    }, REDRAW_MS);
    boss.redrawTimer.unref();
}

export async function handleBossButton(interaction: ButtonInteraction) {
    if (!interaction.inCachedGuild()) return;
    const boss = live.get(interaction.guildId);
    if (!boss || boss.ended || boss.message.id !== interaction.message.id) {
        await interaction.reply({ content: "This boss is gone.", flags: MessageFlags.Ephemeral });
        return;
    }

    // Bracing for the coming wave; it uses no attack.
    if (interaction.customId === "boss:guard") {
        boss.guards.add(interaction.user.id);
        boss.touch.set(interaction.user.id, interaction);
        if (!boss.fighters.has(interaction.user.id)) boss.fighters.set(interaction.user.id, { username: interaction.user.username, damage: 0, taken: 0, hits: 0 });
        await interaction.reply({ content: `🛡️ You brace for **${moveById((await getOrCreateGuildConfig({ discordGuildId: interaction.guildId })).config, boss.intent).name}**. It lands <t:${Math.ceil(boss.strikeAt / 1000)}:R> and you'll take ${Math.round(GUARD_BLOCK * 100)}% less.`, flags: MessageFlags.Ephemeral });
        return;
    }

    const cooldownMs = 1000 * ((await getOrCreateGuildConfig({ discordGuildId: interaction.guildId })).config
        .combat.bosses?.attackCooldownSeconds ?? DEFAULTS.attackCooldownSeconds);
    const readyAt = (boss.lastAttackAt.get(interaction.user.id) ?? 0) + cooldownMs;
    if (Date.now() < readyAt) {
        await interaction.reply({ content: `Catch your breath! You can attack again <t:${Math.ceil(readyAt / 1000)}:R>.`, flags: MessageFlags.Ephemeral });
        return;
    }

    const ready = await readyToFight(interaction.user, interaction.guildId);
    if (!ready.ok) {
        await interaction.reply({ content: ready.message, flags: MessageFlags.Ephemeral });
        return;
    }

    // Everything from here to the end of the hit runs without yielding, so
    // concurrent attacks never both land the killing blow or skip the cooldown.
    if (boss.ended) {
        await interaction.reply({ content: "Too late, it's already down!", flags: MessageFlags.Ephemeral });
        return;
    }
    if (Date.now() < (boss.lastAttackAt.get(interaction.user.id) ?? 0) + cooldownMs) {
        await interaction.reply({ content: "Catch your breath!", flags: MessageFlags.Ephemeral });
        return;
    }
    boss.lastAttackAt.set(interaction.user.id, Date.now());
    boss.touch.set(interaction.user.id, interaction);

    const { profile, config, stats, currentHp } = ready;
    const { enemy } = boss;
    const hit = resolveHit(stats.atk, enemy.def, stats.critChance, stats.critMultiplier);
    // A guard move makes its hits land softer until its next wave.
    const dealt = Math.min(Math.max(1, Math.round(hit.damage * (1 - boss.guarding))), boss.hp);
    boss.hp -= dealt;

    const fighter = boss.fighters.get(interaction.user.id) ?? { username: interaction.user.username, damage: 0, taken: 0, hits: 0 };
    fighter.damage += dealt;
    fighter.hits += 1;
    boss.fighters.set(interaction.user.id, fighter);

    const killed = boss.hp <= 0;
    if (killed) boss.ended = true;

    await interaction.reply({
        content: [
            `⚔️ You hit **${enemy.name}** for **${dealt}**${hit.isCrit ? " (critical!)" : ""}${boss.guarding ? " (it's guarding)" : ""}.`,
            killed
                ? "💥 **That was the killing blow!**"
                : `-# You're at ❤️ ${currentHp} / ${stats.maxHp}. Its ${moveById(config, boss.intent).name} hits you <t:${Math.ceil(boss.strikeAt / 1000)}:R> (🛡️ Guard takes ${Math.round(GUARD_BLOCK * 100)}% off).`,
        ].join("\n"),
        flags: MessageFlags.Ephemeral,
    });

    if (killed) await finish(boss, "defeated", config);
    else scheduleRedraw(boss, config);
}

type Payout = { discordUserId: string; xp: number; gold: number; drops: { itemId: string; quantity: number }[] };

/** Splits the pool by damage, with a floor so a single hit still pays. Pure, for the smoke tests. */
export function splitBossRewards(enemy: EnemyConfig, fighters: Map<string, Fighter>, roll = Math.random): Payout[] {
    const total = [...fighters.values()].reduce((sum, f) => sum + f.damage, 0);
    if (total <= 0) return [];
    const [topId] = topFighters(fighters, 1)[0] ?? [];

    return [...fighters.entries()].map(([id, f]) => {
        const share = Math.max(f.damage / total, FLOOR_SHARE);
        return {
            discordUserId: id,
            xp: Math.round(enemy.xpReward * share),
            gold: Math.round(enemy.goldReward * share),
            drops: id === topId
                ? (enemy.drops ?? []).filter((d) => roll() < d.chance).map((d) => ({ itemId: d.itemId, quantity: d.quantity }))
                : [],
        };
    });
}

/** Ends the server's live boss now, with no rewards: /boss dismiss. Returns it, or null when there's none. */
export async function dismissBoss(discordGuildId: string) {
    const boss = live.get(discordGuildId);
    if (!boss || boss.ended) return null;
    await finish(boss, "dismissed");
    return boss;
}

async function finish(boss: LiveBoss, outcome: "defeated" | "escaped" | "dismissed", known?: GuildConfig) {
    boss.ended = true;
    clearTimeout(boss.escapeTimer);
    if (boss.waveTimer) clearTimeout(boss.waveTimer);
    if (boss.redrawTimer) clearTimeout(boss.redrawTimer);
    if (live.get(boss.discordGuildId) === boss) {
        live.delete(boss.discordGuildId);
        await forgetBoss(boss.discordGuildId);
    }

    const config = known ?? (await getOrCreateGuildConfig({ discordGuildId: boss.discordGuildId })).config;
    const { enemy } = boss;
    const goldIcon = config.style.gold.icon || "💰";

    if (outcome !== "defeated") {
        await editSpoken(boss.message, {
            embeds: [new EmbedBuilder()
                .setTitle(outcome === "escaped" ? `${enemy.emoji} ${enemy.name} escaped!` : `${enemy.emoji} ${enemy.name} was sent away`)
                .setColor("#555555")
                .setDescription(outcome === "escaped"
                    ? `It got away with ❤️ ${boss.hp.toLocaleString()} HP left. No rewards this time.`
                    : "A server manager ended this fight. No rewards this time.")],
            components: [],
        }).catch(() => null);
        return;
    }

    const payouts = splitBossRewards(enemy, boss.fighters);
    const lines: string[] = [];
    for (const pay of payouts) {
        const fighter = boss.fighters.get(pay.discordUserId)!;
        let quests: string[] = [];
        try {
            quests = await payOut(pay, fighter, enemy, boss.discordGuildId, config);
        } catch (err) {
            console.error(`Boss reward failed for ${pay.discordUserId}:`, err);
        }
        await announceRareFinds({
            client: boss.message.client, config, discordUserId: pay.discordUserId, verb: "found",
            items: pay.drops, where: `from ${enemy.emoji} ${enemy.name}`,
        });
        await checkProgress({ client: boss.message.client, config, discordUserId: pay.discordUserId, discordGuildId: boss.discordGuildId, fallbackChannelId: boss.message.channelId });
        const drops = pay.drops.map((d) => {
            const item = config.shop?.items?.[d.itemId];
            return item ? `${item.emoji ?? "🎁"} ${item.name}` : d.itemId;
        });
        lines.push(`<@${pay.discordUserId}> · ${fighter.damage} dmg · ⚔️ ${pay.xp} · ${goldIcon} ${pay.gold}${drops.length ? ` · ${drops.join(", ")}` : ""}${quests.map((q) => ` · 📜 ${q}`).join("")}`);
    }

    await editSpoken(boss.message, {
        embeds: [new EmbedBuilder()
            .setTitle(`🏆 ${enemy.emoji} ${enemy.name} has fallen!`)
            .setColor("#FFD700")
            .setDescription(lines.slice(0, 20).join("\n") + (lines.length > 20 ? `\n…and ${lines.length - 20} more` : ""))],
        components: [],
    }).catch(() => null);
}

async function payOut(pay: Payout, fighter: Fighter, enemy: EnemyConfig, discordGuildId: string, config: GuildConfig): Promise<string[]> {
    const { user } = await getOrCreateDbUser({ discordUserId: pay.discordUserId, username: fighter.username });
    const { guild } = await getOrCreateGuildConfig({ discordGuildId });
    const { profile } = await getOrCreateProfile({ userId: user.id, guildId: guild.id });
    const stats = calculateStats(profile, config, config.shop?.items ?? {});

    const summary: FightEndSummary = {
        outcome: "win",
        xpGained: pay.xp,
        goldGained: pay.gold,
        goldLost: 0,
        itemsDropped: pay.drops,
        rounds: fighter.hits,
        totalDamageDealt: fighter.damage,
        totalDamageTaken: fighter.taken,
    };
    // applyFightRewards reads only the HP, combat type and enemy off the fight.
    await applyFightRewards(summary, { combatType: "pve", enemy }, { hp: resolveCurrentHp(profile, stats, config), stats }, profile, config);
    return summary.questsCompleted ?? [];
}
