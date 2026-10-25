import type { Client, GuildMember } from "discord.js";
import type { GuildConfig, UnlockConfig } from "../types/guild.js";
import type { DbUserGuildProfile } from "../types/userprofile.js";
import { checkRequirements, memberFacts } from "./requirements.js";
import { getOrCreateProfile } from "../cache/profileService.js";
import { getOrCreateDbUser } from "../cache/userService.js";
import { getOrCreateGuildConfig } from "../cache/guildService.js";
import { bestEffort } from "../ui/bestEffort.js";
import { mentionsFor } from "../ui/mentions.js";
import { announcer, speak } from "../ui/characters.js";

/**
 * Unlocks: roles a member earns by meeting requirements. The owner hides a
 * channel behind the role, so it appears the moment it's earned: the closest
 * Discord gets to finding a new area. Roles are given, never taken: a member
 * who earned the Crypt keeps it.
 */

/** The unlocks this member qualifies for and doesn't hold yet. */
export function earned(config: GuildConfig, profile: DbUserGuildProfile, member: Pick<GuildMember, "roles"> & Parameters<typeof memberFacts>[0]): UnlockConfig[] {
    const facts = memberFacts(member);
    return Object.values(config.unlocks?.list ?? {}).filter((u) =>
        u.roleId && !facts.roleIds.includes(u.roleId) && checkRequirements(u.requirements, { profile, config, facts }).ok);
}

/** "🗺️ @member unlocked **⚰️ The Barrow Crypt**!", or the role's name when it opens no place. */
function unlockLine(config: GuildConfig, u: UnlockConfig, userId: string): string {
    const place = u.placeId ? config.combat?.places?.[u.placeId] : undefined;
    return `🗺️ <@${userId}> unlocked **${place ? `${place.emoji} ${place.name}` : `<@&${u.roleId}>`}**!`;
}

/**
 * Gives the roles a member has just earned and announces them. Called with
 * the collection check after anything that can move them on.
 */
export async function checkUnlocks(opts: {
    client: Client; config: GuildConfig;
    discordUserId: string; discordGuildId: string;
    fallbackChannelId?: string | null;
}): Promise<void> {
    const { client, config, discordUserId, discordGuildId } = opts;
    if (!Object.values(config.unlocks?.list ?? {}).some((u) => u.roleId)) return;
    const guild = client.guilds.cache.get(discordGuildId);
    const member = guild ? await guild.members.fetch(discordUserId).catch(() => null) : null;
    if (!member) return;
    const { user } = await getOrCreateDbUser({ discordUserId });
    const { guild: dbGuild } = await getOrCreateGuildConfig({ discordGuildId });
    const { profile } = await getOrCreateProfile({ userId: user.id, guildId: dbGuild.id });

    const given: UnlockConfig[] = [];
    for (const u of earned(config, profile, member)) {
        // A role above the bot's own, or deleted: the health check says so; nothing to announce.
        if (await member.roles.add(u.roleId, "Unlocked in havocish").then(() => true, () => false)) given.push(u);
    }
    if (!given.length) return;

    const channelId = config.unlocks?.channelId || opts.fallbackChannelId;
    const channel = channelId ? await client.channels.fetch(channelId).catch(() => null) : null;
    if (!channel?.isTextBased() || !channel.isSendable()) return;
    await bestEffort("unlock announcement", speak(channel, announcer(config), {
        content: given.map((u) => unlockLine(config, u, discordUserId)).join("\n"),
        allowedMentions: await mentionsFor(discordGuildId, discordUserId, { users: [discordUserId] }),
    }));
}
