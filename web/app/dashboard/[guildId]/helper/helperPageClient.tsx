"use client";

import { useEffect, useRef, useState } from "react";
import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import { Markdown } from "@/app/components/ui/markdown";
import { applyChanges, valueAt, type Change } from "@content/helper";
import type { GuildConfigJson } from "@content/packs";
import type { DashboardConfig } from "@/app/lib/dashboardConfig";

type Proposal = { summary: string; changes: Change[] };
type Entry = { role: "user" | "assistant"; content: string; proposal?: Proposal | null; applied?: boolean };

const EXAMPLES = [
  "What should I set up first?",
  "Is anything broken in my setup?",
  "Give the Veteran role at Combat level 20",
  "Make fights happen in threads in my general chat",
];

/** A value shown short: one line, cut off when long. */
function short(v: unknown) {
  if (v === undefined) return "(nothing)";
  if (v === null) return "(removed)";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
}

/** Where an edit lands, in words: entries by their name ("Combat › Deep Vein › channel ids"), keys spaced out. */
function where(config: GuildConfigJson | null, path: string[]) {
  return path.map((key, i) => {
    const at = valueAt(config, path.slice(0, i + 1)) as { name?: unknown } | undefined;
    if (typeof at?.name === "string") return at.name;
    return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").replace(/^./, (ch) => ch.toUpperCase());
  }).join(" › ");
}

/** What gets sent back as history: the reply, plus what happened to its proposal. */
function asMessage(e: Entry) {
  const note = e.proposal ? `[Proposed: ${e.proposal.summary || "changes"}. ${e.applied ? "The owner applied them." : "Not applied yet."}]` : "";
  return { role: e.role, content: [e.content, note].filter(Boolean).join("\n\n") || "…" };
}

export default function HelperPageClient({ guildId }: { guildId: string }) {
  const { config, saving, error: saveError, save } = useGuildConfig(guildId);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [entries, busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next: Entry[] = [...entries, { role: "user", content }];
    setEntries(next);
    setInput("");
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/discord/guilds/${guildId}/helper`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: next.map(asMessage) }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setBusy(false);
    if (!res?.ok || !data) {
      setError(data?.message ?? "The helper couldn't answer just now. Try again.");
      setEntries(entries);
      setInput(content);
      return;
    }
    setEntries([...next, { role: "assistant", content: data.reply || data.proposal?.summary || "", proposal: data.proposal }]);
  }

  async function apply(i: number) {
    const p = entries[i]?.proposal;
    if (!p || !config) return;
    const ok = await save(applyChanges(config as GuildConfigJson, p.changes) as unknown as DashboardConfig);
    if (ok) setEntries((all) => all.map((e, j) => (j === i ? { ...e, applied: true } : e)));
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="border-b border-[var(--border)] pb-4">
        <h1 className="text-2xl">Helper</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Ask about your setup in plain words, or ask for a change: &ldquo;put fights in #arena&rdquo;, &ldquo;why can&apos;t
          anyone reach the Deep Vein?&rdquo;. It sees your settings, channels and roles. Changes are shown to you first and
          only saved when you press Apply.
        </p>
      </header>

      {entries.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((x) => (
            <button key={x} type="button" onClick={() => send(x)} className="rounded-sm border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
              {x}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {entries.map((e, i) =>
          e.role === "user" ? (
            <p key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-sm border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm">
              {e.content}
            </p>
          ) : (
            <div key={i} className="frame space-y-3 p-4 text-sm">
              {e.content && <div className="leading-relaxed"><Markdown text={e.content} /></div>}
              {e.proposal && (
                <div className="space-y-2 border-t border-[var(--border)] pt-3">
                  <ul className="space-y-1.5">
                    {e.proposal.changes.map((c, j) => (
                      <li key={j} className="flex gap-2.5">
                        <span className="text-[var(--accent)]">◆</span>
                        <span>{c.label ?? where(config as GuildConfigJson, c.path)}</span>
                      </li>
                    ))}
                  </ul>
                  {/* The exact edits, for anyone who wants to check the words against them. */}
                  <details className="text-xs text-[var(--muted)]">
                    <summary className="cursor-pointer select-none">Exact changes</summary>
                    <ul className="mt-2 space-y-1.5 font-mono">
                      {e.proposal.changes.map((c, j) => (
                        <li key={j}>
                          <span className="text-[var(--accent)]">{where(config as GuildConfigJson, c.path)}</span>
                          <br />
                          <span className="line-through">{short(valueAt(config as GuildConfigJson, c.path))}</span>
                          {" → "}
                          <span className="text-[var(--foreground)]">{short(c.value)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                  <div className="flex items-center justify-end gap-3">
                    {e.applied ? (
                      <span className="text-xs text-[var(--muted)]">Applied</span>
                    ) : (
                      <button className="btn px-4 py-1.5 text-sm" disabled={saving || !config} onClick={() => apply(i)}>
                        {saving ? "Saving…" : "Apply"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ),
        )}
        {busy && <p className="text-sm text-[var(--muted)]">Thinking…</p>}
        {(error || saveError) && <p className="text-sm text-red-300">{error ?? saveError}</p>}
        <div ref={end} />
      </div>

      <form
        className="sticky bottom-4 flex gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(ev) => setInput(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" && !ev.shiftKey) {
              ev.preventDefault();
              send(input);
            }
          }}
          maxLength={4000}
          rows={2}
          placeholder="Ask the helper…"
          className="min-w-0 flex-1 rounded-sm border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        />
        <button className="btn shrink-0 px-4 text-sm" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </main>
  );
}
