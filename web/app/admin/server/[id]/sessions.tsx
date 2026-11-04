"use client";

import { When } from "../../when";

export type Click = { at: string; who: string; role: string | null; text: string; failed: boolean; slow: number | null };

/** A new session starts after half an hour with no clicks. */
const GAP = 30 * 60_000;

/**
 * Every command, button, menu and form, newest first, in sessions: runs of use with no half-hour gap.
 * The same person doing the same thing again right away shows once, with a count.
 */
export function Sessions({ clicks }: { clicks: Click[] }) {
  const sessions: Click[][] = [];
  for (const c of clicks) {
    const last = sessions.at(-1);
    if (last && new Date(last.at(-1)!.at).getTime() - new Date(c.at).getTime() < GAP) last.push(c);
    else sessions.push([c]);
  }

  return (
    <div className="mt-2 space-y-2">
      {sessions.map((s, k) => {
        const people = new Set(s.map((c) => c.who)).size, failed = s.filter((c) => c.failed).length;
        // Repeats in a row (same person, same thing) fold into one line with a count.
        const rows: Array<Click & { times: number }> = [];
        for (const c of s) {
          const prev = rows.at(-1);
          if (prev && prev.who === c.who && prev.text === c.text && !c.failed) prev.times++;
          else rows.push({ ...c, times: 1 });
        }
        return (
          <details key={k} open={k === 0} className="frame px-3 py-2 text-sm">
            <summary className="cursor-pointer">
              <When at={s.at(-1)!.at} /> → <When at={s[0]!.at} clock />
              <span className="text-[var(--muted)]"> · {s.length} action{s.length === 1 ? "" : "s"} · {people} {people === 1 ? "person" : "people"}{failed ? ` · ${failed} failed` : ""}</span>
            </summary>
            <ul className="mt-2 space-y-0.5">
              {rows.map((c, j) => (
                <li key={j} className={c.failed ? "text-red-300" : ""}>
                  <span className="inline-block w-20 text-[var(--muted)]"><When at={c.at} clock /></span>
                  <span className="inline-block w-24 font-mono text-[var(--muted)]">{c.who}{c.role ? ` ${c.role}` : ""}</span>
                  {c.text}
                  {c.times > 1 && <span className="text-[var(--muted)]"> ×{c.times}</span>}
                  {c.failed && " · failed"}
                  {c.slow && <span className="text-[var(--muted)]"> · slow ({c.slow}s)</span>}
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
