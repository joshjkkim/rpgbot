import {
    EmbedBuilder, PermissionFlagsBits,
    type APIEmbed, type Message, type MessageCreateOptions, type SendableChannels, type Webhook,
} from "discord.js";
import type { CharacterConfig, GuildConfig } from "../types/guild.js";
import { emojiImageUrl } from "./canvas/drawEmojis.js";

/**
 * Characters: the game's public posts under an owner-made name and picture.
 * With Manage Webhooks they post through a webhook the bot owns in that
 * channel, so they read as someone else talking (buttons still work: the
 * webhook belongs to havocish). Without it, the bot posts as itself with the
 * character's name and picture at the top. Replies to commands can't come
 * from a webhook, so those use the same header (characterHeader).
 */

export type Speaker = { name: string; avatarUrl: string | null; lines: string[] };

/** A character by id, ready to speak, or null when unset or gone. */
export function speaker(config: GuildConfig, id: string | null | undefined): Speaker | null {
    const c: CharacterConfig | undefined = id ? config.characters?.list?.[id] : undefined;
    if (!c?.name) return null;
    const avatar = c.avatar?.trim();
    return { name: c.name, avatarUrl: avatar ? (/^https?:\/\//.test(avatar) ? avatar : emojiImageUrl(avatar)) : null, lines: c.lines?.filter(Boolean) ?? [] };
}

/** Who announces level-ups, achievements and milestones. */
export const announcer = (config: GuildConfig) => speaker(config, config.characters?.announcerId);
/** Who announces rare finds and the shop's news. */
export const shopkeeper = (config: GuildConfig) => speaker(config, config.characters?.shopkeeperId);

/** One of their lines, at random, as an italic quote; empty when they have none. */
export function lineOf(who: Speaker | null): string {
    const lines = who?.lines ?? [];
    return lines.length ? `*“${lines[Math.floor(Math.random() * lines.length)]}”*` : "";
}

/** The name-and-picture header on an embed, for posts and replies the bot makes itself. */
export function characterHeader<T extends EmbedBuilder | APIEmbed>(embed: T, who: Speaker | null): EmbedBuilder | T {
    if (!who) return embed;
    return EmbedBuilder.from(embed).setAuthor({ name: who.name, ...(who.avatarUrl && { iconURL: who.avatarUrl }) });
}

/** channel id -> the webhook havocish owns there. */
const hooks = new Map<string, Webhook>();

async function hookFor(channel: SendableChannels): Promise<{ hook: Webhook; threadId?: string } | null> {
    if (!("guild" in channel) || !channel.guild) return null;
    const parent = channel.isThread() ? channel.parent : channel;
    if (!parent || !("createWebhook" in parent)) return null;
    const me = channel.guild.members.me;
    if (!me || !parent.permissionsFor(me).has(PermissionFlagsBits.ManageWebhooks)) return null;
    let hook = hooks.get(parent.id);
    if (!hook) {
        const mine = (await parent.fetchWebhooks()).find((w) => w.applicationId === channel.client.application.id);
        hook = mine ?? await parent.createWebhook({ name: "havocish", reason: "Characters post here" });
        hooks.set(parent.id, hook);
    }
    return { hook, ...(channel.isThread() && { threadId: channel.id }) };
}

/** Posts as `who` (or as the bot when null): through a webhook if allowed, else with a header. */
export async function speak(channel: SendableChannels, who: Speaker | null, payload: MessageCreateOptions): Promise<Message> {
    if (who) {
        try {
            const target = await hookFor(channel);
            if (target) {
                return await target.hook.send({
                    ...(payload as object),
                    username: who.name.slice(0, 80),
                    ...(who.avatarUrl && { avatarURL: who.avatarUrl }),
                    ...(target.threadId && { threadId: target.threadId }),
                } as Parameters<Webhook["send"]>[0]);
            }
        } catch (err) {
            // A webhook deleted by hand, or a permission just taken away: forget it and post plainly.
            if ("guild" in channel && channel.guild) hooks.delete(channel.isThread() ? channel.parentId ?? "" : channel.id);
            console.warn("Character post fell back to the bot:", (err as Error).message);
        }
    }
    return channel.send(withHeader(payload, who));
}

/** Without a webhook: the character's name and picture on the first embed, or their name before the text. */
function withHeader(payload: MessageCreateOptions, who: Speaker | null): MessageCreateOptions {
    if (!who) return payload;
    const [first, ...rest] = payload.embeds ?? [];
    if (first) return { ...payload, embeds: [characterHeader(first as APIEmbed, who), ...rest] };
    return { ...payload, content: `**${who.name}:** ${payload.content ?? ""}` };
}

/** Edits a message `speak` posted: through its webhook when a webhook sent it. */
export async function editSpoken(message: Message, payload: Parameters<Message["edit"]>[0]): Promise<Message | null> {
    if (!message.webhookId) return message.edit(payload).catch(() => null);
    try {
        // After a restart the cache is empty: the channel's list includes the token editing needs.
        const parent = message.channel.isThread() ? message.channel.parent : message.channel;
        const hook = [...hooks.values()].find((h) => h.id === message.webhookId)
            ?? (parent && "fetchWebhooks" in parent ? (await parent.fetchWebhooks()).get(message.webhookId) : undefined);
        if (!hook) return null;
        hooks.set(parent!.id, hook);
        return await hook.editMessage(message, { ...(typeof payload === "string" ? { content: payload } : payload as object), ...(message.channel.isThread() && { threadId: message.channelId }) } as Parameters<Webhook["editMessage"]>[1]);
    } catch {
        return null;
    }
}
