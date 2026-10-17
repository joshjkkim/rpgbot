"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { inviteUrl } from "./lib/invite";
import { FIREFLIES, SCENE, STARS, WINDOWS } from "./scene";
import { FLAME_FRAMES, type SpriteName } from "./sprites";
import { Pixels, Sprite } from "./components/ui/sprite";

// Real output from the bot's renderers, shown at the size Discord shows them (`show`, in px).
const SHOWCASE = [
  {
    src: "/showcase/profile.png", w: 1100, h: 420, show: 560,
    title: "Every member gets a character",
    body: "/profile draws a card with their level, gold and streak, in your server's colours and currency names.",
  },
  {
    src: "/showcase/levelup.png", w: 1120, h: 280, show: 560,
    title: "Level-ups people notice",
    body: "Chatting, voice, fights and quests all give XP. Each level-up posts a banner, and can hand out a role.",
  },
  {
    src: "/showcase/item.png", w: 840, h: 432, show: 360,
    title: "Gear you design",
    body: "Stock the shop with your own weapons, armour and potions. Members buy, equip, trade and sell them.",
  },
];

const ALSO: Array<[SpriteName, string]> = [
  ["skull", "Turn-based fights against enemies you write"],
  ["swords", "Duels between members, with gold on the line"],
  ["scroll", "Quests and achievements with custom rewards"],
  ["coin", "Daily rewards with streak bonuses"],
  ["chest", "Trading and gifting between players"],
  ["potion", "Per-channel and per-role XP rates"],
];

// The campfire scene's size and where its fire sits, matching public/campfire.png.
const CAMP = { w: 320, h: 90, fireX: 160, ground: 70 };

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
      {/* eslint-disable-next-line @next/next/no-img-element -- a 64px pixel-art PNG */}
      <img src="/logo.png" alt="" width={32} height={32} className="[image-rendering:pixelated]" />
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

export default function Home() {
  const { data: session } = useSession();
  const invite = inviteUrl();

  return (
    // The page is the ground below the hero's cliff: it starts at the scene's foreground
    // colour and darkens to the campfire's ground, so scrolling reads as one landscape.
    <div className="min-h-screen flex flex-col bg-[linear-gradient(#0f0b0e,#0a0807)]">
      <Header />

      <main className="flex-1">
        <section className="relative isolate overflow-hidden">
          {/* Pixel-art dusk scene, drawn at 400x150 and scaled up without smoothing. The SVG
              crops like object-cover, so the animated pixels stay on their spots in the art. */}
          <svg
            viewBox={`0 0 ${SCENE.w} ${SCENE.h}`} preserveAspectRatio="xMidYMax slice" aria-hidden
            className="absolute inset-0 -z-10 h-full w-full"
          >
            <image href="/scene.png" width={SCENE.w} height={SCENE.h} style={{ imageRendering: "pixelated" }} />
            {STARS.map(([x, y], i) => (
              <rect key={`s${i}`} x={x} y={y} width={1} height={1} fill="#e9dcb4" className="scene-twinkle"
                style={{ animationDelay: `${(i * 1.3) % 5}s`, animationDuration: `${3 + (i % 4)}s` }} />
            ))}
            {WINDOWS.map(([x, y], i) => (
              <rect key={`w${i}`} x={x} y={y} width={1} height={1} fill="#e0a84a" className="scene-flicker"
                style={{ animationDelay: `${i * 0.7}s` }} />
            ))}
            {FIREFLIES.map(([x, y], i) => (
              <rect key={`f${i}`} x={x} y={y} width={1} height={1} fill={i % 2 ? "#7a5a2c" : "#c99a4a"} className="scene-firefly"
                style={{ animationDelay: `${(i * 0.9) % 7}s`, animationDuration: `${6 + (i % 3)}s` }} />
            ))}
            <g transform="rotate(14 60 8)">
              <rect x={60} y={8} width={6} height={1} fill="#efe3bd" className="scene-shooting" />
            </g>
          </svg>

          <div className="mx-auto max-w-3xl px-6 pt-16 pb-56 text-center sm:pt-24 sm:pb-72">
            <h1 className="text-4xl leading-tight sm:text-6xl">
              Turn your Discord server into an RPG
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-[var(--foreground)]/80 [text-shadow:0_1px_2px_#000]">
              Your members level up by chatting, earn gold, fight enemies and collect gear.
              You set it all up from a dashboard.
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
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
        </section>

        <section className="mx-auto max-w-5xl space-y-16 px-6 pt-8 pb-20">
          {SHOWCASE.map((f, i) => (
            <div key={f.src} className="grid items-center gap-6 md:grid-cols-2 md:gap-10">
              {/* eslint-disable-next-line @next/next/no-img-element -- static PNGs, nothing to optimise */}
              <img
                src={f.src} width={f.w} height={f.h} alt={f.title} loading="lazy"
                style={{ maxWidth: f.show }}
                className={`mx-auto h-auto w-full ${i % 2 ? "md:order-2" : ""}`}
              />
              <div>
                <h2 className="text-2xl">{f.title}</h2>
                <p className="mt-2 leading-relaxed text-[var(--muted)]">{f.body}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-16">
          <h2 className="text-2xl">Also in the box</h2>
          <ul className="mt-6 grid gap-x-10 gap-y-4 text-[var(--muted)] sm:grid-cols-2">
            {ALSO.map(([sprite, line]) => (
              <li key={line} className="flex items-center gap-4">
                <Sprite name={sprite} />
                {line}
              </li>
            ))}
          </ul>
        </section>

        {/* The page ends at a campfire, answering the castle at the top. */}
        <section className="relative isolate overflow-hidden">
          <svg
            viewBox={`0 0 ${CAMP.w} ${CAMP.h}`} preserveAspectRatio="xMidYMax slice" aria-hidden
            className="absolute inset-0 -z-10 h-full w-full"
          >
            <image href="/campfire.png" width={CAMP.w} height={CAMP.h} style={{ imageRendering: "pixelated" }} />
            {FLAME_FRAMES.map((grid, i) => (
              <g key={i} className="scene-flame" style={{ animationDelay: `${(i * 0.45).toFixed(2)}s` }}>
                <Pixels grid={grid} x={CAMP.fireX - 3} y={CAMP.ground - 12} />
              </g>
            ))}
            {[0, 1, 2, 3, 4].map((i) => (
              <rect key={i} x={CAMP.fireX - 2 + ((i * 3) % 5)} y={CAMP.ground - 13} width={1} height={1}
                fill={i % 2 ? "#d9a441" : "#9a3b2c"} className="scene-ember"
                style={{ animationDelay: `${i * 0.6}s` }} />
            ))}
          </svg>

          <div className="mx-auto max-w-2xl px-6 pt-10 pb-56 text-center sm:pb-72">
            <h2 className="text-3xl sm:text-4xl">Gather your party</h2>
            <p className="mt-3 text-[var(--muted)]">Free to add. Set up in a few minutes.</p>
            <div className="mt-7 flex justify-center">
              {invite ? (
                <a href={invite} target="_blank" rel="noreferrer" className={`${primaryButton} px-5 py-2.5`}>
                  Add to Server
                </a>
              ) : (
                <button
                  onClick={() => (session ? (window.location.href = "/dashboard") : signIn("discord", { callbackUrl: afterSignIn() }))}
                  className={`${primaryButton} px-5 py-2.5`}
                >
                  {session ? "Open dashboard" : "Sign in with Discord"}
                </button>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] px-6 py-6 text-center text-sm text-[var(--muted)]">
        Configure everything from the dashboard, or with <code className="font-mono">/config-*</code>{" "}
        commands in Discord.
        <div className="mt-3">
          <a href="/legal/terms" className="hover:text-[var(--accent)]">Terms of Service</a>
          {" · "}
          <a href="/legal/privacy" className="hover:text-[var(--accent)]">Privacy Policy</a>
          {" · "}
          <a href="/changelog" className="hover:text-[var(--accent)]">Changelog</a>
          {" · "}
          <a href="https://discord.gg/9dV5NnV9tq" target="_blank" rel="noreferrer" className="hover:text-[var(--accent)]">Support server</a>
        </div>
      </footer>
    </div>
  );
}
