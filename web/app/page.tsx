"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Flame,
  IdCard,
  ScrollText,
  Sparkles,
  Store,
  Swords,
  TrendingUp,
} from "lucide-react";
import { inviteUrl } from "./lib/invite";

const FEATURES = [
  {
    icon: Sparkles,
    title: "XP that fits your server",
    body: "Earn XP from messages and time in voice. Per-channel multipliers, flat bonuses and cooldown overrides, plus role-based rates for boosters and staff.",
  },
  {
    icon: TrendingUp,
    title: "Levels with real rewards",
    body: "Four progression curves, per-level XP overrides, and actions that fire on level-up — assign a role, strip a role, or announce it in a channel you pick.",
  },
  {
    icon: Flame,
    title: "Dailies and streaks",
    body: "Daily XP and gold with a streak multiplier that compounds, and milestone rewards at whatever day counts you choose.",
  },
  {
    icon: Store,
    title: "A shop worth spending in",
    body: "Categories, stock limits, per-user caps, role and level gates. Items can grant roles, restore health, hand out stats, or give other items.",
  },
  {
    icon: Swords,
    title: "Equipment and combat",
    body: "Nine equipment slots feeding HP, attack, defence, speed and crit. Turn-based fights against enemies you define, plus wagered duels between members — with a rake you set.",
  },
  {
    icon: ArrowLeftRight,
    title: "Trading and gifting",
    body: "Players swap items and gold through offers that are re-checked at accept time, so nothing duplicates and nothing oversells.",
  },
  {
    icon: ScrollText,
    title: "Quests and achievements",
    body: "Objectives that track message, XP, daily and combat activity, with cooldowns, repeatability, and rewards that announce where you want them.",
  },
  {
    icon: IdCard,
    title: "Profile cards",
    body: "Rendered profile images with progress bars, equipment, combat stats and your server's own colours, icons and currency names.",
  },
];

const primaryButton =
  "rounded-lg bg-[var(--accent)] font-semibold text-[var(--accent-ink)] shadow-[0_0_24px_-6px_var(--accent)] transition hover:-translate-y-px hover:bg-[var(--accent-hover)]";
const ghostButton =
  "rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 font-medium transition hover:border-[var(--accent)]/60 hover:bg-[var(--surface-2)]";

function Wordmark() {
  return (
    <span className="flex items-center gap-2 font-bold tracking-tight">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent)]/15 text-[var(--accent)] ring-1 ring-[var(--accent)]/40">
        <Swords size={16} />
      </span>
      rpgbot
    </span>
  );
}

function Header() {
  const { data: session } = useSession();
  const router = useRouter();

  return (
    <header className="flex items-center justify-between px-6 py-4">
      <Wordmark />

      {session ? (
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-sm text-[var(--muted)]">
            {session.user?.name}
          </span>
          <button onClick={() => router.push("/dashboard")} className={`${primaryButton} px-3 py-1.5 text-sm`}>
            Dashboard
          </button>
          <button onClick={() => signOut()} className={`${ghostButton} px-3 py-1.5 text-sm`}>
            Sign out
          </button>
        </div>
      ) : (
        <button onClick={() => signIn("discord")} className={`${primaryButton} px-3 py-1.5 text-sm`}>
          Sign in with Discord
        </button>
      )}
    </header>
  );
}

/** A static stand-in for the card `/profile` renders, in the same colours. */
function ProfileCardPreview() {
  return (
    <div className="relative mx-auto w-full max-w-md rotate-[-1.5deg] rounded-2xl border border-[var(--accent)]/25 bg-[var(--surface)]/95 p-5 text-left shadow-[0_20px_60px_-20px_var(--accent)]">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[#0b5c49] text-xl font-bold text-[var(--accent-ink)] ring-2 ring-[var(--accent)]/50 ring-offset-2 ring-offset-[var(--surface)]">
          A
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">Aria the Bold</div>
          <div className="text-xs text-[var(--muted)]">Rank #3 in Tavern of Legends</div>
        </div>
        <div className="rounded-lg border border-[var(--accent)]/50 bg-[var(--accent)]/15 px-3 py-1 text-center">
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Level</div>
          <div className="text-lg font-bold leading-tight text-[var(--accent)]">12</div>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-xs text-[var(--muted)]">
          <span>⭐ 3,420 / 5,000 XP</span>
          <span>68%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.08]">
          <div className="h-full w-[68%] rounded-full bg-gradient-to-r from-[var(--accent)]/70 to-[var(--accent)] shadow-[0_0_12px_var(--accent)]" />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2 text-center text-sm">
        {[
          ["💰", "1,240", "Gold"],
          ["🔥", "7 days", "Streak"],
          ["⚔️", "38", "Attack"],
        ].map(([icon, value, label]) => (
          <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-2">
            <div className="font-semibold">
              {icon} {value}
            </div>
            <div className="text-[11px] text-[var(--muted)]">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const { data: session } = useSession();
  const invite = inviteUrl();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pt-14 pb-20 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1 text-xs font-medium text-[var(--accent)]">
              ⭐ Level up your community
            </span>
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-6xl">
              Turn your Discord server into an{" "}
              <span className="bg-gradient-to-r from-[var(--accent)] to-[var(--gold)] bg-clip-text text-transparent">
                RPG
              </span>
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-[var(--muted)]">
              rpgbot gives your members levels to climb, gold to earn and spend, gear to
              equip and enemies to fight — and gives you a dashboard to tune every number
              behind it, without touching a config file.
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              {invite && (
                <a href={invite} target="_blank" rel="noreferrer" className={`${primaryButton} px-5 py-2.5`}>
                  Add to Server
                </a>
              )}
              <button
                onClick={() => (session ? (window.location.href = "/dashboard") : signIn("discord"))}
                className={`${ghostButton} px-5 py-2.5`}
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
          </div>

          <ProfileCardPreview />
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <h2 className="mb-6 text-center text-sm font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            Everything a campaign needs
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group rounded-xl border border-[var(--border)] bg-[var(--surface)]/80 p-5 transition hover:-translate-y-0.5 hover:border-[var(--accent)]/50"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)]/12 text-[var(--accent)] ring-1 ring-[var(--accent)]/25 transition group-hover:bg-[var(--accent)]/20">
                  <f.icon size={18} />
                </span>
                <h3 className="mt-3 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{f.body}</p>
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
