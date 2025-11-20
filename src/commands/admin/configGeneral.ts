import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from "discord.js";
import { getGuildConfig, mergeConfig, setGuildConfig } from "../../db/guilds.js";

export const data = new SlashCommandBuilder()
    .setName("config")
    .setDescription("General configuration for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(sub =>
        sub.setName("show").setDescription("Show the current general configuration for this server")
    )


    .addSubcommand(sub =>
        sub.setName("merge").setDescription("DEV ONLY: Merge default config into existing config")
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
    
    const { guild, config } = await getGuildConfig(interaction.guildId);

    let newConfig = { ...config };

    switch (sub) {
        case "show": {
            await interaction.editReply(`Current general configuration:\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``);
            break;
        }

        case "merge": {
            newConfig = mergeConfig(config);
            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply("Configuration merged with default settings.");
            break;
        }
    }
}   