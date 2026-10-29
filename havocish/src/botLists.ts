import type { Client } from "discord.js";

/**
 * Posts the server count to the bot lists havocish is on, so their pages show
 * it and rank by it. Each list is skipped when its key isn't set (always, in dev).
 */
const LISTS = [
    { name: "discord.bots.gg", key: "DBOTSGG_TOKEN", url: (id: string) => `https://discord.bots.gg/api/v1/bots/${id}/stats`, body: (n: number) => ({ guildCount: n }) },
    { name: "discordbotlist.com", key: "DBL_TOKEN", url: (id: string) => `https://discordbotlist.com/api/v1/bots/${id}/stats`, body: (n: number) => ({ guilds: n }) },
];

async function postCounts(client: Client<true>) {
    const count = client.guilds.cache.size;
    for (const list of LISTS) {
        const key = process.env[list.key]?.trim();
        if (!key) continue;
        const res = await fetch(list.url(client.user.id), {
            method: "POST",
            headers: { Authorization: key, "content-type": "application/json" },
            body: JSON.stringify(list.body(count)),
            signal: AbortSignal.timeout(15_000),
        }).catch((err: Error) => err);
        if (res instanceof Error || !res.ok) console.error(`Posting the server count to ${list.name} failed:`, res instanceof Error ? res.message : res.status);
    }
}

/** Posts now and every 6 hours. The timer doesn't hold the process open on shutdown. */
export function startBotListStats(client: Client<true>) {
    if (!LISTS.some((l) => process.env[l.key]?.trim())) return;
    void postCounts(client);
    setInterval(() => void postCounts(client), 6 * 60 * 60 * 1000).unref();
}
