"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { inviteUrl } from "./lib/invite";

const FEATURES = [
  {
    title: "XP that fits your server",
    body: "Earn XP from messages and time in voice. Per-channel multipliers, flat bonuses and cooldown overrides, plus role-based rates for boosters and staff.",
  },
  {
    title: "Levels with real rewards",
    body: "Four progression curves, per-level XP overrides, and actions that fire on level-up — assign a role, strip a role, or announce it in a channel you pick.",
  },
  {
    title: "Dailies and streaks",
    body: "Daily XP and gold with a streak multiplier that compounds, and milestone rewards at whatever day counts you choose.",
  },
  {
    title: "A shop worth spending in",
    body: "Categories, stock limits, per-user caps, role and level gates. Items can grant roles, restore health, hand out stats, or give other items.",
  },
  {
    title: "Equipment and combat",
    body: "Nine equipment slots feeding HP, attack, defence, speed and crit. Turn-based fights against enemies you define, with configurable death penalties.",
  },
  {
    title: "Trading and gifting",
    body: "Players swap items and gold through offers that are re-checked at accept time, so nothing duplicates and nothing oversells.",
  },
  {
    title: "Quests and achievements",
    body: "Objectives that track message, XP, daily and combat activity, with cooldowns, repeatability, and rewards that announce where you want them.",
  },
  {
    title: "Profile cards",
    body: "Rendered profile images with progress bars, equipment, combat stats and your server's own colours, icons and currency names.",
  },
];

function Header() {
  const { data: session } = useSession();
  const router = useRouter();

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
      <span className="font-semibold tracking-tight">Hermes</span>

      {session ? (
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-sm text-[var(--muted)]">
            {session.user?.name}
          </span>
          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--accent-hover)]"
          >
            Dashboard
          </button>
          <button
            onClick={() => signOut()}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface)]"
          >
            Sign out
          </button>
        </div>
      ) : (
        <button
          onClick={() => signIn("discord")}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--accent-hover)]"
        >
          Sign in with Discord
        </button>
      )}
    </header>
  );
}

export default function Home() {
  const { data: session } = useSession();
  const invite = inviteUrl();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-6 pt-20 pb-16 text-center">
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
            Turn your Discord server into an RPG
          </h1>
          <p className="mt-5 text-lg text-[var(--muted)] leading-relaxed">
            Hermes gives your members levels to climb, gold to earn and spend, gear to
            equip and enemies to fight — and gives you a dashboard to tune every number
            behind it, without touching a config file.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            {invite && (
              <a
                href={invite}
                target="_blank"
                rel="noreferrer"
                className="rounded-md bg-[var(--accent)] px-5 py-2.5 font-medium transition-colors hover:bg-[var(--accent-hover)]"
              >
                Add to Server
              </a>
            )}
            <button
              onClick={() => (session ? (window.location.href = "/dashboard") : signIn("discord"))}
              className="rounded-md border border-[var(--border)] px-5 py-2.5 font-medium transition-colors hover:bg-[var(--surface)]"
            >
              {session ? "Open dashboard" : "Sign in with Discord"}
            </button>
          </div>

          {!invite && (
            <p className="mt-4 text-xs text-[var(--muted)]">
              Set <code className="font-mono">NEXT_PUBLIC_DISCORD_CLIENT_ID</code> to show the
              install link.
            </p>
          )}
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-24">
          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"
              >
                <h2 className="font-medium">{f.title}</h2>
                <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] px-6 py-6 text-center text-sm text-[var(--muted)]">
        Configure everything from the dashboard, or with <code className="font-mono">/config-*</code>{" "}
        commands in Discord.
      </footer>
    </div>
  );
}
