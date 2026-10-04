import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";

export type DiscordGuild = {
    id: string;
    name: string;
    icon: string | null;
    owner: boolean;
    permissions: string;
};

/**
 * 401 means "sign in again" and 503 means "Discord is having a moment". Keeping
 * them apart matters: an expired OAuth token used to be reported as a 503, so
 * the one failure every user hits after a week looked like an outage.
 */
export type GuildsResult =
    | { ok: true; guilds: DiscordGuild[] }
    | { ok: false; status: 401 | 503 };

async function fetchGuildsOnce(accessToken: string) {
    let res: Response;
    try {
        res = await fetch("https://discord.com/api/users/@me/guilds", {
            headers: { Authorization: `Bearer ${accessToken}` },
            cache: "no-store",
        });
    } catch {
        // Network-level failure, not an answer from Discord. Worth a retry.
        return { kind: "retry" as const };
    }

    // The token is dead: refreshing it is the JWT callback's job and it has
    // already had its chance, so retrying here would just fail identically.
    if (res.status === 401) return { kind: "expired" as const };

    if (res.status === 429 || res.status >= 500) return { kind: "retry" as const };
    if (!res.ok) return { kind: "fail" as const };

    return { kind: "ok" as const, guilds: (await res.json()) as DiscordGuild[] };
}

/** The signed-in user's guilds, straight from Discord. */
export async function fetchUserGuilds(): Promise<GuildsResult> {
    const session = await getServerSession(authOptions);

    // A refresh that failed leaves the session cookie in place but useless, so
    // the error matters as much as a missing token.
    if (!session || session.error || !session.accessToken) {
        return { ok: false, status: 401 };
    }

    let out = await fetchGuildsOnce(session.accessToken);

    if (out.kind === "retry") {
        await new Promise((r) => setTimeout(r, 250));
        out = await fetchGuildsOnce(session.accessToken);
    }

    if (out.kind === "expired") return { ok: false, status: 401 };
    if (out.kind !== "ok") return { ok: false, status: 503 };

    return { ok: true, guilds: out.guilds };
}

/**
 * Gate for a guild's config. Ownership is the bar: Discord reports it directly,
 * with no permission-bit arithmetic to get wrong.
 */
export async function requireGuildOwner(discordGuildId: string) {
    const result = await fetchUserGuilds();
    if (!result.ok) return { ok: false as const, status: result.status };

    const isOwner = result.guilds.some((g) => g.id === discordGuildId && g.owner);
    if (!isOwner) return { ok: false as const, status: 403 as const };

    return { ok: true as const, status: 200 as const };
}

export type GuildMeta = {
    channels: { id: string; name: string; type: number; position: number }[];
    roles: { id: string; name: string; position: number }[];
};

/**
 * The server's channels and roles, for the pickers. Listing them needs the bot,
 * not the signed-in user, so this uses DISCORD_BOT_TOKEN. Returns null when the
 * token is unset or the bot is not in the server; the pickers then fall back to
 * typing an ID. Callers must have checked ownership already.
 */
export async function fetchGuildMeta(discordGuildId: string): Promise<GuildMeta | null> {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) return null;

    const get = (path: string) => fetch(`https://discord.com/api/v10/guilds/${discordGuildId}/${path}`, {
        headers: { Authorization: `Bot ${token}` },
        cache: "no-store",
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

    const [channels, roles] = await Promise.all([get("channels"), get("roles")]);
    if (!Array.isArray(channels) || !Array.isArray(roles)) return null;

    return {
        channels: channels
            .map((c) => ({ id: c.id, name: c.name, type: c.type, position: c.position }))
            .sort((a, b) => a.position - b.position),
        roles: roles
            // @everyone shares the guild's id, and bot-managed roles cannot be granted.
            .filter((r) => r.id !== discordGuildId && !r.managed)
            .map((r) => ({ id: r.id, name: r.name, position: r.position }))
            .sort((a, b) => b.position - a.position),
    };
}
