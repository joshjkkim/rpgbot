import type { ChatInputCommandInteraction } from "discord.js";
import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { dismissBoss, liveBoss, spawnBoss } from "../../player/bosses.js";
import type { EnemyConfig } from "../../types/combat.js";
import type { GuildConfig } from "../../types/guild.js";

// Summoning is `/fight` with a boss picked; this only sends one away.
export const data = new SlashCommandBuilder()
    .setName("boss")
    .setDescription("World bosses the whole server fights together")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
        sub.setName("dismiss")
            .setDescription("End the current world boss now, with no rewards"));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) {
        await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
        return;
    }
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: "You need the Manage Server permission to send a boss away.", flags: MessageFlags.Ephemeral });
        return;
    }
    const gone = await dismissBoss(interaction.guildId);
    await interaction.reply({
        content: gone ? `**${gone.enemy.emoji} ${gone.enemy.name}** is gone. Nobody was rewarded.` : "There's no world boss loose right now.",
        flags: MessageFlags.Ephemeral,
    });
}

/** A manager's `/fight` with a world boss picked: calls it into this channel for the whole server. */
export async function summonBoss(interaction: ChatInputCommandInteraction, config: GuildConfig, enemy: EnemyConfig): Promise<void> {
    const fail = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
    if (!interaction.inCachedGuild()) return void await fail("This command can only be used in a server.");
    if (!config.combat.enabled) return void await fail("⚔️ Combat isn't enabled on this server.");
    if (liveBoss(interaction.guildId)) return void await fail("A boss is already loose! Defeat it first, or end it with `/boss dismiss`.");
    // Replying to a command needs no channel permissions; posting the boss does.
    const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];
    if (!interaction.channel?.isSendable() || !interaction.appPermissions.has(needed)) {
        return void await fail("I can't post here. Give the havocish role **View Channel**, **Send Messages** and **Embed Links** in this channel, then try again.");
    }
    await interaction.reply({ content: `Summoning **${enemy.emoji} ${enemy.name}**…`, flags: MessageFlags.Ephemeral });
    await spawnBoss(interaction.channel, interaction.guildId, config, enemy);
}
