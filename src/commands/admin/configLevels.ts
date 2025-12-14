import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags, Embed, EmbedBuilder } from "discord.js";
import { setGuildConfig } from "../../db/guilds.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { logAndBroadcastEvent } from "../../db/events.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import type { LevelAction } from "../../types/guild.js";

export const data = new SlashCommandBuilder()
    .setName("config-levels")
    .setDescription("Configure level settings for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand((sub => 
        sub.setName("show")
            .setDescription("Show the current level configuration")
    ))

    .addSubcommand((sub =>
        sub.setName("set-max-level")
            .setDescription("Set the maximum level a user can reach")
            .addIntegerOption((option) =>
                option.setName("level")
                    .setDescription("The maximum level (leave empty for no limit)")
                    .setRequired(false)
            )
    ))

    .addSubcommand((sub =>
        sub.setName("set-announcement-channel")
            .setDescription("Set the channel where level up announcements will be sent")
            .addChannelOption((option) =>
                option.setName("channel")
                    .setDescription("The channel for level up announcements (leave empty to disable)")
                    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                    .setRequired(false)
            )
    ))

    .addSubcommand((sub =>
        sub.setName("set-announcement-message")
            .setDescription("Set the message to announce level ups")
            .addStringOption((option) =>
                option.setName("message")
                    .setDescription("The message to announce level ups (use {user}, {level} placeholders)")
                    .setRequired(true)
            )
    ))

    .addSubcommand((sub =>
        sub.setName("set-curve")
            .setDescription("Set the XP curve type")
            .addStringOption((option) =>
                option.setName("type")
                    .setDescription("The type of XP curve")
                    .setRequired(true)
                    .addChoices(
                        { name: "Linear", value: "linear" },
                        { name: "Exponential", value: "exponential" },
                        { name: "Polynomial", value: "polynomial" },
                        { name: "Logarithmic", value: "logarithmic" },
                    )
            )

            .addNumberOption((opt) =>
                opt.setName("rate")
                    .setDescription("For linear: XP per level")
                    .setRequired(false)
            )

            .addNumberOption((opt) =>
                opt.setName("base")
                    .setDescription("For exponential/logarithmic: growth base")
                    .setRequired(false)
            )

            .addNumberOption((opt) =>
                opt.setName("factor")
                    .setDescription("For polynomial/exponential/logarithmic: growth factor")
                    .setRequired(false)
            )

            .addNumberOption((opt) =>
                opt.setName("degree")
                    .setDescription("For polynomial: exponent of the polynomial")
                    .setRequired(false)
            )
    ))

    .addSubcommand((sub =>
        sub.setName("set-xp-override")
            .setDescription("Set a custom total XP required for a specific level")
            .addIntegerOption((option) =>
                option.setName("level")
                    .setDescription("The level to set the XP override for")
                    .setRequired(true)
            )
            .addIntegerOption((option) =>
                option.setName("total_xp")
                    .setDescription("The total XP required to reach this level")
                    .setRequired(true)
            )
    ))

    .addSubcommand((sub =>
        sub.setName("remove-xp-override")
            .setDescription("Remove a custom XP override for a specific level")
            .addIntegerOption((option) =>
                option.setName("level")
                    .setDescription("The level to remove the XP override from")
                    .setRequired(true)
            )
    ))

    .addSubcommand((sub =>
        sub.setName("list-level-actions")
            .setDescription("List all level actions configured for this server")
            .addIntegerOption((option) =>
                option.setName("level")
                    .setDescription("The level to list actions for")
                    .setRequired(true)
            )
    ))

    .addSubcommand((sub =>
        sub.setName("add-level-action")
            .setDescription("Add an action to to perform at a certain level (Multiple actions can be added per level)")
            .addIntegerOption((option) =>
                option.setName("level")
                    .setDescription("The level to add the action for")
                    .setRequired(true)
            )

            .addStringOption((option) =>
                option.setName("type")
                    .setDescription("The type of action to perform")
                    .setRequired(true)
                    .addChoices(
                        { name: "Assign Role", value: "assignRole" },
                        { name: "Remove Role", value: "removeRole" },
                        { name: "Send Message", value: "sendMessage" },
                        { name: "Run Command", value: "runCommand" }
                    )
            )

            .addRoleOption((option) =>
                option.setName("role")
                    .setDescription("The role to assign/remove (required for assignRole/removeRole)")
                    .setRequired(false)
            )

            .addChannelOption((option) =>
                option.setName("channel")
                    .setDescription("The channel to send the message in (required for sendMessage)")
                    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                    .setRequired(false)
            )

            .addStringOption((option) =>
                option.setName("message")
                    .setDescription("The message to send (required for sendMessage)")
                    .setRequired(false)
            )

            .addStringOption((option) =>
                option.setName("command")
                    .setDescription("The command to run (required for runCommand)")
                    .setRequired(false)
            )
    ))

    .addSubcommand((sub =>
        sub.setName("remove-level-action")
            .setDescription("Remove an action from a specific level")
            .addIntegerOption((option) =>
                option.setName("level")
                    .setDescription("The level to remove the action from")
                    .setRequired(true)
            )

            .addIntegerOption((option) =>
                option.setName("action_index")
                    .setDescription("The index of the action to remove (use 'list-level-actions' to see indices)")
                    .setRequired(true)
            )
    ))
;

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply("This command can only be used in a server.");
        return;
    }

    if(!interaction.memberPermissions || !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({content: "You do not have permission to use this command.", flags: MessageFlags.Ephemeral});
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const sub = interaction.options.getSubcommand();
    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    let newConfig = {
    ...config,
    xp: { ...config.xp, roleXp: { ...config.xp.roleXp },},
    levels: { ...config.levels, xpOverrides: { ...config.levels.xpOverrides }, levelActions: { ...config.levels.levelActions } },
};

    switch (sub) {
        case "show": {
            const levels = newConfig.levels;
            const embed = new EmbedBuilder()
                .setTitle("Level Configuration")
                .addFields(
                    { name: "Max Level", value: levels.maxLevel ? levels.maxLevel.toString() : "No limit", inline: true },
                    { name: "Announcement Channel", value: levels.announceLevelUpInChannelId ? `<#${levels.announceLevelUpInChannelId}>` : "Disabled", inline: true },
                    { name: "Curve Type", value: levels.curveType, inline: true },
                )
                .setColor(0x00AE86);

            await interaction.editReply({ embeds: [embed] });
            break;
        }

        case "set-max-level": {
            const level = interaction.options.getInteger("level");
            newConfig.levels.maxLevel = level ?? null;

            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply(`Set maximum level to ${level ?? "no limit"}.`);
            break;
        }

        case "set-announcement-channel": {
            const channel = interaction.options.getChannel("channel");
            newConfig.levels.announceLevelUpInChannelId = channel ? channel.id : null;

            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply(`Set level up announcement channel to ${channel ? `<#${channel.id}>` : "disabled"}.`);
            break;
        }

        case "set-announcement-message": {
            const message = interaction.options.getString("message", true);
            newConfig.levels.announceLevelUpMessage = message;

            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply(`Set level up announcement message to:\n${message}`);
            break;
        }

        case "set-curve": {
            const type = interaction.options.getString("type", true);
            newConfig.levels.curveType = type as any;

            // Set curve parameters based on type
            const params: Record<string, number> = {};
            switch (type) {
                case "linear":
                    {
                        const rate = interaction.options.getNumber("rate");
                        if (rate) params["rate"] = rate;
                    }
                    break;
                case "exponential":
                    {
                        const base = interaction.options.getNumber("base");
                        const factor = interaction.options.getNumber("factor");
                        if (base) params["base"] = base;
                        if (factor) params["factor"] = factor;
                    }
                    break;
                case "polynomial":
                    {
                        const factor = interaction.options.getNumber("factor");
                        const degree = interaction.options.getNumber("degree");
                        if (factor) params["factor"] = factor;
                        if (degree) params["degree"] = degree;
                    }
                    break;
                case "logarithmic":
                    {
                        const base = interaction.options.getNumber("base");
                        const factor = interaction.options.getNumber("factor");
                        if (base) params["base"] = base;
                        if (factor) params["factor"] = factor;
                    }
                    break;
            }

            newConfig.levels.curveParams = params;

            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply(`Set XP curve to ${type} with parameters: ${JSON.stringify(params)}.`);
            break;
        }

        case "set-xp-override": {
            const level = interaction.options.getInteger("level", true);
            const totalXp = interaction.options.getInteger("total_xp", true);

            newConfig.levels.xpOverrides[level] = totalXp;

            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply(`Set XP override for level ${level} to ${totalXp} total XP.`);
            break;
        }

        case "remove-xp-override": {
            const level = interaction.options.getInteger("level", true);

            delete newConfig.levels.xpOverrides[level];

            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply(`Removed XP override for level ${level}.`);
            break;
        }

        case "add-level-action": {
            const level = interaction.options.getInteger("level", true);
            const type = interaction.options.getString("type", true) as LevelAction["type"];

            const action: any = { type };

            switch (type) {
                case "assignRole": {
                    const role = interaction.options.getRole("role", true);
                    action.roleId = role.id;
                    break;
                }
                case "removeRole": {
                        const role = interaction.options.getRole("role", true);
                        action.roleId = role.id;
                        break;
                    }
                case "sendMessage": {
                        const channel = interaction.options.getChannel("channel", true);
                        const message = interaction.options.getString("message", true);
                        action.channelId = channel.id;
                        action.message = message;
                        break;
                    }
                case "runCommand": {
                        const command = interaction.options.getString("command", true);
                        action.command = command;
                        break;
                    }
            }

            if (!newConfig.levels.levelActions[level]) {
                newConfig.levels.levelActions[level] = [];
            }
            newConfig.levels.levelActions[level].push(action);

            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply(`Added action to level ${level}.`);
            break;
        }

        case "remove-level-action": {
            const level = interaction.options.getInteger("level", true);
            const actionIndex = interaction.options.getInteger("action_index", true);

            const actions = newConfig.levels.levelActions[level] ?? [];

            if (actions.length === 0) {
                await interaction.editReply(`No actions found for level ${level}.`);
                return;
            }

            if (actionIndex < 1 || actionIndex > actions.length) {
                await interaction.editReply(`Invalid action index for level ${level}.`);
                return;
            }

            const [removed] = actions.splice(actionIndex - 1, 1);

            if (actions.length === 0) {
                delete newConfig.levels.levelActions[level];
            } else {
                newConfig.levels.levelActions[level] = actions;
            }

            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply(`Removed action at index ${actionIndex} from level ${level}.`);
            break;
        }

        case "list-level-actions": {
            const level = interaction.options.getInteger("level", true);
            const actions = newConfig.levels.levelActions[level] ?? [];

            if (actions.length === 0) {
                await interaction.editReply(`No actions found for level ${level}.`);
                return;
            }

            const actionList = actions.map((action, index) => `${index + 1}. ${action.type}`).join("\n");
            await interaction.editReply(`Actions for level ${level}:\n${actionList}`);
            break;
        }

        default:
            await interaction.editReply("Unknown subcommand.");
            break;
    }

    if (sub !== "show" && sub !== "list-level-actions" && config.logging.enabled) {
        const { user } = await getOrCreateDbUser({
            discordUserId: interaction.user.id,
            username: interaction.user.username,
            avatarUrl: interaction.user.displayAvatarURL(),
        });

        await logAndBroadcastEvent(interaction, {
            guildId: guild.id,
            userId: user.id,
            category: "config",
            eventType: "configChange",
            source: "levels",
            metaData: { actorDiscordId: interaction.user.id, subcommand: sub },
            timestamp: new Date(),
        }, newConfig);
    }
}