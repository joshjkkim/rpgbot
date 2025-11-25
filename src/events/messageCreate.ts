import { Client, Events } from "discord.js";
import { getOrCreateGuildConfig } from "../cache/guildService.js";
import { addMessageXp, grantDailyXp } from "../db/userGuildProfiles.js";
import { handleLevelUp } from "../leveling/levels.js";
import { getOrCreateDbUser } from "../cache/userService.js";

export function registerMessageCreate(client: Client) {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!message.inGuild()) return;

    try {
      const { user } = await getOrCreateDbUser({
        discordUserId: message.author.id,
        username: message.author.username,
        avatarUrl: message.author.displayAvatarURL(),
      });

      const { guild, config } = await getOrCreateGuildConfig({ discordGuildId: message.guild.id });

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
              .replace('{streak}', profile.streak_count.toString())
              .replace('{xp}', rewardXp?.toString() ?? '0')
              .replace(`{xpName}`, config.style.xp.name || "XP")
              .replace(`{xpIcon}`, config.style.xp.icon || "⭐")
              .replace(`{goldName}`, config.style.gold.name || "Gold")
              .replace(`{goldIcon}`, config.style.gold.icon || "💰")
              .replace('{gold}', rewardGold?.toString() ?? '0');

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
                    .replace(`{xpName}`, config.style.xp.name || "XP")
                    .replace(`{goldName}`, config.style.gold.name || "Gold")
                    .replace(`{xpIcon}`, config.style.xp.icon || "⭐")
                    .replace(`{goldIcon}`, config.style.gold.icon || "💰")
                    .replace('{gold}', streakReward.goldBonus.toString())
                : `<@${message.author.id}> has reached a ${profile.streak_count}-day streak and earned ${streakReward.xpBonus} ${config.style.xp.name || "XP"} ${config.style.xp.icon || "⭐"} and ${streakReward.goldBonus} ${config.style.gold.name || "Gold"} ${config.style.gold.icon || "💰"}!`;

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
              .replace(`{xpName}`, config.style.xp.name || "XP")
              .replace(`{xpIcon}`, config.style.xp.icon || "⭐")
              .replace('{gold}', rewardGold?.toString() ?? '0')
              .replace(`{goldName}`, config.style.gold.name || "Gold")
              .replace(`{goldIcon}`, config.style.gold.icon || "💰")
              .replace('{streak}', profile.streak_count.toString());
            await channel.send(dailyMessage);
          }
        }

        if (config.xp.replyToDailyInChannel) {
          const replyMessage = config.xp.replyToDailyMessage
            .replace('{xp}', rewardXp?.toString() ?? '0')
            .replace('{gold}', rewardGold?.toString() ?? '0')
            .replace(`{xpName}`, config.style.xp.name || "XP")
            .replace(`{xpIcon}`, config.style.xp.icon || "⭐")
            .replace(`{goldName}`, config.style.gold.name || "Gold")
            .replace(`{goldIcon}`, config.style.gold.icon || "💰")
            .replace('{streak}', profile.streak_count.toString());
          await message.reply({ content: replyMessage});
        }
      }
    } catch (error) {
      console.error("Error processing messageCreate event:", error);
    }
  });
}
