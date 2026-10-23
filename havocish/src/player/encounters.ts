import type { ButtonInteraction, ColorResolvable, Message } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from "discord.js";
import type { EnemyConfig, PlaceConfig } from "../types/combat.js";
import type { GuildConfig } from "../types/guild.js";
import { canPost } from "./canPost.js";
import { checkRequirements, memberFacts } from "./requirements.js";
import { combatLevel } from "./combatLevel.js";
import { pickRandomEnemy, startFight } from "./fight.js";
import { channelChain, fightsInThread, pickFromPlace, placeFor } from "./places.js";
import { loadoutFor } from "./moves.js";
import { tipOnce } from "./tips.js";
import { boardView, placeFight, readyToFight } from "../commands/user/fight.js";

/**
 * Random encounters: while people chat, a wild enemy sometimes turns up in the
 * channel. The first member to click Fight takes it on, and the encounter
 * message becomes their fight. Unclaimed, it leaves after a while.
 *
 * State is in memory only. A restart forgets pending encounters; their buttons
 * then answer "it's gone", which is the right outcome anyway.
 */

const DEFAULTS = { chancePercent: 2, cooldownSeconds: 600, fleeSeconds: 120 };

type Pending = { enemy: EnemyConfig; place: PlaceConfig | null; guildId: string; claimed: boolean; timer: NodeJS.Timeout };

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

    // Matched to whoever's chatting, so the enemy suits the people likely to be around,
    // and drawn from the channel's place when it has one.
    const place = placeFor(config, channelChain(message.channel as any));
    const enemy = place ? pickFromPlace(place, config, authorLevel) : pickRandomEnemy(config, authorLevel);
    if (!enemy || !canPost(message)) return;
    lastSpawnAt.set(message.guildId, now);

    const fleeSeconds = enc.fleeSeconds ?? DEFAULTS.fleeSeconds;
    const sent = await message.channel.send({
        embeds: [encounterEmbed(enemy, place, config, fleeSeconds)],
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
    pending.set(sent.id, { enemy, place, guildId: message.guildId, claimed: false, timer });
}

function encounterEmbed(enemy: EnemyConfig, place: PlaceConfig | null, config: GuildConfig, fleeSeconds: number) {
    const goldIcon = config.style.gold.icon || "💰";
    const level = enemy.maxLevel !== null ? `Combat ${enemy.minLevel}–${enemy.maxLevel}` : `Combat ${enemy.minLevel}+`;
    return new EmbedBuilder()
        .setTitle(`${enemy.emoji} A wild ${enemy.name} ${place?.arrival || "appears"}!`)
        .setColor(config.style.mainThemeColor as ColorResolvable ?? "#00AE86")
        .setDescription([
            `❤️ ${enemy.hp} HP · ⚔️ ${enemy.atk} ATK · 🛡️ ${enemy.def} DEF`,
            `Reward: ⚔️ ${enemy.xpReward} Combat XP · ${goldIcon} ${enemy.goldReward}`,
            "",
            `First to click **Fight** takes it on. It leaves <t:${Math.floor(Date.now() / 1000) + fleeSeconds}:R>.`,
        ].join("\n"))
        .setFooter({ text: place ? `${place.emoji} ${place.name} · ${level}` : level });
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

    const { enemy, place } = encounter;
    const ready = await readyToFight(interaction.user, interaction.guildId);
    if (!ready.ok) {
        await interaction.reply({ content: ready.message, flags: MessageFlags.Ephemeral });
        return;
    }
    const level = combatLevel(ready.profile, ready.config);
    if (level < enemy.minLevel || (enemy.maxLevel !== null && level > enemy.maxLevel)) {
        await interaction.reply({
            content: `You need Combat **${enemy.minLevel}**${enemy.maxLevel !== null ? `–${enemy.maxLevel}` : "+"} to fight **${enemy.emoji} ${enemy.name}**.`,
            flags: MessageFlags.Ephemeral,
        });
        return;
    }
    const gate = checkRequirements(enemy.requirements, { profile: ready.profile, config: ready.config, facts: memberFacts(interaction.member) });
    if (!gate.ok) {
        await interaction.reply({ content: `**${enemy.emoji} ${enemy.name}**: ${gate.message}`, flags: MessageFlags.Ephemeral });
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

    // In a chat place the encounter shrinks to one line and the fight opens in a
    // thread off it; otherwise the encounter message becomes the fight. Either
    // way its buttons route to /fight's handler.
    const config = ready.config;
    const title = `⚔️ ${interaction.member.displayName} vs ${enemy.emoji} ${enemy.name}`;
    await placeFight({
        home: interaction.message,
        threaded: fightsInThread(config, place),
        line: `${enemy.emoji} <@${interaction.user.id}> takes on the **${enemy.name}**${place ? ` in ${place.emoji} ${place.name}` : ""}. The fight is in the thread.`,
        title,
        userId: interaction.user.id,
        guildId: interaction.guildId,
        editHome: (content) => interaction.update(content as any),
        start: (at) => startFight({
            discordUserId: interaction.user.id,
            discordGuildId: interaction.guildId,
            combatType: "pve",
            profile: ready.profile,
            enemy,
            config,
            loadout: loadoutFor(ready.profile, config, memberFacts(interaction.member)),
            name: interaction.member.displayName,
            ...at,
            ...(place && { placeName: `${place.emoji} ${place.name}` }),
        }),
        show: (fight) => boardView(fight, config, [], ready.profile),
    });
    const tip = await tipOnce(ready.profile.user_id, ready.profile.guild_id, config, "firstFight");
    // A tip is extra: it never gets in the way of the fight.
    if (tip) try { await interaction.followUp({ content: tip, flags: MessageFlags.Ephemeral }); } catch { /* not needed */ }
}
