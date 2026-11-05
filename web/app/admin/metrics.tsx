import Link from "next/link";
import { dbQuery } from "@/app/lib/db";
import { When } from "./when";

/*
 * Where servers drop off, for /admin: a funnel over every server added since
 * clicks were recorded (interaction_log, migration 013), each day's numbers,
 * the servers that left and what they last did, every command and button
 * with its failures and speed, and how servers set up (Discord or the
 * dashboard). Reads only; each part says so when its table isn't there yet.
 */

type Tracked = {
  id: string; name: string | null; created_at: string; removed_at: string | null; old_enough: boolean;
  first_action: string | null; set_up_at: string | null; first_fight: string | null;
  people: string; actions: string; failed: string; dashboard: string; came_back: boolean;
  last_action: string | null; last_kind: string | null; last_at: string | null;
};

/** "45s", "12m", "3h", "2d". */
function span(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 172_800) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86_400)}d`;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

/** A button or menu id without its Discord ids, as clicks are named on the server page. */
const clean = (id: string) => id.split(":").filter((seg) => seg && !/^\d{15,}$/.test(seg)).join(" › ");

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "–");
const th = "px-3 py-2 font-normal";
const td = "px-3 py-1.5";

export async function Metrics() {
  // Every part is null until migration 013 (and 014 for where setups happen) is live.
  const [tracked, days, actions, failures, routes, worlds] = await Promise.all([
    dbQuery<Tracked>(`
      WITH start AS (SELECT min(at) AS at FROM interaction_log)
      SELECT g.discord_guild_id::text AS id, g.name, g.created_at, g.removed_at,
             g.created_at < NOW() - INTERVAL '1 day' AS old_enough,
             (SELECT min(at) FROM interaction_log l WHERE l.discord_guild_id = g.discord_guild_id AND l.kind <> 'dashboard') AS first_action,
             (SELECT min(at) FROM config_history h WHERE h.discord_guild_id = g.discord_guild_id AND h.config->'combat'->>'enabled' = 'true') AS set_up_at,
             (SELECT min("timestamp") FROM events e WHERE e.guild_id = g.id AND e.event_type = 'fight') AS first_fight,
             (SELECT count(DISTINCT discord_user_id) FROM interaction_log l WHERE l.discord_guild_id = g.discord_guild_id AND l.kind <> 'dashboard') AS people,
             (SELECT count(*) FROM interaction_log l WHERE l.discord_guild_id = g.discord_guild_id AND l.kind <> 'dashboard') AS actions,
             (SELECT count(*) FROM interaction_log l WHERE l.discord_guild_id = g.discord_guild_id AND NOT l.ok) AS failed,
             (SELECT count(*) FROM interaction_log l WHERE l.discord_guild_id = g.discord_guild_id AND l.kind = 'dashboard') AS dashboard,
             EXISTS (SELECT 1 FROM interaction_log l WHERE l.discord_guild_id = g.discord_guild_id AND l.at > g.created_at + INTERVAL '1 day') AS came_back,
             last.name AS last_action, last.kind AS last_kind, last.at AS last_at
      FROM guilds g CROSS JOIN start
      LEFT JOIN LATERAL (
        SELECT l.name, l.kind, l.at FROM interaction_log l WHERE l.discord_guild_id = g.discord_guild_id ORDER BY l.at DESC LIMIT 1
      ) last ON true
      WHERE g.created_at >= start.at
      ORDER BY g.created_at DESC`).catch(() => null),
    // UTC days.
    dbQuery<{ day: string; added: string; removed: string; servers: string; people: string; actions: string; failed: string; dashboard: string }>(`
      SELECT to_char(d, 'Mon DD') AS day,
             (SELECT count(*) FROM guild_log WHERE event IN ('joined', 'rejoined') AND at::date = d::date) AS added,
             (SELECT count(*) FROM guild_log WHERE event = 'left' AND at::date = d::date) AS removed,
             count(DISTINCT l.discord_guild_id) FILTER (WHERE l.kind <> 'dashboard') AS servers,
             count(DISTINCT l.discord_user_id) FILTER (WHERE l.kind <> 'dashboard') AS people,
             count(l.id) FILTER (WHERE l.kind <> 'dashboard') AS actions,
             count(l.id) FILTER (WHERE NOT l.ok) AS failed,
             count(l.id) FILTER (WHERE l.kind = 'dashboard') AS dashboard
      FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, INTERVAL '1 day') d
      LEFT JOIN interaction_log l ON l.at >= d AND l.at < d + INTERVAL '1 day'
      GROUP BY d ORDER BY d DESC`).catch(() => null),
    // Buttons and menus grouped by their id without Discord ids, so each kind of button is one row.
    dbQuery<{ kind: string; name: string; uses: string; servers: string; people: string; failed: string; p50: number | null; p95: number | null }>(`
      SELECT kind, CASE WHEN kind = 'command' THEN name ELSE regexp_replace(name, ':[0-9]{15,}', '', 'g') END AS name,
             count(*) AS uses, count(DISTINCT discord_guild_id) AS servers, count(DISTINCT discord_user_id) AS people,
             count(*) FILTER (WHERE NOT ok) AS failed,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) AS p50, percentile_cont(0.95) WITHIN GROUP (ORDER BY ms) AS p95
      FROM interaction_log WHERE at > NOW() - INTERVAL '30 days' AND kind <> 'dashboard'
      GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 50`).catch(() => null),
    dbQuery<{ id: string; server: string | null; at: string; kind: string; name: string }>(`
      SELECT l.discord_guild_id::text AS id, g.name AS server, l.at, l.kind, l.name FROM interaction_log l
      LEFT JOIN guilds g ON g.discord_guild_id = l.discord_guild_id WHERE NOT l.ok ORDER BY l.at DESC LIMIT 20`).catch(() => null),
    dbQuery<{ quick: string; wizard: string; dashboard_servers: string; discord_servers: string; visited: string }>(`
      SELECT (SELECT count(DISTINCT discord_guild_id) FROM interaction_log WHERE name = 'setup:quick') AS quick,
             (SELECT count(DISTINCT discord_guild_id) FROM interaction_log WHERE name LIKE 'setup:apply%') AS wizard,
             (SELECT count(DISTINCT discord_guild_id) FROM config_history WHERE source = 'dashboard') AS dashboard_servers,
             (SELECT count(DISTINCT discord_guild_id) FROM config_history WHERE source = 'discord') AS discord_servers,
             (SELECT count(DISTINCT discord_guild_id) FROM interaction_log WHERE kind = 'dashboard') AS visited`).catch(() => null),
    dbQuery<{ world: string; n: string }>(`
      SELECT options->'values'->>0 AS world, count(DISTINCT discord_guild_id) AS n FROM interaction_log
      WHERE name = 'setup:world' GROUP BY 1 ORDER BY 2 DESC`).catch(() => null),
  ]);

  if (!tracked) {
    return <p className="text-sm text-[var(--muted)]">The funnel, daily numbers and commands need migration 013.</p>;
  }

  const t = tracked.rows;
  const since = (r: Tracked, at: string | null) => (at ? new Date(at).getTime() - new Date(r.created_at).getTime() : null);
  // Each step: how many reached it, and the median time from adding havocish.
  const step = (label: string, reached: Tracked[], at?: (r: Tracked) => string | null, of = t.length) => {
    const times = at ? reached.map((r) => since(r, at(r))).filter((x): x is number => x !== null && x >= 0) : [];
    const m = median(times);
    return { label, n: reached.length, of, time: m === null ? null : span(m) };
  };
  const older = t.filter((r) => r.old_enough);
  const funnel = [
    step("added havocish", t),
    step("used it (any command or button)", t.filter((r) => r.first_action), (r) => r.first_action),
    step("set it up (combat on)", t.filter((r) => r.set_up_at), (r) => r.set_up_at),
    step("had a first fight", t.filter((r) => r.first_fight), (r) => r.first_fight),
    step("2 or more people used it", t.filter((r) => Number(r.people) >= 2)),
    step("opened the dashboard", t.filter((r) => Number(r.dashboard) > 0)),
    step("came back after a day", older.filter((r) => r.came_back), undefined, older.length),
    step("still have it", t.filter((r) => !r.removed_at)),
  ];
  const left = t.filter((r) => r.removed_at);
  const ro = routes?.rows[0];

  return (
    <>
      <section>
        <h2 className="font-semibold">Funnel <span className="font-normal text-[var(--muted)]">servers added since clicks were recorded · time is the median from adding havocish</span></h2>
        <div className="frame mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {funnel.map((f) => (
                <tr key={f.label} className="border-t border-[var(--border)] first:border-t-0">
                  <td className={td}>{f.label}</td>
                  <td className={`${td} w-40`}>
                    <span className="block h-2.5 bg-[var(--accent)]" style={{ width: `${f.of ? (f.n / f.of) * 100 : 0}%` }} />
                  </td>
                  <td className={`${td} tabular-nums whitespace-nowrap`}>{f.n} of {f.of} · {pct(f.n, f.of)}</td>
                  <td className={`${td} text-[var(--muted)] whitespace-nowrap`}>{f.time ? `after ${f.time}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ro && (
          <p className="mt-2 text-sm text-[var(--muted)]">
            How they set up: {ro.quick} used Start now, {ro.wizard} finished /setup, {ro.discord_servers} changed settings in Discord, {ro.dashboard_servers} on the dashboard.
            {" "}{ro.visited} opened the dashboard at all.
            {worlds?.rows.length ? ` Worlds picked in /setup: ${worlds.rows.map((w) => `${w.world} ×${w.n}`).join(", ")}.` : ""}
          </p>
        )}
      </section>

      <section>
        <h2 className="font-semibold">Servers that left <span className="font-normal text-[var(--muted)]">since clicks were recorded</span></h2>
        {!left.length ? <p className="mt-2 text-sm text-[var(--muted)]">None yet.</p> : (
          <div className="frame mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[var(--muted)]">
                <tr><th className={th}>Server</th><th className={th}>Stayed</th><th className={th}>Set up</th><th className={th}>People · actions · failed</th><th className={th}>Dashboard</th><th className={th}>Last thing they did</th></tr>
              </thead>
              <tbody>
                {left.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--border)]">
                    <td className={td}><Link href={`/admin/server/${r.id}`} className="underline-offset-2 hover:underline">{r.name ?? "Unnamed server"}</Link></td>
                    <td className={`${td} whitespace-nowrap`}>{span(new Date(r.removed_at!).getTime() - new Date(r.created_at).getTime())}</td>
                    <td className={td}>{r.set_up_at ? `yes, after ${span(since(r, r.set_up_at)!)}` : "no"}</td>
                    <td className={`${td} tabular-nums`}>{r.people} · {r.actions} · {r.failed}</td>
                    <td className={`${td} tabular-nums`}>{Number(r.dashboard) ? `${r.dashboard} pages` : "never"}</td>
                    <td className={td}>
                      {r.last_action ? <>{r.last_kind === "command" ? `/${r.last_action}` : clean(r.last_action)} <span className="text-[var(--muted)]">({span(new Date(r.removed_at!).getTime() - new Date(r.last_at!).getTime())} before leaving)</span></> : "nothing"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-semibold">Every day <span className="font-normal text-[var(--muted)]">last 14 days, UTC</span></h2>
        <div className="frame mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[var(--muted)]">
              <tr><th className={th}>Day</th><th className={th}>Added</th><th className={th}>Removed</th><th className={th}>Servers active</th><th className={th}>People</th><th className={th}>Actions</th><th className={th}>Failed</th><th className={th}>Dashboard pages</th></tr>
            </thead>
            <tbody className="tabular-nums">
              {days?.rows.map((d) => (
                <tr key={d.day} className="border-t border-[var(--border)]">
                  <td className={td}>{d.day}</td><td className={td}>{d.added}</td><td className={td}>{d.removed}</td>
                  <td className={td}>{d.servers}</td><td className={td}>{d.people}</td><td className={td}>{d.actions}</td>
                  <td className={`${td} ${Number(d.failed) ? "text-red-300" : ""}`}>{d.failed}</td><td className={td}>{d.dashboard}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-semibold">Commands and buttons <span className="font-normal text-[var(--muted)]">last 30 days, every server · time to answer: typical, and slowest 5%</span></h2>
        <div className="frame mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[var(--muted)]">
              <tr><th className={th}>What</th><th className={th}>Uses</th><th className={th}>Servers</th><th className={th}>People</th><th className={th}>Failed</th><th className={th}>Typical</th><th className={th}>Slowest 5%</th></tr>
            </thead>
            <tbody className="tabular-nums">
              {actions?.rows.map((a) => (
                <tr key={`${a.kind}${a.name}`} className="border-t border-[var(--border)]">
                  <td className={td}>{a.kind === "command" ? `/${a.name}` : `${a.kind} ${clean(a.name)}`}</td>
                  <td className={td}>{a.uses}</td><td className={td}>{a.servers}</td><td className={td}>{a.people}</td>
                  <td className={`${td} ${Number(a.failed) ? "text-red-300" : ""}`}>{a.failed}</td>
                  <td className={td}>{a.p50 == null ? "–" : `${(a.p50 / 1000).toFixed(1)}s`}</td>
                  <td className={`${td} ${a.p95 != null && a.p95 > 3000 ? "text-[var(--gold)]" : ""}`}>{a.p95 == null ? "–" : `${(a.p95 / 1000).toFixed(1)}s`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-semibold">Latest failures</h2>
        {!failures?.rows.length ? <p className="mt-2 text-sm text-[var(--muted)]">None.</p> : (
          <ul className="mt-2 space-y-0.5 text-sm">
            {failures.rows.map((f, k) => (
              <li key={k}>
                <span className="inline-block w-44 text-[var(--muted)]"><When at={f.at} /></span>
                <Link href={`/admin/server/${f.id}`} className="underline-offset-2 hover:underline">{f.server ?? f.id}</Link>
                {" · "}{f.kind === "command" ? `/${f.name}` : `${f.kind} ${clean(f.name)}`}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
