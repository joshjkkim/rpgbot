import { ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import { setGuildConfig } from "../../db/guilds.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { logAndBroadcastEvent } from "../../db/events.js";

export const data = new SlashCommandBuilder()
    .setName("config-trading")
    .setDescription("Configure trading settings for the server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(subcommand =>
        subcommand.setName("gifting")
        .setDescription("Configure gifting settings for the server")
        .addBooleanOption(option =>
            option.setName("enabled")
            .setDescription("Enable or disable gifting")
            .setRequired(true))
        .addStringOption(option =>
            option.setName("message")
            .setDescription("Custom message for gifting | type none for no message announcement and dm")
            .setRequired(false))
        
        .addChannelOption(option =>
            option.setName("announce-channel")
            .setDescription("Channel to announce gifts in")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false))
        .addBooleanOption(option =>
            option.setName("dm")
            .setDescription("Send a DM to the receiver")
            .setRequired(false))
        
        .addIntegerOption(option =>
            option.setName("level-requirement")
            .setDescription("Minimum level required to gift and receive gifts")
            .setMinValue(0)
            .setRequired(false))
  );

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId || !interaction.inGuild()) {
        await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
        return;
    }

    if ( !interaction.memberPermissions || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: "You need the Manage Server permission to use this command.", ephemeral: true });
        return;
    }

    const sub = interaction.options.getSubcommand();

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });

    let newConfig = structuredClone(config);

    switch (sub) {
        case "gifting":
            const enabled = interaction.options.getBoolean("enabled", true);
            let message = interaction.options.getString("message");
            const announceChannel = interaction.options.getChannel("announce-channel");
            const dm = interaction.options.getBoolean("dm", false) || false;
            const levelRequirement = interaction.options.getInteger("level-requirement");

            if(message == "none") {
                message = null;
            }

            newConfig.shop.gifting = {
                enabled,
                message,
                announceChannel: announceChannel ? announceChannel.id : null,
                dm,
                levelReq: levelRequirement || 0
            };
            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply({ content: "Gifting configuration updated successfully." });
    }

    if (config.logging.enabled) {
        const { user } = await getOrCreateDbUser({
            discordUserId: interaction.user.id,
            username: interaction.user.username,
            avatarUrl: interaction.user.displayAvatarURL(),
        });

        await logAndBroadcastEvent(interaction, {
            guildId: guild.id,
            discordGuildId: guild.discord_guild_id,
            userId: user.id,
            category: "config",
            eventType: "configChange",
            source: "trading",
            metaData: { actorDiscordId: interaction.user.id, subcommand: sub },
            timestamp: new Date(),
        }, newConfig);
    }
}