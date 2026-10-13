import type { Message } from "discord.js";
import { PermissionFlagsBits } from "discord.js";

/**
 * Whether the bot can post an embed with buttons in this message's channel.
 * Random spawns check first, so a channel the bot can read but not write to
 * skips the spawn instead of failing with Missing Permissions.
 */
export function canPost(message: Message<true>): boolean {
    const me = message.guild.members.me;
    return !!me && message.channel.isSendable() && message.channel.permissionsFor(me).has([
        PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks,
    ]);
}
