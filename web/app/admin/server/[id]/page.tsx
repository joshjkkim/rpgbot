import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin } from "@/app/lib/admin";
import { dbQuery } from "@/app/lib/db";
import { fetchHealth } from "@/app/lib/health";

export const metadata: Metadata = { title: "Admin · server", robots: { index: false } };
export const dynamic = "force-dynamic";

/*
 * One server, for havocish's admin: what they set up, how many people play,
 * which commands they use (command_uses, from migration 010) and what the
 * events log says happened. Counts only; no player names.
 */

const STATS = ["messagesSent", "fightsWon", "fightsLost", "enemiesDefeated", "itemsPurchased", "dailiesClaimed"] as const;

function ago(when: string | Date | null): string {
  if (!when) return "never";
  const mins = Math.round((Date.now() - new Date(when).getTime()) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 48) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

/** The parts of a server's config this page counts (GuildConfig, loosely: old servers may lack any of it). */
type Config = {
  combat?: { enabled?: boolean; enemies?: object };
  shop?: { items?: object };
  gathering?: { activities?: object };
  crafting?: { stations?: object };
  quests?: { enabled?: boolean; quests?: object };
  achievements?: { enabled?: boolean; achievements?: object };
  characters?: { list?: object };
};

const count = (o: unknown) => (o && typeof o === "object" ? Object.keys(o).length : 0);

export default async function ServerPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) notFound();
  const { id } = await params;
  if (!/^\d{5,20}$/.test(id)) notFound();

  const guild = (await dbQuery<{ id: string; name: string | null; created_at: string; removed_at: string | null; config: Config | null }>(
    `SELECT id::text, name, created_at, removed_at, config FROM guilds WHERE discord_guild_id = $1`, [id])).rows[0];
  if (!guild) notFound();

  const [players, events, recent, perDay, commands, health] = await Promise.all([
    dbQuery<Record<string, string | null>>(`
      SELECT count(*) AS players,
             count(*) FILTER (WHERE updated_at > NOW() - INTERVAL '1 day') AS day,
             count(*) FILTER (WHERE updated_at > NOW() - INTERVAL '7 days') AS week,
             max(updated_at) AS last, max(level) AS top_level,
             ${STATS.map((k) => `coalesce(sum((user_stats->>'${k}')::numeric), 0) AS "${k}"`).join(", ")}
      FROM user_guild_profiles WHERE guild_id = $1`, [guild.id]),
    dbQuery<{ category: string; event_type: string; n: string; last: string }>(`
      SELECT category, event_type, count(*) AS n, max("timestamp") AS last FROM events
      WHERE guild_id = $1 AND "timestamp" > NOW() - INTERVAL '30 days' GROUP BY 1, 2 ORDER BY 3 DESC`, [guild.id]),
    dbQuery<{ event_type: string; at: string; xp_delta: string | null; gold_delta: string | null; item_id: string | null; quantity: number | null; new_level: number | null }>(`
      SELECT event_type, "timestamp" AS at, xp_delta, gold_delta, item_id, quantity, new_level FROM events
      WHERE guild_id = $1 AND event_type <> 'messageXp' ORDER BY "timestamp" DESC LIMIT 25`, [guild.id]),
    dbQuery<{ day: string; n: string }>(`
      SELECT to_char(date_trunc('day', "timestamp"), 'Mon DD') AS day, count(*) AS n FROM events
      WHERE guild_id = $1 AND "timestamp" > NOW() - INTERVAL '14 days' GROUP BY date_trunc('day', "timestamp"), 1 ORDER BY date_trunc('day', "timestamp")`, [guild.id]),
    // Null until migration 010 is live.
    dbQuery<{ command: string; uses: string; last: string }>(`
      SELECT command, sum(uses) AS uses, max(day)::text AS last FROM command_uses
      WHERE discord_guild_id = $1 AND day > CURRENT_DATE - 30 GROUP BY 1 ORDER BY 2 DESC`, [id]).catch(() => null),
    fetchHealth(id),
  ]);

  const p = players.rows[0]!;
  const c = guild.config ?? {};
  const setup: Array<[string, string]> = [
    ["Combat", c.combat?.enabled === false ? "off" : "on"],
    ["Enemies", String(count(c.combat?.enemies))],
    ["Shop items", String(count(c.shop?.items))],
    ["Gathering activities", String(count(c.gathering?.activities))],
    ["Crafting stations", String(count(c.crafting?.stations))],
    ["Quests", `${count(c.quests?.quests)}${c.quests?.enabled === false ? " (off)" : ""}`],
    ["Achievements", `${count(c.achievements?.achievements)}${c.achievements?.enabled === false ? " (off)" : ""}`],
    ["Characters", String(count(c.characters?.list))],
  ];
  const busiest = Math.max(1, ...perDay.rows.map((r) => Number(r.n)));

  return (
    <main className="mx-auto min-h-screen max-w-5xl space-y-8 px-6 py-12">
      <div>
        <Link href="/admin" className="text-sm underline">← Admin</Link>
        <h1 className={`mt-2 text-2xl font-semibold tracking-tight ${guild.removed_at ? "line-through" : ""}`}>{guild.name ?? "Unnamed server"}</h1>
        <p className="text-sm text-[var(--muted)]">
          <span className="font-mono">{id}</span> · added the bot {ago(guild.created_at)}{guild.removed_at ? ` · removed it ${ago(guild.removed_at)}` : ""}
        </p>
      </div>

      <section>
        <h2 className="font-semibold">Players</h2>
        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          <p>{p.players} with a profile</p>
          <p>{p.day} active today · {p.week} this week</p>
          <p>Last activity {ago(p.last)}</p>
          <p>Highest level {p.top_level ?? "–"}</p>
          <p>{Number(p.messagesSent).toLocaleString()} messages</p>
          <p>{p.fightsWon} fights won · {p.fightsLost} lost</p>
          <p>{p.enemiesDefeated} enemies beaten</p>
          <p>{p.itemsPurchased} items bought · {p.dailiesClaimed} dailies</p>
        </div>
      </section>

      <section>
        <h2 className="font-semibold">Setup</h2>
        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          {setup.map(([k, v]) => <p key={k}><span className="text-[var(--muted)]">{k}:</span> {v}</p>)}
        </div>
        <div className="mt-3 text-sm">
          {health === null ? <p className="text-[var(--muted)]">Health check: the bot couldn&apos;t be reached.</p>
            : !health.inGuild ? <p className="text-[var(--muted)]">Health check: the bot isn&apos;t in this server.</p>
            : !health.issues?.length ? <p>Health check: nothing misconfigured.</p>
            : (
              <ul className="space-y-0.5">
                {health.issues.map((i, k) => <li key={k}>{i.severity === "error" ? "⛔" : "⚠️"} {i.message} <span className="text-[var(--muted)]">({i.page})</span></li>)}
              </ul>
            )}
        </div>
      </section>

      <section>
        <h2 className="font-semibold">Commands, last 30 days</h2>
        {commands === null ? <p className="mt-2 text-sm text-[var(--muted)]">Not counted yet: needs migration 010 and the bot deploy that counts them.</p>
          : !commands.rows.length ? <p className="mt-2 text-sm text-[var(--muted)]">No commands used since counting started.</p>
          : (
            <div className="frame mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {commands.rows.map((r) => (
                    <tr key={r.command} className="border-t border-[var(--border)] first:border-t-0">
                      <td className="px-3 py-1.5 font-mono">/{r.command}</td>
                      <td className="px-3 py-1.5 tabular-nums">{r.uses}</td>
                      <td className="px-3 py-1.5 text-[var(--muted)]">last {r.last}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>

      <section>
        <h2 className="font-semibold">Events, last 14 days</h2>
        {!perDay.rows.length ? <p className="mt-2 text-sm text-[var(--muted)]">Nothing logged.</p> : (
          <div className="mt-2 space-y-0.5 text-sm">
            {perDay.rows.map((r) => (
              <div key={r.day} className="flex items-center gap-3">
                <span className="w-14 text-[var(--muted)]">{r.day}</span>
                <span className="h-2.5 bg-[var(--accent)]" style={{ width: `${(Number(r.n) / busiest) * 60}%` }} />
                <span className="tabular-nums">{r.n}</span>
              </div>
            ))}
          </div>
        )}
        {events.rows.length > 0 && (
          <p className="mt-3 text-sm">
            {events.rows.map((r) => `${r.event_type} ×${r.n}`).join(" · ")}
          </p>
        )}
      </section>

      <section>
        <h2 className="font-semibold">Latest events <span className="font-normal text-[var(--muted)]">(chat XP left out)</span></h2>
        {!recent.rows.length ? <p className="mt-2 text-sm text-[var(--muted)]">Nothing yet.</p> : (
          <div className="frame mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {recent.rows.map((r, k) => (
                  <tr key={k} className="border-t border-[var(--border)] first:border-t-0">
                    <td className="px-3 py-1.5 whitespace-nowrap text-[var(--muted)]">{ago(r.at)}</td>
                    <td className="px-3 py-1.5">{r.event_type}</td>
                    <td className="px-3 py-1.5 text-[var(--muted)]">
                      {[r.item_id && `${r.item_id}${r.quantity && r.quantity !== 1 ? ` ×${r.quantity}` : ""}`, r.xp_delta && `${r.xp_delta} XP`, r.gold_delta && `${r.gold_delta} gold`, r.new_level && `→ level ${r.new_level}`].filter(Boolean).join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
