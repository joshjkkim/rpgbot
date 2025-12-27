import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from "discord.js";
import { sendConfigPanel } from "../../ui/panel/mainPanel.js";
import { mergeConfig, setGuildConfig } from "../../db/guilds.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";

export const data = new SlashCommandBuilder()
    .setName("config")
    .setDescription("General configuration for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(sub =>
        sub.setName("show").setDescription("Show the current general configuration for this server")
    )


    .addSubcommand(sub =>
        sub.setName("merge").setDescription("DEV ONLY: Merge default config into existing config")
    )

    .addSubcommand(sub=>
        sub.setName("panel").setDescription ("Configure the bot's control panel settings")
    )

    .addSubcommand(sub =>
        sub.setName("export").setDescription("Export the current configuration as JSON")
    );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guildId || !interaction.inGuild()) {
        await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
        return;
    }

    if ( !interaction.memberPermissions || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: "You need the Manage Server permission to use this command.", ephemeral: true });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const sub = interaction.options.getSubcommand();
    
    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId! });

    let newConfig = { ...config };

    switch (sub) {
        case "merge": {
            newConfig = mergeConfig(config);
            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply("Configuration merged with default settings.");
            break;
        }

        case "panel": {
            await sendConfigPanel(interaction);
            break;
        }

        case "export": {
            const configJson = JSON.stringify(config, null, 2);
            const buffer = Buffer.from(configJson, 'utf-8');
            
            await interaction.editReply({
            content: "Here's your current configuration:",
            files: [{
                attachment: buffer,
                name: `config-${interaction.guildId}.json`
            }]
            });
            break;
        }
    }
}   