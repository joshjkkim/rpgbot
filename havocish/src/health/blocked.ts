import { PermissionFlagsBits, RESTEvents, type Client, type Guild, type GuildBasedChannel } from "discord.js";

/*
 * Owners don't open the dashboard, so the health check never reached them:
 * when Discord refused a post (a log, a fight thread, a level-up) it just
 * didn't appear, and a server that set up logging left thinking havocish was
 * broken. This tells them in Discord instead.
 *
 * Problems come from two places: every request Discord refuses for lack of
 * permission (a 403, seen through discord.js's REST "response" event, so no
 * caller has to report it), and channels checked as they're picked
 * (`checkPostable`). The next time an owner or manager uses havocish there,
 * their reply gets one private note listing them (interactionCreate). Each
 * problem is told at most once a day.
 */

const DAY = 24 * 60 * 60 * 1000;
/** Per server: what's waiting to be told, by a key naming the problem. */
const pending = new Map<string, Map<string, string>>();
/** `${guildId}|${key}` → when it was last told. */
const told = new Map<string, number>();

/** "SendMessages" → "Send Messages". */
const words = (flag: string) => flag.replace(/([a-z])([A-Z])/g, "$1 $2");

function note(guildId: string, key: string, text: string, now = Date.now()) {
    if (now - (told.get(`${guildId}|${key}`) ?? 0) < DAY) return;
    if (!pending.has(guildId)) pending.set(guildId, new Map());
    pending.get(guildId)!.set(key, text);
}

/** What's waiting to be told for this server, marked as told. */
export function takeWarnings(guildId: string, now = Date.now()): string[] {
    const waiting = pending.get(guildId);
    if (!waiting?.size) return [];
    pending.delete(guildId);
    for (const key of waiting.keys()) told.set(`${guildId}|${key}`, now);
    return [...waiting.values()];
}

/** What havocish lacks to post (with embeds) in the channel, as permission names; empty when it can. */
function missingToPost(channel: GuildBasedChannel): string[] {
    const me = channel.guild.members.me;
    const allowed = me ? channel.permissionsFor(me) : null;
    const need = channel.isThread()
        ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.EmbedLinks]
        : [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];
    return allowed ? allowed.missing(need).map(words) : ["View Channel", "Send Messages", "Embed Links"];
}

/**
 * For a channel just picked to post `what` in (logs, level-ups): if havocish can't post there,
 * the picker is told with their reply. Returns whether it can.
 */
export function checkPostable(guild: Guild, channelId: string, what: string): boolean {
    const channel = guild.channels.cache.get(channelId);
    if (!channel) return true;
    const missing = missingToPost(channel);
    if (!missing.length) return true;
    note(guild.id, `post:${channelId}`, `I can't post ${what} in <#${channelId}> yet: give me ${missing.join(", ")} there.`);
    return false;
}

/** The problem behind a refused request, by its path; null for refusals an owner can't fix by permissions. */
export function refusal(client: Client, method: string, path: string): { guildId: string; key: string; text: string } | null {
    let m = path.match(/^\/channels\/(\d+)\/(messages|threads|webhooks)(?:\/\d+\/threads)?$/);
    if (m && method !== "GET") {
        const channel = client.channels.cache.get(m[1]!);
        if (!channel || channel.isDMBased()) return null;
        const at = channel.isThread() && channel.parentId ? channel.parentId : channel.id;
        if (m[2] === "webhooks") {
            return { guildId: channel.guildId, key: `webhooks`, text: `I can't post as your characters: give me Manage Webhooks (Server Settings → Roles), or they post as havocish instead.` };
        }
        if (path.endsWith("/threads")) {
            return { guildId: channel.guildId, key: `threads:${at}`, text: `I can't start fight threads in <#${at}>, so fights there play in the chat instead: give me Create Public Threads and Send Messages in Threads there.` };
        }
        const missing = missingToPost(channel);
        return { guildId: channel.guildId, key: `post:${at}`, text: `I couldn't post in <#${at}>: give me ${missing.length ? missing.join(", ") : "permission to post"} there.` };
    }
    m = path.match(/^\/guilds\/(\d+)\/members\/\d+\/roles\/(\d+)$/);
    if (m) {
        const role = client.guilds.cache.get(m[1]!)?.roles.cache.get(m[2]!);
        return { guildId: m[1]!, key: `role:${m[2]}`, text: `I couldn't give ${role ? `@${role.name}` : "a role"}: give me Manage Roles and drag my role above it in Server Settings → Roles.` };
    }
    return null;
}

/** Notes every request Discord refuses for lack of permission. Call once at startup. */
export function watchRefusals(client: Client): void {
    client.rest.on(RESTEvents.Response, (request, response) => {
        if (response.status !== 403) return;
        const problem = refusal(client, request.method, String(request.path));
        if (problem) note(problem.guildId, problem.key, problem.text);
    });
}
