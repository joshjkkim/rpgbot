"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { inviteUrl } from "../lib/invite"

type Guild = {
    id: string;
    name: string;
    icon: string | null;
    installed: boolean;
};

/** Discord's CDN icon, or the initials it falls back to elsewhere in Discord. */
function GuildIcon({ guild }: { guild: Guild }) {
    if (guild.icon) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
        );
    }

    const initials = guild.name
        .split(/\s+/)
        .map((word) => word[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

    return (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--border)] text-xs font-medium">
            {initials}
        </div>
    );
}

export default function Dashboard() {
    const [guilds, setGuilds] = useState<Guild[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const didFetch = useRef(false);
    const router = useRouter();

    useEffect(() => {
        if (didFetch.current) return;
        didFetch.current = true;

        async function fetchGuilds() {
            // Set when re-authorising. The redirect is a navigation, so the
            // spinner has to stay up rather than flashing "no servers found"
            // against the empty list on the way out.
            let redirecting = false;

            try {
                const res = await fetch("/api/discord/guilds");

                // Discord stopped accepting the token (revoked, or a refresh that
                // failed). Re-authorising is silent for an app the user has
                // already approved, so send them through it rather than showing
                // an error they cannot act on.
                if (res.status === 401) {
                    redirecting = true;
                    signIn("discord");
                    return;
                }

                if (res.status === 503) {
                    throw new Error("Discord is not responding right now. Try again in a moment.");
                }

                if (!res.ok) throw new Error("Failed to load your servers.");
                setGuilds(await res.json());
            } catch (err: any) {
                setError(err.message);
            } finally {
                if (!redirecting) setLoading(false);
            }
        }
        fetchGuilds();
    }, []);

    if (loading) {
        return <p className="text-sm text-[var(--muted)]">Loading your servers…</p>;
    }

    if (error) {
        return <p className="text-sm text-red-400">{error}</p>;
    }

    if (!guilds.length) {
        return (
            <p className="text-sm text-[var(--muted)]">
                No servers found. Hermes is configured by server owners, so you will only see
                servers you own here.
            </p>
        );
    }

    // Servers that already have the bot come first -- those are the actionable ones.
    const sorted = [...guilds].sort((a, b) => Number(b.installed) - Number(a.installed));

    return (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {sorted.map((guild) => {
                const invite = inviteUrl(guild.id);

                return (
                    <li
                        key={guild.id}
                        className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
                    >
                        <GuildIcon guild={guild} />

                        <span className="min-w-0 flex-1 truncate font-medium">{guild.name}</span>

                        {guild.installed ? (
                            <button
                                onClick={() => router.push(`/dashboard/${guild.id}`)}
                                className="shrink-0 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--accent-hover)]"
                            >
                                Configure
                            </button>
                        ) : invite ? (
                            // Previously this set an error string, which left the one path
                            // that actually installs the bot as a dead end.
                            <a
                                href={invite}
                                target="_blank"
                                rel="noreferrer"
                                className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--background)]"
                            >
                                Add to Server
                            </a>
                        ) : (
                            <span className="shrink-0 text-sm text-[var(--muted)]">Not installed</span>
                        )}
                    </li>
                );
            })}
        </ul>
    )
}
