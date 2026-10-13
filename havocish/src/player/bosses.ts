import type { ButtonInteraction, ColorResolvable, Message, SendableChannels } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from "discord.js";
import type { EnemyConfig, FightEndSummary } from "../types/combat.js";
import type { GuildConfig } from "../types/guild.js";
import { commitProfileChanges, getOrCreateProfile } from "../cache/profileService.js";
import { getOrCreateDbUser } from "../cache/userService.js";
import { getOrCreateGuildConfig } from "../cache/guildService.js";
import { calculateStats, resolveCurrentHp } from "./combat.js";
import { applyFightRewards, resolveHit } from "./fight.js";
import { readyToFight } from "../commands/user/fight.js";

/**
 * World bosses: one big enemy the whole server fights together. Everyone hits
 * it from a single message, it hits back, and when it falls its XP and gold are
 * split by damage dealt. The top damage dealer rolls its drops.
 *
 * Bosses spawn by chance on XP-earning messages (like encounters, but rarer) or
 * when an owner runs /boss summon. One per server at a time, in memory only: a
 * restart loses a live boss, and its button then says so.
 */

const DEFAULTS = { chancePercent: 0.2, cooldownSeconds: 6 * 3600, durationSeconds: 30 * 60, attackCooldownSeconds: 20 };
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
    if (!enemy || !message.channel.isSendable()) return;
    lastSpawnAt.set(message.guildId, now);
    await spawnBoss(message.channel, message.guildId, config, enemy);
}

/** Puts a boss in the channel. Callers check there is no live boss already. */
export async function spawnBoss(channel: SendableChannels, discordGuildId: string, config: GuildConfig, enemy: EnemyConfig) {
    const durationMs = (config.combat.bosses?.durationSeconds ?? DEFAULTS.durationSeconds) * 1000;
    const endsAt = Date.now() + durationMs;
    const draft = { enemy, hp: enemy.hp, endsAt, fighters: new Map<string, Fighter>() };
    const message = await channel.send({ embeds: [bossEmbed(draft, config)], components: [attackRow()] });

    const boss: LiveBoss = {
        ...draft,
        discordGuildId,
        message,
        lastAttackAt: new Map(),
        ended: false,
        escapeTimer: setTimeout(() => void finish(boss, "escaped"), durationMs),
        redrawTimer: null,
    };
    boss.escapeTimer.unref();
    live.set(discordGuildId, boss);
    return boss;
}

function hpBar(current: number, max: number, length = 20) {
    const filled = Math.max(0, Math.round((current / max) * length));
    return "█".repeat(filled) + "░".repeat(length - filled);
}

function topFighters(fighters: Map<string, Fighter>, n: number) {
    return [...fighters.entries()].sort((a, b) => b[1].damage - a[1].damage).slice(0, n);
}

function bossEmbed(boss: Pick<LiveBoss, "enemy" | "hp" | "endsAt" | "fighters">, config: GuildConfig) {
    const { enemy } = boss;
    const xpIcon = config.style.xp.icon || "⭐";
    const goldIcon = config.style.gold.icon || "💰";
    const top = topFighters(boss.fighters, 5)
        .map(([id, f], i) => `${["🥇", "🥈", "🥉", "4.", "5."][i]} <@${id}> · ${f.damage} dmg`);

    return new EmbedBuilder()
        .setTitle(`${enemy.emoji} WORLD BOSS: ${enemy.name}`)
        .setColor(config.style.mainThemeColor as ColorResolvable ?? "#00AE86")
        .setDescription([
            `\`${hpBar(boss.hp, enemy.hp)}\``,
            `❤️ **${boss.hp.toLocaleString()}** / ${enemy.hp.toLocaleString()} · ⚔️ ${enemy.atk} ATK · 🛡️ ${enemy.def} DEF`,
            "",
            `Everyone can fight! Rewards are split by damage: ${xpIcon} ${enemy.xpReward} · ${goldIcon} ${enemy.goldReward}`,
            `It escapes <t:${Math.floor(boss.endsAt / 1000)}:R>.`,
        ].join("\n"))
        .addFields({ name: `Fighters (${boss.fighters.size})`, value: top.length ? top.join("\n") : "Nobody yet. Be the first!" });
}

function attackRow() {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("boss:attack").setLabel("Attack").setEmoji("⚔️").setStyle(ButtonStyle.Danger),
    );
}

function scheduleRedraw(boss: LiveBoss, config: GuildConfig) {
    if (boss.redrawTimer || boss.ended) return;
    boss.redrawTimer = setTimeout(() => {
        boss.redrawTimer = null;
        if (boss.ended) return;
        void boss.message.edit({ embeds: [bossEmbed(boss, config)] }).catch(() => null);
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

    const { profile, config, stats, currentHp } = ready;
    const { enemy } = boss;
    const hit = resolveHit(stats.atk, enemy.def, stats.critChance, stats.critMultiplier);
    const dealt = Math.min(hit.damage, boss.hp);
    boss.hp -= dealt;

    const fighter = boss.fighters.get(interaction.user.id) ?? { username: interaction.user.username, damage: 0, taken: 0, hits: 0 };
    fighter.damage += dealt;
    fighter.hits += 1;
    boss.fighters.set(interaction.user.id, fighter);

    // The boss hits back, unless that was the killing blow.
    const killed = boss.hp <= 0;
    let taken = 0;
    if (!killed) {
        taken = resolveHit(enemy.atk, stats.def, enemy.critChance, enemy.critMultiplier).damage;
        fighter.taken += taken;
        const hpAfter = Math.max(0, currentHp - taken);
        const userStats = { ...(profile.user_stats ?? {}), currentHp: hpAfter };
        profile.user_stats = userStats;
        commitProfileChanges({
            userId: profile.user_id,
            guildId: profile.guild_id,
            profile,
            changes: { user_stats: userStats },
            baseline: { xp: profile.xp, gold: profile.gold },
        });
    }
    if (killed) boss.ended = true;

    const hpAfter = killed ? currentHp : Math.max(0, currentHp - taken);
    await interaction.reply({
        content: [
            `⚔️ You hit **${enemy.name}** for **${dealt}**${hit.isCrit ? " (critical!)" : ""}.`,
            killed
                ? "💥 **That was the killing blow!**"
                : `${enemy.emoji} It hits back for **${taken}**. You're at ❤️ **${hpAfter}** / ${stats.maxHp}.`,
            !killed && hpAfter <= 0 ? "You're out of HP. Heal up before attacking again." : "",
        ].filter(Boolean).join("\n"),
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

async function finish(boss: LiveBoss, outcome: "defeated" | "escaped", known?: GuildConfig) {
    boss.ended = true;
    clearTimeout(boss.escapeTimer);
    if (boss.redrawTimer) clearTimeout(boss.redrawTimer);
    if (live.get(boss.discordGuildId) === boss) live.delete(boss.discordGuildId);

    const config = known ?? (await getOrCreateGuildConfig({ discordGuildId: boss.discordGuildId })).config;
    const { enemy } = boss;
    const xpIcon = config.style.xp.icon || "⭐";
    const goldIcon = config.style.gold.icon || "💰";

    if (outcome === "escaped") {
        await boss.message.edit({
            embeds: [new EmbedBuilder()
                .setTitle(`${enemy.emoji} ${enemy.name} escaped!`)
                .setColor("#555555")
                .setDescription(`It got away with ❤️ ${boss.hp.toLocaleString()} HP left. No rewards this time.`)],
            components: [],
        }).catch(() => null);
        return;
    }

    const payouts = splitBossRewards(enemy, boss.fighters);
    const lines: string[] = [];
    for (const pay of payouts) {
        const fighter = boss.fighters.get(pay.discordUserId)!;
        try {
            await payOut(pay, fighter, boss.discordGuildId, config);
        } catch (err) {
            console.error(`Boss reward failed for ${pay.discordUserId}:`, err);
        }
        const drops = pay.drops.map((d) => {
            const item = config.shop?.items?.[d.itemId];
            return item ? `${item.emoji ?? "🎁"} ${item.name}` : d.itemId;
        });
        lines.push(`<@${pay.discordUserId}> · ${fighter.damage} dmg · ${xpIcon} ${pay.xp} · ${goldIcon} ${pay.gold}${drops.length ? ` · ${drops.join(", ")}` : ""}`);
    }

    await boss.message.edit({
        embeds: [new EmbedBuilder()
            .setTitle(`🏆 ${enemy.emoji} ${enemy.name} has fallen!`)
            .setColor("#FFD700")
            .setDescription(lines.slice(0, 20).join("\n") + (lines.length > 20 ? `\n…and ${lines.length - 20} more` : ""))],
        components: [],
    }).catch(() => null);
}

async function payOut(pay: Payout, fighter: Fighter, discordGuildId: string, config: GuildConfig) {
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
    // applyFightRewards reads only the HP and combat type off the fight.
    await applyFightRewards(summary, { playerCurrentHp: resolveCurrentHp(profile, stats), combatType: "pve" } as any, profile, config);
}
