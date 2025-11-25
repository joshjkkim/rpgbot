import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags, Embed, EmbedBuilder, subtext } from "discord.js";
import { setGuildConfig } from "../../db/guilds.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";

export const data = new SlashCommandBuilder()
    .setName("config-xp")
    .setDescription("Configure XP settings for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand((sub) => sub.setName("show").setDescription("Show current XP configuration")) // Show current config

    .addSubcommand((sub) => // set base XP per message
        sub.setName("base-xp").setDescription("Set base XP per message")
        .addIntegerOption((opt) =>
            opt.setName("amount")
            .setDescription("Base XP amount (0-100)")
            .setRequired(true)
    ))

    .addSubcommand((sub) => // set base xp message cooldown
        sub.setName("base-xp-cooldown").setDescription("Set base XP message cooldown in seconds")
        .addIntegerOption((opt) =>
            opt.setName("seconds")
            .setDescription("Cooldown in seconds(0 to disable)")
            .setRequired(true)
    ))

    .addSubcommand((sub) => // set base daily Xp
        sub.setName("base-daily-xp").setDescription("Set base daily XP reward amount")
        .addIntegerOption((opt) =>
            opt.setName("amount")
            .setDescription("Daily XP amount")
            .setRequired(true)
    ))

    .addSubcommand((sub) => // set base gold Xp
        sub.setName("base-gold-xp").setDescription("Set base daily gold reward amount")
        .addIntegerOption((opt) =>
            opt.setName("amount")
            .setDescription("Daily gold amount)")
            .setRequired(true)
    ))

    .addSubcommand((sub) => // set base streak multiplier
        sub.setName("streak-multiplier").setDescription("Set daily streak multiplier")
        .addNumberOption((opt) =>
            opt.setName("multiplier")
            .setDescription("Streak multiplier (e.g., 0.1 for 10%)")
            .setRequired(true)
    ))

    .addSubcommand((sub) => // set auto daily enabled
        sub.setName("auto-daily").setDescription("Enable or disable automatic daily rewards")
        .addBooleanOption((opt) =>
            opt.setName("enabled")
            .setDescription("Enable or disable auto daily rewards (instead of actively using /daily trigger on first message)")
            .setRequired(true)
    ))

    .addSubcommand((sub) => // set announce daily in channel
        sub.setName("announce-daily-channel").setDescription("Set channel to announce daily rewards in")
        .addChannelOption((opt) =>
            opt.setName("channel")
            .setDescription("Channel to announce daily rewards in (leave empty to disable)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
    ))

    .addSubcommand((sub) => 
        sub.setName("announce-daily-message").setDescription("Set message to announce daily rewards")
        .addStringOption((opt) =>
            opt.setName("message")
            .setDescription("Message to announce daily rewards")
            .setRequired(true)
    ))

    .addSubcommand((sub) =>
        sub.setName("reply-to-daily-in-channel").setDescription("Enable or disable replying to daily command in channel")
        .addBooleanOption((opt) =>
            opt.setName("enabled")
            .setDescription("Enable or disable replying to daily command in channel")
            .setRequired(true)
        )
    )

    .addSubcommand((sub) =>
        sub.setName("reply-to-daily-ephemeral").setDescription("Enable or disable replying to daily command ephemerally")
        .addBooleanOption((opt) =>
            opt.setName("enabled")
            .setDescription("Enable or disable replying to daily command ephemerally")
            .setRequired(true)
        )
    )

    .addSubcommand((sub) =>
        sub.setName("reply-to-daily-message").setDescription("Set message to reply to daily command in channel")
        .addStringOption((opt) =>
            opt.setName("message")
            .setDescription("Message to reply to daily command in channel")
            .setRequired(true)
        )
    )

    .addSubcommand((sub) =>
        sub.setName("role-xp").setDescription("Configure XP settings for a specific role")
        .addRoleOption((opt) =>
            opt.setName("role")
            .setDescription("Role to configure XP settings for")
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
            opt.setName("extra-xp")
            .setDescription("Extra XP amount for this role (0-100)")
            .setRequired(false)
        )
        .addNumberOption((opt) =>
            opt.setName("multiplier")
            .setDescription("XP multiplier for this role (e.g., 1.5 for 150%)")
            .setRequired(false)
        )
        .addIntegerOption((opt) =>
            opt.setName("cooldown-seconds")
            .setDescription("Cooldown in seconds for this role (0 to disable)")
            .setRequired(false)
        )
    )

    .addSubcommand((sub) => 
        sub.setName("role-daily").setDescription("Configure daily bonus for a specific role")
        .addRoleOption((opt) =>
            opt.setName("role")
            .setDescription("Role to configure daily bonus for")
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
            opt.setName("daily-xp-bonus")
            .setDescription("Extra daily XP bonus for this role")
            .setRequired(false)
        )
        .addIntegerOption((opt) =>
            opt.setName("daily-gold-bonus")
            .setDescription("Extra daily gold bonus for this role")
            .setRequired(false)
        )
        .addNumberOption((opt) =>
            opt.setName("daily-streak-multiplier")
            .setDescription("Extra daily streak multiplier bonus for this role (e.g., 1 for 100%)")
            .setRequired(false)
        )
    )

    .addSubcommand(sub =>
        sub.setName("list-channel-xp-config").setDescription("List all channel-specific XP configurations")
            .addStringOption(opt =>
                opt.setName("type")
                .setDescription("Type of channels to list (text/voice/all)")
                .setRequired(false)
                .addChoices(
                    { name: "Text Channels", value: "text" },
                    { name: "Voice Channels", value: "voice" },
                    { name: "All Channels", value: "all" },
                )
            )
    )

    .addSubcommand((sub) => // set announce daily message
        sub.setName("add-channel-xp-config").setDescription("Add or update XP configuration for a specific channel")
        .addChannelOption((opt) =>
            opt.setName("channel")
            .setDescription("Channel to configure XP settings for")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildStageVoice)
            .setRequired(true)
        )
        .addBooleanOption((opt) =>
            opt.setName("enabled")
            .setDescription("Enable or disable XP for this channel")
            .setRequired(true)
        )
        .addNumberOption((opt) =>
            opt.setName("multiplier")
            .setDescription("XP multiplier for this channel (e.g., 1.5 for 150%)")
            .setRequired(false)
        )
        .addIntegerOption((opt) =>
            opt.setName("flat-bonus")
            .setDescription("Flat XP bonus for this channel")
            .setRequired(false)
        )
        .addIntegerOption((opt) =>
            opt.setName("cooldown-override")
            .setDescription("Cooldown override in seconds for this channel leave blank for no override")
            .setRequired(false)
        )
    )

    .addSubcommand(sub =>
        sub.setName("remove-channel-xp-config").setDescription("Remove XP configuration for a specific channel")
        .addChannelOption((opt) =>
            opt.setName("channel")
            .setDescription("Channel to remove XP configuration for")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildStageVoice)
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
        sub.setName("vc-xp").setDescription("Configure voice channel XP settings")
        .addBooleanOption(opt =>
            opt.setName("enabled")
            .setDescription("Enable or disable voice channel XP")
            .setRequired(false)
        )
        .addIntegerOption(opt =>
            opt.setName("base-per-minute")
            .setDescription("Base XP per minute spent in voice channels")
            .setRequired(false)
        )
        .addIntegerOption(opt =>
            opt.setName("min-minutes-for-xp")
            .setDescription("Minimum minutes required in a voice channel to earn XP")
            .setRequired(false)
        )
    )

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
    const { config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId! });
    let newConfig = { ...config, xp: { ...config.xp, roleXp: { ...config.xp.roleXp }, xpChannelIds: { ...config.xp.xpChannelIds } } };

    switch(sub) {
        case "show": {
            const embed = new EmbedBuilder()
            .setTitle("XP Configuration")
            .setColor(0x00AE86)
            .addFields(
                { name: "Base XP per Message", value: newConfig.xp.basePerMessage.toString(), inline: true },
                { name: "Base XP Cooldown (seconds)", value: newConfig.xp.xpMessageCooldown.toString(), inline: true },
                { name: "Base Daily XP", value: newConfig.xp.dailyXp.toString(), inline: true },
                { name: "Base Daily Gold", value: newConfig.xp.dailyGold.toString(), inline: true },
                { name: "Streak Multiplier", value: newConfig.xp.streakMultiplier.toString(), inline: true },
                { name: "Auto Daily Enabled", value: newConfig.xp.autoDailyEnabled ? "Yes" : "No", inline: true },
                { name: "Announce Daily Channel ID", value: newConfig.xp.announceDailyInChannelId ?? "None", inline: true },
            );
            await interaction.editReply({ embeds: [embed] });
            break;
        }

        case "base-xp": {
            const amount = interaction.options.getInteger("amount", true);
            newConfig.xp.basePerMessage = amount;

            await interaction.editReply(`Base XP per message set to ${amount}.`);
            await setGuildConfig(interaction.guildId, newConfig);
            break;
        }
        
        case "base-xp-cooldown": {
            const seconds = interaction.options.getInteger("seconds", true);
            newConfig.xp.xpMessageCooldown = seconds;

            await interaction.editReply(`Base XP message cooldown set to ${seconds} seconds.`);
            await setGuildConfig(interaction.guildId, newConfig);
            break;
        }

        case "base-daily-xp": {
            const amount = interaction.options.getInteger("amount", true);
            newConfig.xp.dailyXp = amount;
            
            await interaction.editReply(`Base daily XP set to ${amount}.`);
            await setGuildConfig(interaction.guildId, newConfig);
            break;
        }

        case "base-gold-xp": {
            const amount = interaction.options.getInteger("amount", true);
            newConfig.xp.dailyGold = amount;
            
            await interaction.editReply(`Base daily gold set to ${amount}.`);
            await setGuildConfig(interaction.guildId, newConfig);
            break;
        }

        case "streak-multiplier": {
            const multiplier = interaction.options.getNumber("multiplier", true);
            newConfig.xp.streakMultiplier = multiplier;
            
            await interaction.editReply(`Streak multiplier set to ${multiplier}.`);
            await setGuildConfig(interaction.guildId, newConfig);
            break;
        }

        case "auto-daily": {
            const enabled = interaction.options.getBoolean("enabled", true);
            newConfig.xp.autoDailyEnabled = enabled;
            
            await interaction.editReply(`Auto daily rewards ${enabled ? "enabled" : "disabled"}.`);
            await setGuildConfig(interaction.guildId, newConfig);
            break;
        }
        
        case "announce-daily-channel": {
            const channel = interaction.options.getChannel("channel", false);
            newConfig.xp.announceDailyInChannelId = channel ? channel.id : null;
            
            await interaction.editReply(`Announce daily channel set to ${channel ? `<#${channel.id}>` : "none"}.`);
            await setGuildConfig(interaction.guildId, newConfig);
            break;
        }

        case "announce-daily-message": {
            const message = interaction.options.getString("message", true);
            newConfig.xp.announceDailyMessage = message;
            
            await interaction.editReply(`Announce daily message set to:\n${message}`);
            await setGuildConfig(interaction.guildId, newConfig);
            break;
        }

        case "reply-to-daily-in-channel": {
            const enabled = interaction.options.getBoolean("enabled", true);
            newConfig.xp.replyToDailyInChannel = enabled;
            
            await interaction.editReply(`Reply to daily in channel ${enabled ? "enabled" : "disabled"}.`);
            await setGuildConfig(interaction.guildId, newConfig);
            break;
        }

        case "reply-to-daily-ephemeral": {
            const enabled = interaction.options.getBoolean("enabled", true);
            newConfig.xp.replyToDailyEphemeral = enabled;
            
            await interaction.editReply(`Reply to daily ephemeral ${enabled ? "enabled" : "disabled"}.`);
            await setGuildConfig(interaction.guildId, newConfig);
            break;
        }

        case "reply-to-daily-message": {
            const message = interaction.options.getString("message", true);
            newConfig.xp.replyToDailyMessage = message;
            
            await interaction.editReply(`Reply to daily message set to:\n${message}`);
            await setGuildConfig(interaction.guildId, newConfig);
            break;
        }
        
        case "role-xp": {
            const role = interaction.options.getRole("role", true);
            const extraXp = interaction.options.getInteger("extra-xp", false);
            const multiplier = interaction.options.getNumber("multiplier", false);
            const cooldownSeconds = interaction.options.getInteger("cooldown-seconds", false);
            const roleConfig = newConfig.xp.roleXp[role.id] || {};

            if (extraXp !== null) {
                roleConfig.extraXp = extraXp;
            }
            if (multiplier !== null) {
                roleConfig.multiplier = multiplier;
            }
            if (cooldownSeconds !== null) {
                roleConfig.cooldownSeconds = cooldownSeconds;
            }
            
            newConfig.xp.roleXp[role.id] = roleConfig;
            await interaction.editReply(`Role XP configuration updated for ${role.name}.`);
            await setGuildConfig(interaction.guildId, newConfig);
            break;
        }

        case "role-daily": {
            const role = interaction.options.getRole("role", true);
            const dailyXpBonus = interaction.options.getInteger("daily-xp-bonus", false);
            const dailyGoldBonus = interaction.options.getInteger("daily-gold-bonus", false);
            const dailyStreakMultiplier = interaction.options.getNumber("daily-streak-multiplier", false);
            const roleConfig = newConfig.xp.roleDailyBonus[role.id] || {};
            
            if (dailyXpBonus !== null) {
                roleConfig.xpBonus = dailyXpBonus;
            }
            if (dailyGoldBonus !== null) {
                roleConfig.goldBonus = dailyGoldBonus;
            }
            if (dailyStreakMultiplier !== null) {
                roleConfig.multiplier = dailyStreakMultiplier;
            }

            newConfig.xp.roleXp[role.id] = roleConfig;
            await interaction.editReply(`Role daily bonus configuration updated for ${role.name}.`);
            await setGuildConfig(interaction.guildId, newConfig);
            break;
        }

        case "list-channel-xp-config": {
            const type = interaction.options.getString("type", false) || "all";

            let channelConfigs;

            if(type === "text") {
                channelConfigs = newConfig.xp.xpChannelIds;
            } else if (type === "voice") {
                channelConfigs = newConfig.xp.vc.channelIds;
            } else {
                channelConfigs = { ...newConfig.xp.xpChannelIds, ...newConfig.xp.vc.channelIds };
            }

            if(Object.keys(channelConfigs).length === 0) {
                await interaction.editReply("No channel-specific XP configurations found.");
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle("Channel-specific XP Configurations")
                .setColor(0x00AE86)
                .addFields(
                    Object.entries(channelConfigs).map(([channelId, cfg]) => ({
                        name: `<#${channelId}>`,
                        value: `Enabled: ${cfg.enabled}\nMultiplier: ${cfg.multiplier}\nFlat Bonus: ${cfg.flatBonus}\nCooldown Override: ${cfg.cooldownOverride ?? "None"}`,
                        inline: false,
                    }))
                );

            await interaction.editReply({ embeds: [embed] });
            break;
        }

        case "add-channel-xp-config": {
            const channel = interaction.options.getChannel("channel", true);
            const enabled = interaction.options.getBoolean("enabled", true);
            const multiplier = interaction.options.getNumber("multiplier", false) ?? 1;
            const flatBonus = interaction.options.getInteger("flat-bonus", false) ?? 0;
            const cooldownOverride = interaction.options.getInteger("cooldown-override", false);

            const channelType = channel.type;
            if(channelType == ChannelType.GuildText || channelType == ChannelType.GuildAnnouncement) {

                newConfig.xp.xpChannelIds[channel.id] = {
                        channelId: channel.id,
                        enabled,
                        multiplier,
                        flatBonus,
                        ...(cooldownOverride !== null && { cooldownOverride }),
                    };
            } else if (channelType == ChannelType.GuildVoice || channelType == ChannelType.GuildStageVoice) {
                newConfig.xp.vc.channelIds[channel.id] = {
                    channelId: channel.id,
                    enabled,
                    multiplier,
                    flatBonus,
                };
            }

            await interaction.editReply(`XP configuration for <#${channel.id}> has been added/updated.`);
            await setGuildConfig(interaction.guildId, newConfig);
            break;
        }

        case "remove-channel-xp-config": {
            const channel = interaction.options.getChannel("channel", true);
            const channelType = channel.type;

            if(channelType == ChannelType.GuildText || channelType == ChannelType.GuildAnnouncement) {
                if(newConfig.xp.xpChannelIds[channel.id]) {
                    delete newConfig.xp.xpChannelIds[channel.id];
                    await interaction.editReply(`XP configuration for <#${channel.id}> has been removed.`);
                    await setGuildConfig(interaction.guildId, newConfig);
                } else {
                    await interaction.editReply(`No XP configuration found for <#${channel.id}>.`);
                }
            } else {
                if(newConfig.xp.vc.channelIds[channel.id]) {
                    delete newConfig.xp.vc.channelIds[channel.id];
                    await interaction.editReply(`XP configuration for <#${channel.id}> has been removed.`);
                    await setGuildConfig(interaction.guildId, newConfig);
                } else {
                    await interaction.editReply(`No XP configuration found for <#${channel.id}>.`);
                }
            }
            break;
        }

        case "vc-xp": {
            const enabled = interaction.options.getBoolean("enabled", false) ?? newConfig.xp.vc.enabled;
            const basePerMinute = interaction.options.getInteger("base-per-minute", false) ?? newConfig.xp.vc.basePerMinute;
            const minMinutesForXp = interaction.options.getInteger("min-minutes-for-xp", false) ?? newConfig.xp.vc.minMinutesForXp;

            newConfig.xp.vc.enabled = enabled;
            newConfig.xp.vc.basePerMinute = basePerMinute;
            newConfig.xp.vc.minMinutesForXp = minMinutesForXp;

            await interaction.editReply(`Voice channel XP configuration updated. Enabled: ${enabled}, Base Per Minute: ${basePerMinute}, Min Minutes For XP: ${minMinutesForXp}.`);
            await setGuildConfig(interaction.guildId, newConfig);
            break;
        }

        default:
            await interaction.editReply("Unknown subcommand.");
            break;
    }
}
