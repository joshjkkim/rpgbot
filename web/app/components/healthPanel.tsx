"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Issue = { severity: "error" | "warning"; message: string; page: string };
type Report = { inGuild: false } | { inGuild: true; issues: Issue[] };

/**
 * Problems in the server's setup that will fail quietly: channels havocish
 * can't post in, roles it can't give, features on with nothing in them. The
 * bot works them out (see the health route); this lists them with a link to
 * the page that fixes each. Says nothing when the check can't run.
 */
export default function HealthPanel({ guildId }: { guildId: string }) {
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    fetch(`/api/discord/guilds/${guildId}/health`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setReport)
      .catch(() => null);
  }, [guildId]);

  if (!report) return null;

  if (!report.inGuild) {
    return (
      <section className="frame border-red-900/60 p-4 text-sm">
        <p className="text-red-300">havocish isn&apos;t in this server right now, so nothing here will run until it&apos;s added back.</p>
      </section>
    );
  }

  if (report.issues.length === 0) {
    return (
      <section className="frame p-4 text-sm text-[#8fbf72]">
        ✓ Everything is set up correctly. havocish can post and give roles everywhere it needs to.
      </section>
    );
  }

  const errors = report.issues.filter((i) => i.severity === "error").length;
  return (
    <section className="frame p-4">
      <h2 className="font-display text-[15px]">
        {errors ? `${errors} thing${errors === 1 ? "" : "s"} won't work` : "Worth a look"}
        <span className="ml-2 font-sans text-xs text-[var(--muted)]">
          {report.issues.length} issue{report.issues.length === 1 ? "" : "s"} found
        </span>
      </h2>
      <ul className="mt-3 space-y-2">
        {report.issues.map((issue, i) => (
          <li key={i} className="flex items-start gap-3 text-sm">
            <span aria-hidden className={issue.severity === "error" ? "text-red-400" : "text-amber-400"}>
              {issue.severity === "error" ? "✖" : "⚠"}
            </span>
            <span className="flex-1">{issue.message}</span>
            <Link
              href={`/dashboard/${guildId}/${issue.page}`}
              className="shrink-0 text-xs text-[var(--accent)] hover:underline"
            >
              Fix →
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
