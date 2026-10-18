import type { ButtonInteraction, ColorResolvable, Message } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from "discord.js";
import type { EnemyConfig } from "../types/combat.js";
import type { GuildConfig } from "../types/guild.js";
import { canPost } from "./canPost.js";
import { pickRandomEnemy, startFight } from "./fight.js";
import { buildActionRow, buildStartEmbed, readyToFight } from "../commands/user/fight.js";

/**
 * Random encounters: while people chat, a wild enemy sometimes turns up in the
 * channel. The first member to click Fight takes it on, and the encounter
 * message becomes their fight. Unclaimed, it leaves after a while.
 *
 * State is in memory only. A restart forgets pending encounters; their buttons
 * then answer "it's gone", which is the right outcome anyway.
 */

const DEFAULTS = { chancePercent: 2, cooldownSeconds: 600, fleeSeconds: 120 };

type Pending = { enemy: EnemyConfig; guildId: string; claimed: boolean; timer: NodeJS.Timeout };

/** Encounter message id -> encounter. */
const pending = new Map<string, Pending>();
/** Discord guild id -> when its last encounter appeared. */
const lastSpawnAt = new Map<string, number>();

/** Called for every message that earned XP. Rolls the dice and, sometimes, spawns an enemy. */
export async function maybeSpawnEncounter(message: Message<true>, config: GuildConfig, authorLevel: number) {
    const enc = config.combat.encounters;
    if (!config.combat.enabled || !enc?.enabled) return;
    if (enc.channelIds?.length && !enc.channelIds.includes(message.channelId)) return;

    const now = Date.now();
    const cooldownMs = (enc.cooldownSeconds ?? DEFAULTS.cooldownSeconds) * 1000;
    if (now - (lastSpawnAt.get(message.guildId) ?? 0) < cooldownMs) return;
    if (Math.random() * 100 >= (enc.chancePercent ?? DEFAULTS.chancePercent)) return;

    // Matched to whoever's chatting, so the enemy suits the people likely to be around.
    const enemy = pickRandomEnemy(config, authorLevel);
    if (!enemy || !canPost(message)) return;
    lastSpawnAt.set(message.guildId, now);

    const fleeSeconds = enc.fleeSeconds ?? DEFAULTS.fleeSeconds;
    const sent = await message.channel.send({
        embeds: [encounterEmbed(enemy, config, fleeSeconds)],
        components: [fightRow()],
    });

    const timer = setTimeout(() => {
        const p = pending.get(sent.id);
        if (!p || p.claimed) return;
        pending.delete(sent.id);
        void sent.edit({
            embeds: [new EmbedBuilder()
                .setDescription(`${enemy.emoji} The **${enemy.name}** wandered off. Nobody took it on.`)
                .setColor("#555555")],
            components: [],
        }).catch(() => null);
    }, fleeSeconds * 1000);
    timer.unref();
    pending.set(sent.id, { enemy, guildId: message.guildId, claimed: false, timer });
}

function encounterEmbed(enemy: EnemyConfig, config: GuildConfig, fleeSeconds: number) {
    const xpIcon = config.style.xp.icon || "⭐";
    const goldIcon = config.style.gold.icon || "💰";
    const level = enemy.maxLevel !== null ? `Level ${enemy.minLevel}–${enemy.maxLevel}` : `Level ${enemy.minLevel}+`;
    return new EmbedBuilder()
        .setTitle(`${enemy.emoji} A wild ${enemy.name} appears!`)
        .setColor(config.style.mainThemeColor as ColorResolvable ?? "#00AE86")
        .setDescription([
            `❤️ ${enemy.hp} HP · ⚔️ ${enemy.atk} ATK · 🛡️ ${enemy.def} DEF`,
            `Reward: ${xpIcon} ${enemy.xpReward} · ${goldIcon} ${enemy.goldReward}`,
            "",
            `First to click **Fight** takes it on. It leaves <t:${Math.floor(Date.now() / 1000) + fleeSeconds}:R>.`,
        ].join("\n"))
        .setFooter({ text: level });
}

function fightRow() {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("encounter:fight").setLabel("Fight").setEmoji("⚔️").setStyle(ButtonStyle.Danger),
    );
}

export async function handleEncounterButton(interaction: ButtonInteraction) {
    if (!interaction.inCachedGuild()) return;
    const encounter = pending.get(interaction.message.id);
    if (!encounter || encounter.claimed) {
        await interaction.reply({ content: "Too late, it's gone!", flags: MessageFlags.Ephemeral });
        return;
    }

    const { enemy } = encounter;
    const ready = await readyToFight(interaction.user, interaction.guildId);
    if (!ready.ok) {
        await interaction.reply({ content: ready.message, flags: MessageFlags.Ephemeral });
        return;
    }
    const level = ready.profile.level ?? 1;
    if (level < enemy.minLevel || (enemy.maxLevel !== null && level > enemy.maxLevel)) {
        await interaction.reply({
            content: `You need to be level **${enemy.minLevel}**${enemy.maxLevel !== null ? `–${enemy.maxLevel}` : "+"} to fight **${enemy.emoji} ${enemy.name}**.`,
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    // Re-checked after the awaits above: two members can click at once, and only
    // the first past this point gets the fight. Nothing below yields before the flag is set.
    if (encounter.claimed || !pending.has(interaction.message.id)) {
        await interaction.reply({ content: "Someone beat you to it!", flags: MessageFlags.Ephemeral });
        return;
    }
    encounter.claimed = true;
    clearTimeout(encounter.timer);
    pending.delete(interaction.message.id);

    // The encounter message becomes the fight, so its buttons route to /fight's handler.
    await interaction.update({
        embeds: [buildStartEmbed(interaction.member.displayName, enemy, ready.currentHp, ready.stats.maxHp, ready.config)],
        components: [buildActionRow(ready.profile, ready.config)],
    });
    startFight({
        discordUserId: interaction.user.id,
        discordGuildId: interaction.guildId,
        messageId: interaction.message.id,
        channelId: interaction.channelId,
        combatType: "pve",
        profile: ready.profile,
        enemy,
        config: ready.config,
    });
}
