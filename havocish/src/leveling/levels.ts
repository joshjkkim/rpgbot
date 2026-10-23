import type { GuildConfig } from "../types/guild.js";
import { Client, GuildMember } from "discord.js";
import { renderLevelUpBanner } from "../ui/canvas/levelUpBanner.js";
import { bestEffort } from "../ui/bestEffort.js";
import { mentionsFor } from "../ui/mentions.js";

interface HandleLevelUpArgs {
  client: Client;
  guildId: string;
  userId: string;
  member?: GuildMember | null;
  config: GuildConfig;
  newLevel: number;
  /** The level before this level-up. Rewards run for every level crossed, not just the last. */
  fromLevel?: number;
  /** What the gold/item/Combat XP actions gave, already granted (player/levelRewards.ts). */
  rewards?: string[];
}

/**
 * Total XP at which a level begins. Everyone starts at level 1 with 0 XP, so
 * the curve's first step is level 2: the formula runs on `level - 1`. It used
 * to run on `level` while level 1 was still shown from 0, which made level 1
 * span two steps (four times as long as intended on a polynomial curve).
 */
export function calculateTotalXpForLevel(level: number, guildConfig: GuildConfig): number {
  const { levels } = guildConfig;
  const { curveType, curveParams, xpOverrides } = levels;

  if (level <= 1) return 0;

  const override = xpOverrides[level];
  if (override != null) return override;

  const n = level - 1;
  switch (curveType) {
    case "linear": {
      const rate = curveParams["rate"] ?? 100;
      return rate * n;
    }
    case "exponential": {
      const base = curveParams["base"] ?? 2;
      const factor = curveParams["factor"] ?? 50;
      return Math.floor(factor * Math.pow(base, n - 1));
    }
    case "polynomial": {
      const degree = curveParams["degree"] ?? 2;
      const factor = curveParams["factor"] ?? 100;
      return Math.floor(factor * Math.pow(n, degree));
    }
    case "logarithmic": {
      const base = curveParams["base"] ?? 2;
      const factor = curveParams["factor"] ?? 200;
      return Math.floor(
        factor * Math.log(n + 1) / Math.log(base)
      );
    }
    default:
      throw new Error(`Unknown curve type: ${curveType}`);
  }
}

/** Total XP at which a level begins (the same as calculateTotalXpForLevel). */
export function levelStartXp(level: number, guildConfig: GuildConfig): number {
  return calculateTotalXpForLevel(level, guildConfig);
}

/** The level a total XP amount reaches. Never below 1: members start at level 1. */
export function calculateLevelFromXp(xp: number, guildConfig: GuildConfig): number {
  return Math.max(1, rawLevelFromXp(xp, guildConfig));
}

function rawLevelFromXp(xp: number, guildConfig: GuildConfig): number {
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
  const fromLevel = args.fromLevel ?? newLevel - 1;

  const levelChannelId = config.levels.announceLevelUpInChannelId;
  if (levelChannelId) {
    const channel = await client.channels.fetch(levelChannelId).catch(() => null);
    if (channel && channel.isTextBased() && channel.isSendable()) {
      const announceMessage = config.levels.announceLevelUpMessage
        .replace("{user}", `<@${userId}>`)
        .replace("{level}", newLevel.toString())
        + (args.rewards?.length ? `\n🎁 ${args.rewards.join(", ")}` : "");

      // The banner is decoration: if it fails to render, the text still goes out.
      const banner = await (async () => {
        const user = member?.user ?? await client.users.fetch(userId);
        return renderLevelUpBanner({
          name: member?.displayName ?? user.displayName,
          avatarUrl: (member ?? user).displayAvatarURL({ extension: "png", size: 256 }),
          level: newLevel,
          accent: config.style.mainThemeColor,
        });
      })().catch((err) => {
        console.error("Failed to render level-up banner:", err);
        return null;
      });

      await bestEffort("level-up announcement", channel.send({ content: announceMessage, files: banner ? [banner] : [], allowedMentions: await mentionsFor(guildId, userId) }));
    }
  }

  for (let level = fromLevel + 1; level <= newLevel; level++) {
    for (const action of config.levels.levelActions[level] ?? []) {
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
          await bestEffort("level-up announcement", channel.send({ content: action.message.replace("{user}", `<@${userId}>`), allowedMentions: await mentionsFor(guildId, userId) }));
        }
      }
    }
  }
}
/**
 * A daily message template, minus its XP part when the server's leveling is
 * off (dailies then pay only gold): "reward of {xp} {xpName} {xpIcon} and {gold}..."
 * becomes "reward of {gold}...". Custom wording without that phrase is left as written.
 */
export function dailyTemplate(template: string, config: GuildConfig) {
  return config.xp.enabled === false ? template.replace(/\{xp\} \{xpName\} \{xpIcon\} and /g, "") : template;
}
