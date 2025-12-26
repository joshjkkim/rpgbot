import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";

type DiscordGuild = { id: string; owner: boolean };

export async function requireGuildOwner(discordGuildId: string) {
    const session = await getServerSession(authOptions);
    const accessToken = (session as any)?.accessToken as string | undefined;

    if (!accessToken) {
        return { ok: false as const, status: 401 as const };
    }

    async function fetchGuildsOnce() {
        const res = await fetch("https://discord.com/api/users/@me/guilds", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
        });

        if (res.status === 429) return { kind: "retry" as const };
        if (!res.ok) return { kind: "fail" as const };

        const guilds = (await res.json()) as DiscordGuild[];
        return { kind: "ok" as const, guilds };
    }

    let out = await fetchGuildsOnce();

    if (out.kind !== "ok") {
        await new Promise((r) => setTimeout(r, 250));
        out = await fetchGuildsOnce();
    }

    if (out.kind !== "ok") {
        return { ok: false as const, status: 503 as const };
    }

    const isOwner = out.guilds.some((g) => g.id === discordGuildId && g.owner);
    if (!isOwner) return { ok: false as const, status: 403 as const };

    return { ok: true as const, status: 200 as const };
}
