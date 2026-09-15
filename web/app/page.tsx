"use client";

import { useEffect, useState } from "react";
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

const primaryButton = "btn";
const ghostButton = "btn btn-stone";

/** Where to go after signing in: a same-site ?callbackUrl path, else the dashboard. */
function afterSignIn() {
  const next = new URLSearchParams(window.location.search).get("callbackUrl");
  return next && /^\/(?![/\\])/.test(next) ? next : "/dashboard";
}

function Wordmark() {
  return (
    <span className="flex items-center gap-2.5 font-display text-xl text-[var(--gold)] [text-shadow:0_1px_0_#000]">
      <span className="slot h-8 w-8">
        <Swords size={16} />
      </span>
      havocish
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
        <button onClick={() => signIn("discord", { callbackUrl: afterSignIn() })} className={`${primaryButton} px-3 py-1.5 text-sm`}>
          Sign in with Discord
        </button>
      )}
    </header>
  );
}

// Chat channel and item quality colours, muted to sit with the rest of the page.
const SYSTEM = "text-[#d6c77a]";
const GUILD = "text-[#8fc27a]";
const DUEL = "text-[#d19a5b]";
const UNCOMMON = "text-[#7fb86a]";
const RARE = "text-[#6c95d0]";
const EPIC = "text-[#a584cc]";
const NAMED = "text-[var(--gold)]";

/** Each line is [text, colour?] runs; the line's own colour covers uncoloured runs. */
const FEED: Array<{ tone: string; parts: Array<[string, string?]> }> = [
  { tone: SYSTEM, parts: [["Aria has reached level 12!"]] },
  { tone: GUILD, parts: [["[Guild] Brakka: anyone up for a dungeon run?"]] },
  { tone: "", parts: [["Tovin receives loot: "], ["[Ironbark Maul]", RARE], ["."]] },
  { tone: SYSTEM, parts: [["Mirelle has earned the achievement "], ["[Chatterbox]", NAMED], ["!"]] },
  { tone: DUEL, parts: [["Osric has defeated Brakka in a duel. 50 gold changes hands."]] },
  { tone: SYSTEM, parts: [["Quest complete: "], ["[Daily: Say Something]", NAMED], [". +120 XP"]] },
  { tone: "", parts: [["Wren buys "], ["[Minor Healing Draught]", UNCOMMON], [" for 25 gold."]] },
  { tone: GUILD, parts: [["[Guild] Aria: day 7 of the streak, not breaking it now"]] },
  { tone: "", parts: [["Brakka trades "], ["[Cloak of the Wandering Fox]", EPIC], [" to Wren."]] },
  { tone: SYSTEM, parts: [["Tovin has reached level 20 and is now a Veteran!"]] },
];

const VISIBLE_LINES = 9;

/**
 * An MMO chat frame with server life scrolling past -- levels, loot, duels,
 * quests and trades. Decorative: the feature list below says the same in words.
 */
function WorldFeed() {
  // Starts at a fixed offset so the server render and the first client render agree.
  const [start, setStart] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setStart((s) => s + 1), 2400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="frame mx-auto w-full max-w-md text-left">
      <div className="flex items-end gap-1 border-b border-[var(--border)] px-3 pt-2">
        {["General", "Guild", "Loot"].map((tab, i) => (
          <span
            key={tab}
            className={`rounded-t-sm border border-b-0 px-2.5 py-1 font-display text-xs ${
              i === 0
                ? "border-[var(--border-bright)] bg-black/40 text-[var(--gold)]"
                : "border-transparent text-[var(--muted)]"
            }`}
          >
            {tab}
          </span>
        ))}
        <span className="ml-auto pb-1.5 text-[11px] text-[var(--muted)]">Tavern of Legends</span>
      </div>

      <ul
        aria-hidden
        className="flex h-56 flex-col justify-end overflow-hidden bg-black/35 px-3 py-2 text-[13px] leading-6 [text-shadow:0_1px_0_#000]"
      >
        {Array.from({ length: VISIBLE_LINES }, (_, i) => start + i).map((n) => {
          const line = FEED[n % FEED.length];
          return (
            // Keyed by position in the endless stream, so only the newest line mounts and animates.
            <li key={n} className={`feed-line ${line.tone}`}>
              {line.parts.map(([text, colour], j) => (
                <span key={j} className={colour}>
                  {text}
                </span>
              ))}
            </li>
          );
        })}
      </ul>
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
            <span className="font-display text-sm uppercase tracking-[0.2em] text-[var(--accent)]">
              Level up your community
            </span>
            <h1 className="mt-4 text-4xl leading-tight sm:text-6xl">
              Turn your Discord server into an{" "}
              {/* A muted legendary orange. */}
              <span className="text-[#d0894a]">RPG</span>
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-[var(--muted)]">
              havocish gives your members levels to climb, gold to earn and spend, gear to
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
                onClick={() => (session ? (window.location.href = "/dashboard") : signIn("discord", { callbackUrl: afterSignIn() }))}
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

          <WorldFeed />
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <h2 className="mb-6 text-center text-sm uppercase tracking-[0.2em] text-[var(--accent)]">
            Everything a campaign needs
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="frame group p-5 transition-colors hover:border-[var(--accent)]"
              >
                <span className="slot h-9 w-9 transition-colors group-hover:text-[var(--gold)]">
                  <f.icon size={18} />
                </span>
                <h3 className="mt-3 text-lg">{f.title}</h3>
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
