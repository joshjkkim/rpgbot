"use client";

import { useEffect, useState } from "react";

interface LogEvent {
  id: number;
  guild_id: number;
  discord_guild_id: string;
  user_id: number;
  target_user_id?: number | null;
  category: string;
  event_type: string;
  source?: string | null;
  xp_delta?: number | null;
  gold_delta?: number | null;
  streak_delta?: number | null;
  level_delta?: number | null;
  item_id?: string | null;
  quantity?: number | null;
  old_level?: number | null;
  new_level?: number | null;
  old_streak?: number | null;
  new_streak?: number | null;
  metadata?: Record<string, unknown> | null;
  timestamp: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  economy: "bg-yellow-100 text-black",
  xp: "bg-blue-200 text-black",
  daily: "bg-green-100 text-black",
  streak: "bg-orange-100 text-black",
  level: "bg-purple-100 text-black",
  config: "bg-zinc-700 text-zinc-100",
  inventory: "bg-pink-100 text-black",
  admin: "bg-red-100 text-black",
  quests: "bg-teal-100 text-black",
};

function Delta({ label, value }: { label: string; value: number }) {
  return (
    <span className="text-xs font-medium">
      {label}: {value >= 0 ? "+" : ""}{value}
    </span>
  );
}

function LogRow({ log }: { log: LogEvent }) {
  const [expanded, setExpanded] = useState(false);
  const categoryColor = CATEGORY_COLORS[log.category] ?? "bg-zinc-700 text-zinc-200";
    console.log(categoryColor)

  return (
    <div className="p-3 text-sm space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${categoryColor}`}>
            {log.category}
          </span>
          <span className="inline-block rounded bg-[var(--border)] px-2 py-0.5 text-xs font-medium text-[var(--muted)]">
            {log.event_type}
          </span>
          {log.source && (
            <span className="text-xs text-[var(--muted)]">via <span className="font-mono">{log.source}</span></span>
          )}
        </div>
        <span className="shrink-0 text-xs text-[var(--muted)]">
          {new Date(log.timestamp).toLocaleString()}
        </span>
      </div>

      {/* Users */}
    <div className="flex items-center gap-1 text-xs text-[var(--muted)]">
      <span>
        User:{" "}
        {log.metadata?.actorDiscordId ? (
        <span className="font-mono text-zinc-700">
          @{log.metadata.actorDiscordId as string}
        </span>
        ) : (
        <span className="font-mono text-zinc-700">{log.user_id}</span>
        )}
      </span>
      {log.target_user_id != null && (
        <span>
        →{" "}
        {log.metadata?.targetDiscordId ? (
          <span className="font-mono text-zinc-700">
            @{log.metadata.targetDiscordId as string}
          </span>
        ) : (
          <span className="font-mono text-zinc-700">{log.target_user_id}</span>
        )}
        </span>
      )}
    </div>

      {/* Deltas */}
      <div className="flex flex-wrap gap-2">
        {log.xp_delta != null && <Delta label="XP" value={log.xp_delta} />}
        {log.gold_delta != null && <Delta label="Gold" value={log.gold_delta} />}
        {log.streak_delta != null && <Delta label="Streak" value={log.streak_delta} />}
        {log.level_delta != null && <Delta label="Level" value={log.level_delta} />}
      </div>

      {/* Level / Streak transitions */}
      <div className="flex flex-wrap gap-3 text-xs text-[var(--muted)]">
        {log.old_level != null && log.new_level != null && (
          <span>Level: <span className="font-mono">{log.old_level}</span> → <span className="font-mono">{log.new_level}</span></span>
        )}
        {log.old_streak != null && log.new_streak != null && (
          <span>Streak: <span className="font-mono">{log.old_streak}</span> → <span className="font-mono">{log.new_streak}</span></span>
        )}
      </div>

      {/* Item */}
      {log.item_id && (
        <div className="text-xs text-[var(--muted)]">
          Item: <span className="font-mono text-zinc-700">{log.item_id}</span>
          {log.quantity != null && <span className="ml-1">x{log.quantity}</span>}
        </div>
      )}

      {/* Metadata */}
      {log.metadata && (
        <div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] hover:underline"
          >
            {expanded ? "Hide" : "Show"} metadata
          </button>
          {expanded && (
            <pre className="mt-1 rounded border border-[var(--border)] bg-[var(--background)] p-2 text-xs whitespace-pre-wrap break-all">
              {JSON.stringify(log.metadata, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export default function LogsPageClient({ guildId }: { guildId: string }) {
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLogs() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/discord/guilds/${guildId}/logs`);
        if (!res.ok) throw new Error(`Failed to fetch logs: ${res.status}`);
        const data = await res.json();
        setLogs(data.logs ?? []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchLogs();
  }, [guildId]);

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold">Logs</h1>

      {loading && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">Loading…</div>
      )}
      {error && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>
      )}
      {!loading && logs.length === 0 && !error && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">No logs found.</div>
      )}

      {logs.length > 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
          {logs.map((log) => (
            <LogRow key={log.id} log={log} />
          ))}
        </div>
      )}
    </main>
  );
}