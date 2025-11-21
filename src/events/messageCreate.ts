import { Client, Events } from "discord.js";
import { upsertUser } from "../db/users.js";
import { getGuildConfig } from "../db/guilds.js";
import { addMessageXp, grantDailyXp, upsertUserGuildProfile } from "../db/userGuildProfiles.js";
import { handleLevelUp } from "../leveling/levels.js";

export function registerMessageCreate(client: Client) {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!message.inGuild()) return;

    try {
      const user = await upsertUser({
        discordUserId: message.author.id,
        username: message.author.username,
        avatarUrl: message.author.displayAvatarURL(),
      });

      const { guild, config } = await getGuildConfig(message.guild.id);

      await upsertUserGuildProfile({
        userId: user.id,
        guildId: guild.id,
      });

      if (config.xp.xpChannelIds[message.channel.id]?.enabled === false) {
        return;
      }

      const member = message.member;
      const roleIds = member?.roles.cache.map(role => role.id) ?? [];

      let {profile, gave, levelUp} = await addMessageXp({
        userId: user.id,
        guildId: guild.id,
        channelId: message.channel.id,
        config,
        roleIds,
      });

      if (levelUp) {
        handleLevelUp({
          client: message.client,
          guildId: guild.discord_guild_id,
          userId: user.discord_user_id,
          member: message.member,
          config,
          newLevel: profile.level,
        });
      }

      let granted = false;
      let rewardXp: number | undefined = undefined;
      let rewardGold: number | undefined = undefined;
      let dailyLevelUp = false;
      if (config.xp.autoDailyEnabled) {
        const dailyResult = await grantDailyXp({
          userId: user.id,
          guildId: guild.id,
          config,
          roleIds,
        });

        granted = dailyResult.granted;
        rewardXp = dailyResult.rewardXp;
        rewardGold = dailyResult.rewardGold;
        profile = dailyResult.profile;
        dailyLevelUp = dailyResult.levelUp;
        const streakReward = dailyResult.streakReward;
        const increasedStreak = dailyResult.increasedStreak;

        if (dailyLevelUp && !levelUp) {
          handleLevelUp({
            client: message.client,
            guildId: guild.discord_guild_id,
            userId: user.discord_user_id,
            member: message.member,
            config,
            newLevel: profile.level,
          });
        }

        if (increasedStreak && config.xp.streakAnnounceChannelId) {
          const channel = await message.client.channels.fetch(config.xp.streakAnnounceChannelId).catch(() => null);
          if (channel && channel.isTextBased() && channel.isSendable()) {
            const streakMessage = config.xp.streakAnnounceMessage
              .replace('{user}', `<@${message.author.id}>`)
              .replace('{streak}', profile.streak_count.toString());

            await channel.send(streakMessage);
          }
        }

        if (streakReward) {
          if (streakReward.channelId) {
            const channel = await message.client.channels.fetch(streakReward.channelId).catch(() => null);
            if (channel && channel.isTextBased() && channel.isSendable()) {
              const streakMessage = streakReward.message
                ? streakReward.message
                    .replace('{user}', `<@${message.author.id}>`)
                    .replace('{streak}', profile.streak_count.toString())
                    .replace('{xp}', streakReward.xpBonus.toString())
                    .replace('{gold}', streakReward.goldBonus.toString())
                : `<@${message.author.id}> has reached a ${profile.streak_count}-day streak and earned ${streakReward.xpBonus} XP and ${streakReward.goldBonus} Gold!`;

              await channel.send(streakMessage);
            }
          }
        }
      }

      if (granted) {
        const dailyChannelId = config.xp.announceDailyInChannelId;
        if (dailyChannelId) {
          const channel = await message.client.channels.fetch(dailyChannelId).catch(() => null);
          if (channel && channel.isTextBased() && channel.isSendable()) {
            const dailyMessage = config.xp.announceDailyMessage
              .replace('{user}', `<@${message.author.id}>`)
              .replace('{xp}', rewardXp?.toString() ?? '0')
              .replace('{gold}', rewardGold?.toString() ?? '0');
            await channel.send(dailyMessage);
          }
        }

        if (config.xp.replyToDailyInChannel) {
          const replyMessage = config.xp.replyToDailyMessage
            .replace('{xp}', rewardXp?.toString() ?? '0')
            .replace('{gold}', rewardGold?.toString() ?? '0')
            .replace('{streak}', profile.streak_count.toString());
          await message.reply({ content: replyMessage});
        }
      }
    } catch (error) {
      console.error("Error processing messageCreate event:", error);
    }
  });
}
