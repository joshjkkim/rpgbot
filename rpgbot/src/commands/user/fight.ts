import type { ButtonInteraction, ChatInputCommandInteraction, ColorResolvable } from "discord.js";
import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    EmbedBuilder, MessageFlags, SlashCommandBuilder,
} from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateProfile } from "../../cache/profileService.js";
import { calculateStats, resolveCurrentHp } from "../../player/combat.js";
import {
    COMBAT_ACTIONS, applyAction, applyFightRewards,
    getActiveFight, getFightByMessageId, pickRandomEnemy, startFight,
} from "../../player/fight.js";
import type { ActiveFight, EnemyConfig, FightEndSummary } from "../../types/combat.js";
import type { GuildConfig } from "../../types/guild.js";

// ─── Slash command definition ─────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
    .setName("fight")
    .setDescription("Fight an enemy for XP and gold!")
    .addStringOption(opt =>
        opt.setName("enemy")
            .setDescription("Enemy ID to fight (leave blank for a random eligible enemy)")
            .setRequired(false)
    );

// ─── Embed / UI helpers ───────────────────────────────────────────────────────

function buildHpBar(current: number, max: number, length = 10): string {
    const filled = Math.max(0, Math.round((current / max) * length));
    return "[" + "█".repeat(filled) + "░".repeat(length - filled) + "]";
}

function buildFightEmbed(fight: ActiveFight, config: GuildConfig, log: string[]): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle(`⚔️ vs ${fight.enemy.emoji} ${fight.enemy.name}`)
        .setColor(config.style.mainThemeColor as ColorResolvable ?? "#00AE86")
        .addFields(
            {
                name: "🧑 You",
                value: [
                    buildHpBar(fight.playerCurrentHp, fight.playerStats.maxHp),
                    `❤️ **${fight.playerCurrentHp}** / **${fight.playerStats.maxHp}**`,
                ].join("\n"),
                inline: true,
            },
            {
                name: `${fight.enemy.emoji} ${fight.enemy.name}`,
                value: [
                    buildHpBar(fight.enemyCurrentHp, fight.enemy.hp),
                    `❤️ **${fight.enemyCurrentHp}** / **${fight.enemy.hp}**`,
                ].join("\n"),
                inline: true,
            },
        )
        .setFooter({ text: `Round ${fight.round + 1}` });

    if (log.length > 0) embed.setDescription(log.join("\n"));
    return embed;
}

function buildEndEmbed(
    fight: ActiveFight,
    summary: FightEndSummary,
    config: GuildConfig,
    playerDisplayName: string,
    log: string[],
): EmbedBuilder {
    const { outcome } = summary;
    const xpName   = config.style.xp.name   || "XP";
    const xpIcon   = config.style.xp.icon   || "⭐";
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
    if (summary.xpGained > 0)   rewardLines.push(`${xpIcon} **+${summary.xpGained}** ${xpName}`);
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

    embed.setFooter({ text: `${playerDisplayName}'s fight` });
    return embed;
}

function buildActionRow(disabled = false): ActionRowBuilder<ButtonBuilder> {
    const buttons = Object.values(COMBAT_ACTIONS).map(action => {
        const style =
            action.style === "primary"  ? ButtonStyle.Primary  :
            action.style === "danger"   ? ButtonStyle.Danger   :
                                          ButtonStyle.Secondary;
        return new ButtonBuilder()
            .setCustomId(`fight:${action.id}`)
            .setLabel(action.label)
            .setEmoji(action.emoji)
            .setStyle(style)
            .setDisabled(disabled);
    });
    return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
}

// ─── /fight command ───────────────────────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
        return;
    }

    const { user: dbUser } = await getOrCreateDbUser({
        discordUserId: interaction.user.id,
        username: interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL(),
    });

    const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });

    // Guard: combat enabled
    if (!config.combat.enabled) {
        await interaction.reply({ content: "⚔️ Combat isn't enabled on this server.", flags: MessageFlags.Ephemeral });
        return;
    }

    // Guard: already in a fight
    if (getActiveFight(interaction.user.id, interaction.guildId)) {
        await interaction.reply({ content: "You're already in a fight! Finish your current battle first.", flags: MessageFlags.Ephemeral });
        return;
    }

    const { profile } = await getOrCreateProfile({ userId: dbUser.id, guildId: dbGuild.id });

    // Guard: HP check
    const stats = calculateStats(profile, config, config.shop?.items ?? {});
    const currentHp = resolveCurrentHp(profile, stats);
    if (currentHp <= 0) {
        await interaction.reply({
            content: `❤️ You have **0 HP** — you need to heal before fighting again!`,
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    // Pick enemy
    const enemyIdOpt = interaction.options.getString("enemy");
    let enemy: EnemyConfig | null;

    if (enemyIdOpt) {
        enemy = config.combat.enemies?.[enemyIdOpt] ?? null;
        if (!enemy) {
            await interaction.reply({
                content: `No enemy found with ID \`${enemyIdOpt}\`. Use \`/config-enemy show\` to see available enemies.`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        const level = profile.level ?? 1;
        if (level < enemy.minLevel || (enemy.maxLevel !== null && level > enemy.maxLevel)) {
            await interaction.reply({
                content: `You need to be level **${enemy.minLevel}**${enemy.maxLevel !== null ? `–${enemy.maxLevel}` : "+"}  to fight **${enemy.emoji} ${enemy.name}**.`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
    } else {
        enemy = pickRandomEnemy(config, profile.level ?? 1);
        if (!enemy) {
            await interaction.reply({
                content: "There are no enemies available for your level. Ask an admin to add some with `/config-enemy add`.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
    }

    // Fights are public — not ephemeral
    await interaction.deferReply();

    const initialEmbed = new EmbedBuilder()
        .setTitle(`⚔️ ${interaction.user.displayName} vs ${enemy.emoji} ${enemy.name}`)
        .setColor(config.style.mainThemeColor as ColorResolvable ?? "#00AE86")
        .setDescription("Choose your action!")
        .addFields(
            {
                name: "🧑 You",
                value: [
                    buildHpBar(currentHp, stats.maxHp),
                    `❤️ **${currentHp}** / **${stats.maxHp}**`,
                ].join("\n"),
                inline: true,
            },
            {
                name: `${enemy.emoji} ${enemy.name}`,
                value: [
                    buildHpBar(enemy.hp, enemy.hp),
                    `❤️ **${enemy.hp}** / **${enemy.hp}**`,
                ].join("\n"),
                inline: true,
            },
        )
        .setFooter({ text: "Round 1 · Your turn" });

    const row = buildActionRow();
    const reply = await interaction.editReply({ embeds: [initialEmbed], components: [row] });

    // Register the fight now that we have the real message ID
    startFight({
        discordUserId: interaction.user.id,
        discordGuildId: interaction.guildId,
        messageId: reply.id,
        channelId: interaction.channelId,
        combatType: "pve",
        profile,
        enemy,
        config,
    });
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
    const { profile } = await getOrCreateProfile({ userId: dbUser.id, guildId: dbGuild.id });

    const { fight: updatedFight, result, ended, summary } = applyAction(
        fight, actionId, dbGuild, profile, config,
    );

    if (ended && summary) {
        await applyFightRewards(summary, updatedFight, profile, config);
        const endEmbed = buildEndEmbed(
            updatedFight, summary, config, interaction.user.displayName, result.log,
        );
        await interaction.editReply({ embeds: [endEmbed], components: [] });
        return;
    }

    // Fight continues — update embed with new HP values and last round log
    const updatedEmbed = buildFightEmbed(updatedFight, config, result.log);
    await interaction.editReply({ embeds: [updatedEmbed], components: [buildActionRow()] });
}
