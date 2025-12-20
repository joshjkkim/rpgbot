import type { GuildConfig } from "../types/guild.js";
import { Client, GuildMember } from "discord.js";

interface HandleLevelUpArgs {
  client: Client;
  guildId: string;
  userId: string;
  member?: GuildMember | null;
  config: GuildConfig;
  newLevel: number;
}

export function calculateTotalXpForLevel(level: number, guildConfig: GuildConfig): number {
  const { levels } = guildConfig;
  const { curveType, curveParams, xpOverrides } = levels;

  if (level <= 0) return 0;

  const override = xpOverrides[level];
  if (override != null) return override;

  switch (curveType) {
    case "linear": {
      const rate = curveParams["rate"] ?? 100;
      return rate * level;
    }
    case "exponential": {
      const base = curveParams["base"] ?? 2;
      const factor = curveParams["factor"] ?? 50;
      return Math.floor(factor * Math.pow(base, level - 1));
    }
    case "polynomial": {
      const degree = curveParams["degree"] ?? 2;
      const factor = curveParams["factor"] ?? 100;
      return Math.floor(factor * Math.pow(level, degree));
    }
    case "logarithmic": {
      const base = curveParams["base"] ?? 2;
      const factor = curveParams["factor"] ?? 200;
      return Math.floor(
        factor * Math.log(level + 1) / Math.log(base)
      );
    }
    default:
      throw new Error(`Unknown curve type: ${curveType}`);
  }
}

export function calculateLevelFromXp(xp: number, guildConfig: GuildConfig): number {
  const { levels } = guildConfig;
  const { maxLevel } = levels;

  if (xp <= 0) return 0;

  let level = 0;
  while (true) {
    const nextLevel = level + 1;

    if (maxLevel != null && nextLevel > maxLevel) {
      return maxLevel;
    }

    const xpForNextLevel = calculateTotalXpForLevel(nextLevel, guildConfig);

    if (xp < xpForNextLevel) {
      // xp is between totalXpFor(level) and totalXpFor(nextLevel)
      return level;
    }

    level = nextLevel;
  }
}

export async function handleLevelUp(args: HandleLevelUpArgs) {
  const { client, guildId, userId, member, config, newLevel } = args;

  const levelChannelId = config.levels.announceLevelUpInChannelId;
  if (levelChannelId) {
    const channel = await client.channels.fetch(levelChannelId).catch(() => null);
    if (channel && channel.isTextBased() && channel.isSendable()) {
      const announceMessage = config.levels.announceLevelUpMessage
        .replace("{user}", `<@${userId}>`)
        .replace("{level}", newLevel.toString());

      await channel.send(announceMessage);
    }
  }

  const levelActions = config.levels.levelActions[newLevel];

  if (!levelActions) return;

  for (const action of levelActions) {
    if (action.type === "assignRole" && action.roleId) {
      if (!member) continue;
      console.log(`Assigning role ${action.roleId} to user ${userId}`);
      await member.roles.add(action.roleId).catch((err: string) => {
        console.error("Failed to assign role:", err);
      });
    } else if (action.type === "removeRole" && action.roleId) {
      if (!member) continue;
      await member.roles.remove(action.roleId).catch((err: string) => {
        console.error("Failed to remove role:", err);
      });
    } else if (action.type === "sendMessage" && action.message) {
      const targetChannelId = action.channelId ?? config.levels.announceLevelUpInChannelId;
      if (!targetChannelId) continue;

      const channel = await client.channels.fetch(targetChannelId).catch(() => null);
      if (channel && channel.isTextBased() && channel.isSendable()) {
        await channel.send(action.message.replace("{user}", `<@${userId}>`));
      }
    } else if (action.type === "runCommand" && action.command) {
      // TODO: implement custom command execution later
    }
  }
}