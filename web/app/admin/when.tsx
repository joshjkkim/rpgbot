"use client";

import { ago } from "./describe";

/**
 * A time in the viewer's own timezone: "Nov 4, 9:42 PM · 1h ago", or just the clock with `clock`.
 * The server renders it in its own timezone first, so the text may change once the page loads.
 */
export function When({ at, clock = false }: { at: string | Date; clock?: boolean }) {
  const d = new Date(at);
  const text = clock
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : `${d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · ${ago(d)}`;
  return <time dateTime={d.toISOString()} title={d.toString()} suppressHydrationWarning>{text}</time>;
}
