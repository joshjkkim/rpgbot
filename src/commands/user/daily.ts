import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { grantDailyXp } from "../../db/userGuildProfiles.js";
import { upsertUser } from "../../db/users.js";
import { getGuildConfig, upsertGuild } from "../../db/guilds.js";
import { MessageFlags } from "discord.js";
import { handleLevelUp } from "../../leveling/levels.js";

export const data = new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily reward");

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply("This command can only be used in a server.");
        return;
    }
    
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const user = await upsertUser({
        discordUserId: interaction.user.id,
        username: interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL(),
    });

    const { guild: dbGuild, config } = await getGuildConfig(interaction.guildId);

    const { profile, granted, rewardXp, rewardGold, levelUp, streakReward, increasedStreak } = await grantDailyXp({
        userId: user.id,
        guildId: dbGuild.id,
        config,
    });

    if (granted) {  
        const dailyMessage = config.xp.announceDailyMessage
            .replace('{user}', `<@${interaction.user.id}>`)
            .replace('{xp}', rewardXp?.toString() ?? '0')
            .replace('{gold}', rewardGold?.toString() ?? '0');

        if (config.xp.announceDailyInChannelId) {
            const channel = await interaction.client.channels.fetch(config.xp.announceDailyInChannelId).catch(() => null);
            if (channel && channel.isTextBased() && channel.isSendable()) {
                await channel.send(dailyMessage);
            }
        }
        
        if(config.xp.replyToDailyInChannel) {
            const dailyReply = config.xp.replyToDailyMessage
                .replace('{user}', `<@${interaction.user.id}>`)
                .replace('{xp}', rewardXp?.toString() ?? '0')
                .replace('{gold}', rewardGold?.toString() ?? '0')
                .replace('{streak}', profile.streak_count.toString());

            await interaction.editReply({
                content: dailyReply
            });
        }

        const member = interaction.guild?.members.cache.get(interaction.user.id) ?? (await interaction.guild?.members.fetch(interaction.user.id).catch(() => null));

        if (levelUp) {
            handleLevelUp({
                client: interaction.client,
                guildId: dbGuild.discord_guild_id,
                userId: user.discord_user_id,
                member: member ?? null,
                config, 
                newLevel: profile.level,
            });
        }

        if (increasedStreak && config.xp.streakAnnounceChannelId) {
            const channel = await interaction.client.channels.fetch(config.xp.streakAnnounceChannelId).catch(() => null);
            if (channel && channel.isTextBased() && channel.isSendable()) {
                const streakMessage = config.xp.streakAnnounceMessage
                    .replace('{user}', `<@${interaction.user.id}>`)
                    .replace('{streak}', profile.streak_count.toString());

                await channel.send(streakMessage);
            }
        }

        if (streakReward) {
            if (streakReward.channelId) {
                const channel = await interaction.client.channels.fetch(streakReward.channelId).catch(() => null);
                if (channel && channel.isTextBased() && channel.isSendable()) {
                    const streakMessage = streakReward.message
                        ? streakReward.message
                            .replace('{user}', `<@${interaction.user.id}>`)
                            .replace('{streak}', profile.streak_count.toString())
                            .replace('{xp}', streakReward.xpBonus.toString())
                            .replace('{gold}', streakReward.goldBonus.toString())
                        : `<@${interaction.user.id}> has reached a ${profile.streak_count}-day streak and earned ${streakReward.xpBonus} XP and ${streakReward.goldBonus} Gold!`;

                    await channel.send(streakMessage);
                }
            }
        }
        
    } else {
        const last = profile.last_daily_at ? new Date(profile.last_daily_at) : null;
        if (!last) {
            await interaction.editReply({
                content: `You don't seem to have a daily yet. Try again after you've been active a bit.`,
            });
            return;
        }

        const next = new Date(last.getTime() + 24 * 60 * 60 * 1000);
        const now = new Date();

        const diffMs = next.getTime() - now.getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const diffSeconds = Math.floor((diffMs % (1000 * 60)) / 1000);

        await interaction.editReply({
            content: `You have already claimed your daily reward. ` +
            `You can claim it again in ${diffHours}h ${diffMinutes}m ${diffSeconds}s.`,
        });
    }
}