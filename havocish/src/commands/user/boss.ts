import type { ChatInputCommandInteraction } from "discord.js";
import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { bossesIn, liveBoss, spawnBoss } from "../../player/bosses.js";

export const data = new SlashCommandBuilder()
    .setName("boss")
    .setDescription("World bosses the whole server fights together")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
        sub.setName("summon")
            .setDescription("Summon a world boss in this channel")
            .addStringOption(opt =>
                opt.setName("boss")
                    .setDescription("Boss ID (leave blank for a random boss)")
                    .setRequired(false)));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) {
        await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
        return;
    }
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: "You need the Manage Server permission to summon a boss.", flags: MessageFlags.Ephemeral });
        return;
    }

    const { config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    const fail = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

    if (!config.combat.enabled) return void await fail("⚔️ Combat isn't enabled on this server.");
    if (liveBoss(interaction.guildId)) return void await fail("A boss is already loose! Defeat it first.");

    const bosses = bossesIn(config);
    const id = interaction.options.getString("boss");
    const enemy = id ? config.combat.enemies?.[id] : bosses[Math.floor(Math.random() * bosses.length)];
    if (!enemy) {
        return void await fail(id
            ? `No enemy with ID \`${id}\`.`
            : "There are no world bosses yet. Mark an enemy as a world boss on the dashboard (Combat → Enemies).");
    }
    if (!enemy.boss) return void await fail(`**${enemy.emoji} ${enemy.name}** isn't a world boss. Mark it as one on the dashboard first.`);
    // Replying to a command needs no channel permissions; posting the boss does.
    const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];
    if (!interaction.channel?.isSendable() || !interaction.appPermissions.has(needed)) {
        return void await fail("I can't post here. Give the havocish role **View Channel**, **Send Messages** and **Embed Links** in this channel, then try again.");
    }

    await interaction.reply({ content: `Summoning **${enemy.emoji} ${enemy.name}**…`, flags: MessageFlags.Ephemeral });
    await spawnBoss(interaction.channel, interaction.guildId, config, enemy);
}
