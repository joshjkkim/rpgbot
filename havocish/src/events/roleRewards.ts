import { Events, type Client, type GuildMember } from "discord.js";
import { getOrCreateDbUser } from "../cache/userService.js";
import { getOrCreateGuildConfig } from "../cache/guildService.js";
import { grantRoleRewards } from "../player/levelRewards.js";
import { bestEffort } from "../ui/bestEffort.js";

/**
 * Pays role rewards (config.roleRewards) when a member holds a rewarded role
 * they haven't been paid for. Runs on member updates, so a role from another
 * bot pays out straight away, and on messages (messageCreate), so members who
 * already had a role when the owner set its reward get it next time they chat.
 */
export async function checkRoleRewards(member: GuildMember) {
    if (member.user.bot) return;
    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId: member.guild.id });
    if (!Object.keys(config.roleRewards?.roles ?? {}).length) return;

    const { user } = await getOrCreateDbUser({ discordUserId: member.id, username: member.user.username });
    const paid = await grantRoleRewards({ userId: user.id, guildId: guild.id, config, roleIds: [...member.roles.cache.keys()] });
    const channelId = config.roleRewards?.channelId;
    if (!paid.length || !channelId) return;

    const channel = await member.client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased() || !channel.isSendable()) return;
    const lines = paid.filter((p) => p.given.length).map((p) => `🎁 <@${member.id}> got the <@&${p.roleId}> reward: ${p.given.join(", ")}`);
    if (lines.length) await bestEffort("role reward announcement", channel.send({ content: lines.join("\n"), allowedMentions: { users: [member.id] } }));
}

export function registerRoleRewards(client: Client) {
    const run = (member: GuildMember) => checkRoleRewards(member).catch((err) => console.error("Role rewards failed:", err));
    client.on(Events.GuildMemberUpdate, (_old, member) => void run(member));
    // A member discord.js hadn't cached arrives as "available" instead of "update".
    client.on(Events.GuildMemberAvailable, (member) => void run(member as GuildMember));
}
