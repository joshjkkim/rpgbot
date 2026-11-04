import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin } from "@/app/lib/admin";
import { dbQuery } from "@/app/lib/db";
import { costOf, DAILY_BUDGET, spentToday } from "@/app/lib/aiUsage";
import { ago } from "./describe";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

/*
 * havocish's own admin page: how many servers come, set up, play and leave,
 * every server newest first with what it did this week, and the latest
 * joins, leaves and setup changes across all of them. Each server's own
 * page has the detail (and its AI limits). Only ADMIN_USER_IDS can open it;
 * anyone else gets a 404.
 */

type Row = { id: string; name: string | null; created_at: string; removed_at: string | null; recent: boolean; set_up: boolean; players: string; active: string; last: string | null };

const LOG_WORDS: Record<string, string> = { joined: "added havocish", left: "removed havocish", rejoined: "added havocish back" };

export default async function AdminPage() {
  if (!(await isAdmin())) notFound();

  const [servers, usage, spent, commands, play, feed] = await Promise.all([
    // ponytail: every server on one page; a search box once there are a few hundred.
    // "Set up" is the bot's needsSetup turned around: combat on, or at least 3 enemies.
    dbQuery<Row>(`
      SELECT g.discord_guild_id::text AS id, g.name, g.created_at, g.removed_at, g.created_at > NOW() - INTERVAL '7 days' AS recent,
             ((g.config->'combat'->>'enabled')::boolean IS TRUE
               OR (CASE WHEN jsonb_typeof(g.config->'combat'->'enemies') = 'object'
                        THEN (SELECT count(*) FROM jsonb_object_keys(g.config->'combat'->'enemies')) ELSE 0 END) >= 3) AS set_up,
             (SELECT count(*) FROM user_guild_profiles p WHERE p.guild_id = g.id) AS players,
             (SELECT count(*) FROM user_guild_profiles p WHERE p.guild_id = g.id AND p.updated_at > NOW() - INTERVAL '7 days') AS active,
             (SELECT max(p.updated_at) FROM user_guild_profiles p WHERE p.guild_id = g.id) AS last
      FROM guilds g ORDER BY g.created_at DESC`),
    dbQuery<{ id: string; model: string; input: string; output: string }>(`
      SELECT discord_guild_id::text AS id, model, sum(input_tokens) AS input, sum(output_tokens) AS output
      FROM ai_usage WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY 1, 2`),
    spentToday(),
    dbQuery<{ id: string; n: string }>(`
      SELECT discord_guild_id::text AS id, sum(uses) AS n FROM command_uses WHERE day > CURRENT_DATE - 7 GROUP BY 1`).catch(() => null),
    dbQuery<{ id: string; fights: string; gathers: string; crafts: string }>(`
      SELECT discord_guild_id::text AS id,
             count(*) FILTER (WHERE event_type = 'fight') AS fights,
             count(*) FILTER (WHERE event_type = 'gather') AS gathers,
             count(*) FILTER (WHERE event_type IN ('craft', 'upgrade')) AS crafts
      FROM events WHERE "timestamp" > NOW() - INTERVAL '7 days' AND category IN ('combat', 'gathering', 'crafting') GROUP BY 1`),
    // Null until migration 012 is live. Setup saves are grouped by the hour, so a session of edits is one line.
    dbQuery<{ id: string; what: string; saves: string | null; at: string }>(`
      SELECT discord_guild_id::text AS id, event AS what, NULL AS saves, at FROM guild_log WHERE at > NOW() - INTERVAL '14 days'
      UNION ALL
      SELECT discord_guild_id::text, 'setup', count(*)::text, max(at) FROM config_history
      WHERE at > NOW() - INTERVAL '14 days' GROUP BY discord_guild_id, date_trunc('hour', at)
      ORDER BY at DESC LIMIT 40`).catch(() => null),
  ]);

  const cost = new Map<string, number>();
  for (const u of usage.rows) cost.set(u.id, (cost.get(u.id) ?? 0) + costOf(u.model, Number(u.input), Number(u.output)));
  const month = [...cost.values()].reduce((a, b) => a + b, 0);
  const dollars = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;
  const cmds = new Map(commands?.rows.map((r) => [r.id, Number(r.n)]));
  const plays = new Map(play.rows.map((r) => [r.id, r]));
  const names = new Map(servers.rows.map((r) => [r.id, r.name ?? "Unnamed server"]));

  const rows = servers.rows;
  const live = rows.filter((r) => !r.removed_at);
  const funnel: Array<[string, number]> = [
    ["servers have havocish", live.length],
    ["added it this week", rows.filter((r) => r.recent).length],
    ["of those live are set up", live.filter((r) => r.set_up).length],
    ["had players this week", live.filter((r) => Number(r.active) > 0).length],
    ["removed it", rows.length - live.length],
  ];

  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-8 px-6 py-12">
      <div>
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <Link href="/admin/daily" className="text-sm underline">Daily →</Link>
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">
          AI today: {spent === null ? "no usage table yet" : `${dollars(spent)} of ${dollars(DAILY_BUDGET)}`} · last 30 days: {dollars(month)}
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {funnel.map(([label, n]) => (
          <div key={label} className="frame px-3 py-2">
            <div className="text-2xl font-semibold tabular-nums">{n}</div>
            <div className="text-xs text-[var(--muted)]">{label}</div>
          </div>
        ))}
      </section>

      <section>
        <h2 className="font-semibold">Servers <span className="font-normal text-[var(--muted)]">newest first · counts are the last 7 days</span></h2>
        <div className="frame mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2 font-normal">Server</th>
                <th className="px-3 py-2 font-normal">Added</th>
                <th className="px-3 py-2 font-normal">Status</th>
                <th className="px-3 py-2 font-normal">Players: active · all</th>
                <th className="px-3 py-2 font-normal">Commands</th>
                <th className="px-3 py-2 font-normal">Fights · gathers · crafts</th>
                <th className="px-3 py-2 font-normal">Last active</th>
                <th className="px-3 py-2 font-normal">AI, 30 days</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = plays.get(r.id);
                return (
                  <tr key={r.id} className={`border-t border-[var(--border)] ${r.removed_at ? "text-[var(--muted)]" : ""}`}>
                    <td className="px-3 py-2">
                      <Link href={`/admin/server/${r.id}`} className="underline-offset-2 hover:underline">{r.name ?? "Unnamed server"}</Link>
                      <div className="font-mono text-xs text-[var(--muted)]">{r.id}</div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{ago(r.created_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.removed_at ? `removed ${ago(r.removed_at)}` : r.set_up ? "set up" : <span className="text-[var(--gold)]">not set up</span>}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{r.active} · {r.players}</td>
                    <td className="px-3 py-2 tabular-nums">{cmds.get(r.id) ?? (commands ? 0 : "–")}</td>
                    <td className="px-3 py-2 tabular-nums">{p ? `${p.fights} · ${p.gathers} · ${p.crafts}` : "–"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.last ? ago(r.last) : "–"}</td>
                    <td className="px-3 py-2 tabular-nums">{cost.has(r.id) ? dollars(cost.get(r.id)!) : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-semibold">Lately <span className="font-normal text-[var(--muted)]">last 14 days</span></h2>
        {feed === null ? <p className="mt-2 text-sm text-[var(--muted)]">Not recorded yet: needs migration 012.</p>
          : !feed.rows.length ? <p className="mt-2 text-sm text-[var(--muted)]">Nothing yet.</p>
          : (
            <ul className="mt-2 space-y-1 text-sm">
              {feed.rows.map((f, k) => (
                <li key={k}>
                  <span className="inline-block w-20 text-[var(--muted)]">{ago(f.at)}</span>
                  <Link href={`/admin/server/${f.id}`} className="underline-offset-2 hover:underline">{names.get(f.id) ?? f.id}</Link>{" "}
                  {f.what === "setup" ? `changed their setup${Number(f.saves) > 1 ? ` (${f.saves} saves)` : ""}` : LOG_WORDS[f.what] ?? f.what}
                </li>
              ))}
            </ul>
          )}
      </section>
    </main>
  );
}
