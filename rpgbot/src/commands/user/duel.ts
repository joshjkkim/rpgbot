import type { ButtonInteraction, ChatInputCommandInteraction, ColorResolvable } from "discord.js";
import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    EmbedBuilder, MessageFlags, SlashCommandBuilder,
} from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateProfile } from "../../cache/profileService.js";
import { resolveDuel } from "../../db/duel.js";
import { logAndBroadcastEvent } from "../../db/events.js";
import type { DuelResult, PendingDuel } from "../../types/combat.js";
import type { GuildConfig } from "../../types/guild.js";

export const data = new SlashCommandBuilder()
    .setName("duel")
    .setDescription("Challenge another member to a duel")
    .addUserOption(opt =>
        opt.setName("opponent")
            .setDescription("Who to challenge")
            .setRequired(true)
    )
    .addIntegerOption(opt =>
        opt.setName("wager")
            .setDescription("Gold each side stakes (0 for a friendly duel)")
            .setMinValue(0)
            .setRequired(false)
    );

// ─── Pending challenges ───────────────────────────────────────────────────────
// Keyed by the challenge message id, which is what the accept/decline buttons
// carry. In memory only: an unanswered challenge is not worth persisting, and
// a restart cancelling it is the desired behaviour.

const pendingDuels = new Map<string, PendingDuel>();

/** One outstanding challenge per player per guild, in either direction. */
function hasOpenChallenge(discordGuildId: string, ...discordUserIds: string[]): boolean {
    const now = Date.now();
    for (const duel of pendingDuels.values()) {
        if (duel.discordGuildId !== discordGuildId) continue;
        if (duel.expiresAt <= now) continue;
        if (discordUserIds.includes(duel.challengerDiscordId)) return true;
        if (discordUserIds.includes(duel.opponentDiscordId)) return true;
    }
    return false;
}

export function cleanupExpiredDuels(): number {
    const now = Date.now();
    let removed = 0;
    for (const [messageId, duel] of pendingDuels) {
        if (duel.expiresAt <= now) {
            pendingDuels.delete(messageId);
            removed++;
        }
    }
    return removed;
}

// ─── Embeds ───────────────────────────────────────────────────────────────────

function themeColor(config: GuildConfig): ColorResolvable {
    return (config.style?.mainThemeColor as ColorResolvable) ?? "#00AE86";
}

function goldLabel(config: GuildConfig): string {
    return `${config.style?.gold?.name ?? "Gold"} ${config.style?.gold?.icon ?? "💰"}`.trim();
}

function buildChallengeEmbed(
    challengerId: string,
    opponentId: string,
    wager: number,
    config: GuildConfig,
    expiresAt: number
): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle("⚔️ Duel challenge")
        .setColor(themeColor(config))
        .setDescription(
            `<@${challengerId}> has challenged <@${opponentId}>!` +
            (wager > 0 ? `\n\nEach side stakes **${wager}** ${goldLabel(config)}.` : "\n\nNo wager — bragging rights only.")
        )
        .addFields({
            name: "Expires",
            value: `<t:${Math.floor(expiresAt / 1000)}:R>`,
            inline: true,
        })
        .setFooter({ text: "Only the challenged member can respond." });
}

/** Condenses the round log so a long duel still fits inside an embed. */
function summariseRounds(result: DuelResult, challengerId: string, opponentId: string): string {
    const lines = result.rounds.slice(0, 12).map((r) => {
        const who = r.attacker === challengerId ? `<@${challengerId}>` : `<@${opponentId}>`;
        const crit = r.isCrit ? "💥 **crit** " : "";
        return `\`R${r.round}\` ${who} hits for ${crit}**${r.damage}**`;
    });

    if (result.rounds.length > lines.length) {
        lines.push(`…and ${result.rounds.length - lines.length} more exchanges.`);
    }

    return lines.join("\n") || "Neither side landed a blow.";
}

function buildResultEmbed(
    result: DuelResult,
    challengerId: string,
    opponentId: string,
    wager: number,
    payout: bigint,
    rake: bigint,
    config: GuildConfig
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(themeColor(config))
        .setDescription(summariseRounds(result, challengerId, opponentId))
        .addFields(
            { name: `<@${challengerId}>`, value: `❤️ ${result.challengerHp} HP left`, inline: true },
            { name: `<@${opponentId}>`, value: `❤️ ${result.opponentHp} HP left`, inline: true },
        );

    if (result.draw) {
        embed.setTitle("🤝 Duel ended in a draw");
        if (wager > 0) embed.addFields({ name: "Wager", value: "Returned to both sides.", inline: false });
        return embed;
    }

    embed.setTitle("⚔️ Duel over");
    embed.addFields({
        name: "Winner",
        value: `<@${result.winnerDiscordId}>`,
        inline: false,
    });

    if (wager > 0) {
        const line = rake > 0n
            ? `**${payout}** ${goldLabel(config)} (a **${rake}** cut was taken)`
            : `**${payout}** ${goldLabel(config)}`;
        embed.addFields({ name: "Pot", value: line, inline: false });
    }

    return embed;
}

// ─── Slash command ────────────────────────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferReply();

    const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    const pvp = config.combat?.pvp ?? {};

    if (!config.combat?.enabled || !pvp.enabled) {
        await interaction.editReply({ content: "Duelling is not enabled in this server." });
        return;
    }

    const opponentUser = interaction.options.getUser("opponent", true);
    const wager = interaction.options.getInteger("wager") ?? 0;

    if (opponentUser.id === interaction.user.id) {
        await interaction.editReply({ content: "You cannot duel yourself." });
        return;
    }
    if (opponentUser.bot) {
        await interaction.editReply({ content: "You cannot duel a bot." });
        return;
    }

    const minWager = pvp.minWager ?? 0;
    const maxWager = pvp.maxWager ?? 0;
    if (wager < minWager) {
        await interaction.editReply({ content: `The minimum wager here is ${minWager}.` });
        return;
    }
    if (maxWager > 0 && wager > maxWager) {
        await interaction.editReply({ content: `The maximum wager here is ${maxWager}.` });
        return;
    }

    if (hasOpenChallenge(interaction.guildId, interaction.user.id, opponentUser.id)) {
        await interaction.editReply({ content: "One of you already has a duel challenge outstanding." });
        return;
    }

    // A cheap pre-check so an obviously unaffordable challenge is refused before
    // anyone is pinged. The balance that actually decides is read under lock in
    // resolveDuel(), because either side can spend while this sits unanswered.
    if (wager > 0) {
        const { user: challengerUser } = await getOrCreateDbUser({ discordUserId: interaction.user.id });
        const { profile } = await getOrCreateProfile({ userId: challengerUser.id, guildId: dbGuild.id });
        if (BigInt(profile.gold ?? 0) < BigInt(wager)) {
            await interaction.editReply({ content: "You do not have enough gold for that wager." });
            return;
        }
    }

    const timeoutMs = Math.max(15, pvp.challengeTimeoutSeconds ?? 120) * 1000;
    const expiresAt = Date.now() + timeoutMs;

    const message = await interaction.editReply({
        content: `<@${opponentUser.id}>`,
        embeds: [buildChallengeEmbed(interaction.user.id, opponentUser.id, wager, config, expiresAt)],
        components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId("duel:accept").setLabel("Accept").setEmoji("⚔️").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId("duel:decline").setLabel("Decline").setStyle(ButtonStyle.Secondary),
            ),
        ],
    });

    pendingDuels.set(message.id, {
        challengerDiscordId: interaction.user.id,
        opponentDiscordId: opponentUser.id,
        discordGuildId: interaction.guildId,
        channelId: interaction.channelId,
        messageId: message.id,
        wager,
        createdAt: Date.now(),
        expiresAt,
    });
}

// ─── Button handler ───────────────────────────────────────────────────────────

export async function handleDuelButton(interaction: ButtonInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) return;

    const duel = pendingDuels.get(interaction.message.id);

    if (!duel) {
        await interaction.reply({ content: "That challenge is no longer open.", flags: MessageFlags.Ephemeral });
        return;
    }

    if (interaction.user.id !== duel.opponentDiscordId) {
        await interaction.reply({ content: "Only the challenged member can respond to this.", flags: MessageFlags.Ephemeral });
        return;
    }

    if (duel.expiresAt <= Date.now()) {
        pendingDuels.delete(duel.messageId);
        await interaction.update({ content: "This challenge expired.", embeds: [], components: [] });
        return;
    }

    // Claim the challenge before awaiting anything. Two clicks arriving together
    // would otherwise both get past the checks above and resolve it twice.
    pendingDuels.delete(duel.messageId);

    if (interaction.customId === "duel:decline") {
        await interaction.update({
            content: `<@${duel.opponentDiscordId}> declined the duel.`,
            embeds: [],
            components: [],
        });
        return;
    }

    await interaction.deferUpdate();

    const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: duel.discordGuildId });
    const { user: challengerUser } = await getOrCreateDbUser({ discordUserId: duel.challengerDiscordId });
    const { user: opponentUser } = await getOrCreateDbUser({ discordUserId: duel.opponentDiscordId });

    const outcome = await resolveDuel({
        guildId: dbGuild.id,
        challenger: {
            userId: challengerUser.id,
            discordUserId: duel.challengerDiscordId,
            displayName: duel.challengerDiscordId,
        },
        opponent: {
            userId: opponentUser.id,
            discordUserId: duel.opponentDiscordId,
            displayName: duel.opponentDiscordId,
        },
        wager: BigInt(duel.wager),
        config,
    });

    if (!outcome.success) {
        await interaction.editReply({ content: outcome.message, embeds: [], components: [] });
        return;
    }

    await interaction.editReply({
        content: "",
        embeds: [
            buildResultEmbed(
                outcome.result,
                duel.challengerDiscordId,
                duel.opponentDiscordId,
                duel.wager,
                outcome.payout,
                outcome.rake,
                config
            ),
        ],
        components: [],
    });

    if (config.logging?.enabled) {
        const guild = interaction.guild;
        if (guild) {
            await logAndBroadcastEvent(guild, {
                guildId: dbGuild.id,
                discordGuildId: guild.id,
                userId: challengerUser.id,
                category: "economy",
                eventType: "duel",
                goldDelta: outcome.result.draw ? 0 : duel.wager,
                source: outcome.result.draw
                    ? `Duel with ${duel.opponentDiscordId} ended in a draw`
                    : `Duel won by ${outcome.result.winnerDiscordId}`,
                metaData: {
                    actorDiscordId: duel.challengerDiscordId,
                    opponentDiscordId: duel.opponentDiscordId,
                    wager: duel.wager,
                    rake: outcome.rake.toString(),
                },
                timestamp: new Date(),
            }, config);
        }
    }
}
