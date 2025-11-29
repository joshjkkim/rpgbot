import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { setGuildConfig } from "../../db/guilds.js";
import { logAndBroadcastEvent, type EventCategory } from "../../db/events.js";
import { getOrCreateDbUser } from "../../cache/userService.js";

export const data = new SlashCommandBuilder()
    .setName("config-logging")
    .setDescription("Configure event logging for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(sub =>
        sub.setName("toggle").setDescription("Enable or disable event logging")
            .addBooleanOption(option =>
                option.setName("enabled")
                    .setDescription("Whether to enable or disable logging")
                    .setRequired(true)
            )
    )
    
    .addSubcommand(sub =>
        sub.setName("set-main-channel").setDescription("Set the main channel for event logs")
            .addChannelOption(option =>
                option.setName("channel_id")
                    .setDescription("The channel ID where logs will be sent")
                    .setRequired(true)
            )
    )

    .addSubcommand(sub =>
        sub.setName("add-category").setDescription("Add a category to look to log events")
            .addStringOption(option =>
                option.setName("category")
                    .setDescription("The event category to log")
                    .setRequired(true)
                    .addChoices(
                        { name: "Economy", value: "economy" },
                        { name: "XP", value: "xp" },
                        { name: "Daily", value: "daily" },
                        { name: "Streak", value: "streak" },
                        { name: "Level", value: "level" },
                        { name: "Config", value: "config" },
                        { name: "Inventory", value: "inventory" },
                        { name: "Admin", value: "admin" },
                    )
            )

            .addChannelOption(option =>
                option.setName("channel_id")
                    .setDescription("Specific Channel ID for this Category (Leave Blank to use main channel)")
                    .setRequired(false)
            )
    )

    .addSubcommand(sub =>
        sub.setName("remove-category").setDescription("Remove a category to stop logging events")
            .addStringOption(option =>
                option.setName("category")
                    .setDescription("The event category to log")
                    .setRequired(true)
                    .addChoices(
                        { name: "Economy", value: "economy" },
                        { name: "XP", value: "xp" },
                        { name: "Daily", value: "daily" },
                        { name: "Streak", value: "streak" },
                        { name: "Level", value: "level" },
                        { name: "Config", value: "config" },
                        { name: "Inventory", value: "inventory" },
                        { name: "Admin", value: "admin" },
                    )
            )
    )

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply("This command can only be used in a server.");
        return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply("You need the Manage Server permission to use this command.");
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { guild: dbGuild, config } = await getOrCreateGuildConfig({
        discordGuildId: interaction.guildId!,
    });

    const sub = interaction.options.getSubcommand();

    switch (sub) {
        case "toggle": {
            const enabled = interaction.options.getBoolean("enabled", true);

            config.logging.enabled = enabled;
            await setGuildConfig(interaction.guildId, config);

            await interaction.editReply(`Event logging has been ${enabled ? "enabled" : "disabled"}.`);
            break;
        }

        case "set-main-channel": {
            const channelId = interaction.options.getChannel("channel_id", true)?.id;

            config.logging.mainChannelId = channelId;
            await setGuildConfig(interaction.guildId, config);

            await interaction.editReply(`Main event logging channel set to <#${channelId}>.`);
            break;
        }

        case "add-category": {
            const category = interaction.options.getString("category", true) as keyof typeof config.logging.allowedCategories;
            const channelId = interaction.options.getChannel("channel_id")?.id || null;

            (config.logging.allowedCategories as Record<string, string | null>)[category] = channelId;
            await setGuildConfig(interaction.guildId, config);

            await interaction.editReply(`Logging for category **${category}** has been added${channelId ? ` with channel <#${channelId}>` : ""}.`);
            break;
        }

        case "remove-category": {
            const category = interaction.options.getString("category", true) as EventCategory;

            if (config.logging.allowedCategories) {
                config.logging.allowedCategories[category] = false;
                await setGuildConfig(interaction.guildId, config);

                await interaction.editReply(`Logging for category **${category}** has been removed.`);
            } else {
                await interaction.editReply(`Logging for category **${category}** is not currently configured.`);
            }
            break;
        }
    }

    if (config.logging.enabled) {
        const { user } = await getOrCreateDbUser({
            discordUserId: interaction.user.id,
            username: interaction.user.username,
            avatarUrl: interaction.user.displayAvatarURL(),
        });

        await logAndBroadcastEvent(interaction, {
            guildId: dbGuild.id,
            userId: user.id,
            category: "config",
            eventType: "configChange",
            source: "logging",
            metaData: { actorDiscordId: interaction.user.id, subcommand: sub },
            timestamp: new Date(),
        }, config);
    }
}
    