import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from "discord.js";
import { setGuildConfig } from "../../db/guilds.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";   
import { getOrCreateDbUser } from "../../cache/userService.js";
import { logAndBroadcastEvent } from "../../db/events.js";

export const data = new SlashCommandBuilder()
    .setName("config-streak")
    .setDescription("Configure Streak settings for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(sub =>
        sub.setName("set-announcement-channel").setDescription("Set the channel to announce streak milestones")
            .addChannelOption(opt =>
                opt.setName("channel").setDescription("The channel to announce streak milestones (Leave blank to disable)").setRequired(false)
                    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum)
            )
    )

    .addSubcommand(sub =>
        sub.setName("set-announcement-message").setDescription("Set the message to announce streak milestones")
            .addStringOption(opt =>
                opt.setName("message").setDescription("The announcement message. Use {user}, {streak}, {xp}, and {gold} as placeholders.").setRequired(true)
            )
    )

    .addSubcommand(sub =>
        sub.setName("list-streak-rewards").setDescription("List all configured streak rewards")
    )

    .addSubcommand(sub =>
        sub.setName("add-streak-reward").setDescription("Add a streak reward")
            .addIntegerOption(opt =>
                opt.setName("streak-count").setDescription("The streak count to reward (e.g. 7 for a 7-day streak)").setRequired(true)
            )
            .addIntegerOption(opt =>
                opt.setName("xp-reward").setDescription("The amount of XP to reward").setRequired(true)
            )
            .addIntegerOption(opt =>
                opt.setName("gold-reward").setDescription("The amount of Gold to reward").setRequired(true)
            )
            .addChannelOption(opt =>
                opt.setName("announcement-channel").setDescription("The channel to announce this reward (Leave blank to use default)").setRequired(false)
                    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum)
            )
            .addStringOption(opt =>
                opt.setName("custom-message").setDescription("A custom message for this reward. Use {user}, {streak}, {xp}, and {gold} as placeholders.").setRequired(false)
            )
    )

    .addSubcommand(sub =>
        sub.setName("remove-streak-reward").setDescription("Remove a streak reward")
            .addIntegerOption(opt =>
                opt.setName("streak-count").setDescription("The streak count of the reward to remove").setRequired(true)
            )
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
        case "set-announcement-channel": {
            const channel = interaction.options.getChannel("channel", false);
            
            if (channel) {
                newConfig.xp.streakAnnounceChannelId = channel.id;
                await interaction.editReply(`Streak announcement channel set to <#${channel.id}>.`);
            } else {
                newConfig.xp.streakAnnounceChannelId = null;
                await interaction.editReply("Streak announcement channel disabled.");
            }

            await setGuildConfig(interaction.guildId, newConfig);
            break;
        }

        case "set-announcement-message": {
            const message = interaction.options.getString("message", true);
            
            newConfig.xp.streakAnnounceMessage = message;
            await setGuildConfig(interaction.guildId, newConfig);

            await interaction.editReply(`Streak announcement message set to:\n${message}`);
            break;
        }

        case "list-streak-rewards": {
            const rewards = newConfig.xp.streakRewards || [];
            if (Object.keys(rewards).length === 0) {
                await interaction.editReply("No streak rewards configured.");
                return;
            }

            let reply = "Configured Streak Rewards:\n";
            for (const key of Object.keys(rewards)) {
                const reward = rewards[Number(key)];
                if (reward) {
                    reply += `• Streak: ${reward.streakCount} days - XP: ${reward.xpBonus}, Gold: ${reward.goldBonus}\n`;
                }
            }

            await interaction.editReply(reply);
            break;
        }

        case "add-streak-reward": {
            const streakCount = interaction.options.getInteger("streak-count", true);
            const xpReward = interaction.options.getInteger("xp-reward", true);
            const goldReward = interaction.options.getInteger("gold-reward", true);
            const announcementChannel = interaction.options.getChannel("announcement-channel", false);
            const customMessage = interaction.options.getString("custom-message", false);

            const newReward = {
                streakCount,
                xpBonus: xpReward,
                goldBonus: goldReward,
                channelId: announcementChannel ? announcementChannel.id : null,
                message: customMessage || null,
            };

            if (!newConfig.xp.streakRewards) {
                newConfig.xp.streakRewards = [];
            }

            newConfig.xp.streakRewards[streakCount] = newReward;
            await setGuildConfig(interaction.guildId, newConfig);

            await interaction.editReply(`Added streak reward for ${streakCount} days: ${xpReward} XP, ${goldReward} Gold.`);
            break;
        }

        case "remove-streak-reward": {
            const streakCount = interaction.options.getInteger("streak-count", true);

            if (newConfig.xp.streakRewards && newConfig.xp.streakRewards[streakCount]) {
                delete newConfig.xp.streakRewards[streakCount];
                await setGuildConfig(interaction.guildId, newConfig);
                await interaction.editReply(`Removed streak reward for ${streakCount} days.`);
            } else {
                await interaction.editReply(`No streak reward found for ${streakCount} days.`);
            }
            break;
        }

        default: {
            await interaction.editReply("Unknown subcommand.");
        }
    }

     if (sub !== "list-streak-rewards" && config.logging.enabled) {
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
            source: "logging",
            metaData: { actorDiscordId: interaction.user.id, subcommand: sub },
            timestamp: new Date(),
        }, newConfig);
    }
}
