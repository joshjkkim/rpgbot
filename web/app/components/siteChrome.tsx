"use client";

import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

/** The public site's header and footer, shared by the home and features pages. */

const primaryButton = "btn";
const ghostButton = "btn btn-stone";

/** Where to go after signing in: a same-site ?callbackUrl path, else the dashboard. */
export function afterSignIn() {
  const next = new URLSearchParams(window.location.search).get("callbackUrl");
  return next && /^\/(?![/\\])/.test(next) ? next : "/dashboard";
}

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 font-display text-xl text-[var(--gold)] [text-shadow:0_1px_0_#000]">
      {/* eslint-disable-next-line @next/next/no-img-element -- a 64px pixel-art PNG */}
      <img src="/logo.png" alt="" width={32} height={32} className="[image-rendering:pixelated]" />
      havocish
    </Link>
  );
}

export function SiteHeader() {
  const { data: session } = useSession();
  const router = useRouter();

  return (
    <header className="flex items-center justify-between gap-4 px-6 py-4">
      <div className="flex items-center gap-6">
        <Wordmark />
        <Link href="/features" className="hidden text-sm text-[var(--muted)] hover:text-[var(--accent)] sm:inline">
          Features
        </Link>
        <Link href="/docs" className="hidden text-sm text-[var(--muted)] hover:text-[var(--accent)] sm:inline">
          Docs
        </Link>
      </div>

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

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] px-6 py-6 text-center text-sm text-[var(--muted)]">
      Set everything up from the dashboard. In Discord, <code className="font-mono">/config</code> switches
      features on and off.
      <div className="mt-3">
        <a href="/features" className="hover:text-[var(--accent)]">Features</a>
        {" · "}
        <a href="/docs" className="hover:text-[var(--accent)]">Docs</a>
        {" · "}
        <a href="/changelog" className="hover:text-[var(--accent)]">Changelog</a>
        {" · "}
        <a href="/legal/terms" className="hover:text-[var(--accent)]">Terms of Service</a>
        {" · "}
        <a href="/legal/privacy" className="hover:text-[var(--accent)]">Privacy Policy</a>
        {" · "}
        <a href="https://discord.gg/9dV5NnV9tq" target="_blank" rel="noreferrer" className="hover:text-[var(--accent)]">Support server</a>
      </div>
    </footer>
  );
}
