import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/app/lib/admin";
import { dbQuery } from "@/app/lib/db";
import { fetchHealth } from "@/app/lib/health";
import { DEFAULT_LIMITS } from "@/app/lib/aiUsage";
import { ago, configChanges, describeClick, describeEvent, type ClickRow, type EventRow } from "../../describe";
import { When } from "../../when";
import { Sessions, type Click } from "./sessions";

export const metadata: Metadata = { title: "Admin · server", robots: { index: false } };
export const dynamic = "force-dynamic";

/*
 * One server, for havocish's admin: its history (joins, leaves, every setup
 * change, the first use of each command), what it has built, what its
 * players do, and its AI limits. History and setup changes need migration
 * 012; fights, gathers and crafts are recorded from the bot deploy after it.
 * No player names.
 */

const STATS = ["messagesSent", "fightsWon", "fightsLost", "enemiesDefeated", "itemsPurchased", "dailiesClaimed"] as const;
const LOG_WORDS: Record<string, string> = { joined: "Added havocish", left: "Removed havocish", rejoined: "Added havocish back" };
const ACTIVITY = ["fight", "gather", "craft", "upgrade", "buy", "sell", "use"];
const DOING: Record<string, { title: string; good?: string }> = {
  fight: { title: "Fights", good: "won" }, gather: { title: "Gathering" }, craft: { title: "Crafting" },
  upgrade: { title: "Upgrades", good: "succeeded" }, buy: { title: "Bought" }, sell: { title: "Sold" }, use: { title: "Used" },
};

type Named = { name?: string; emoji?: string };
type Config = {
  combat?: { enabled?: boolean; enemies?: Record<string, Named> };
  shop?: { items?: Record<string, Named> };
  gathering?: { activities?: Record<string, Named> };
  crafting?: { stations?: Record<string, Named> };
  quests?: { enabled?: boolean; quests?: Record<string, Named> };
  achievements?: { enabled?: boolean; achievements?: Record<string, Named> };
  characters?: { list?: Record<string, Named> };
};

/** Saves the server's AI limits; empty fields go back to the default, and a row with nothing left is removed. */
async function saveLimits(form: FormData) {
  "use server";
  if (!(await isAdmin())) return;
  const id = String(form.get("id") ?? "");
  if (!/^\d{5,20}$/.test(id)) return;
  const num = (k: string) => {
    const v = String(form.get(k) ?? "").trim();
    return v === "" || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.floor(Number(v)));
  };
  const note = String(form.get("note") ?? "").trim() || null;
  const [helperDaily, packs] = [num("helper_daily"), num("packs")];
  if (helperDaily === null && packs === null && note === null) {
    await dbQuery(`DELETE FROM ai_limits WHERE discord_guild_id = $1`, [id]);
  } else {
    await dbQuery(
      `INSERT INTO ai_limits (discord_guild_id, helper_daily, packs, note) VALUES ($1, $2, $3, $4)
       ON CONFLICT (discord_guild_id) DO UPDATE SET helper_daily = $2, packs = $3, note = $4, updated_at = NOW()`,
      [id, helperDaily, packs, note]
    );
  }
  revalidatePath(`/admin/server/${id}`);
}

/** A list of owner-made things by name: "🐺 Wolf, 🐗 Boar … +4 more". */
function names(set: Record<string, Named> | undefined, max = 12): string {
  const all = Object.entries(set ?? {}).map(([id, v]) => `${v?.emoji ? `${v.emoji} ` : ""}${v?.name || id}`);
  if (!all.length) return "none";
  return all.length > max ? `${all.slice(0, max).join(", ")} … +${all.length - max} more` : all.join(", ");
}

export default async function ServerPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) notFound();
  const { id } = await params;
  if (!/^\d{5,20}$/.test(id)) notFound();

  const guild = (await dbQuery<{ id: string; name: string | null; created_at: string; removed_at: string | null; config: Config | null }>(
    `SELECT id::text, name, created_at, removed_at, config FROM guilds WHERE discord_guild_id = $1`, [id])).rows[0];
  if (!guild) notFound();

  const [players, doing, recent, perDay, commands, firstUses, log, versions, limits, health, clicks] = await Promise.all([
    dbQuery<Record<string, string | null>>(`
      SELECT count(*) AS players,
             count(*) FILTER (WHERE updated_at > NOW() - INTERVAL '1 day') AS day,
             count(*) FILTER (WHERE updated_at > NOW() - INTERVAL '7 days') AS week,
             max(updated_at) AS last, max(level) AS top_level,
             ${STATS.map((k) => `coalesce(sum((user_stats->>'${k}')::numeric), 0) AS "${k}"`).join(", ")}
      FROM user_guild_profiles WHERE guild_id = $1`, [guild.id]),
    dbQuery<{ event_type: string; what: string | null; n: string; good: string; players: string }>(`
      SELECT event_type, coalesce(metadata->>'enemy', metadata->>'activity', metadata->>'item', item_id) AS what,
             count(*) AS n, count(DISTINCT user_id) AS players,
             count(*) FILTER (WHERE metadata->>'outcome' = 'win' OR metadata->>'success' = 'true') AS good
      FROM events WHERE guild_id = $1 AND "timestamp" > NOW() - INTERVAL '30 days' AND event_type = ANY($2)
      GROUP BY 1, 2 ORDER BY 3 DESC`, [guild.id, ACTIVITY]),
    dbQuery<EventRow & { player: string }>(`
      SELECT event_type, "timestamp" AS at, xp_delta, gold_delta, item_id, quantity, new_level, metadata, user_id::text AS player FROM events
      WHERE guild_id = $1 AND event_type NOT IN ('messageXp', 'vcXp') ORDER BY "timestamp" DESC LIMIT 40`, [guild.id]),
    dbQuery<{ day: string; n: string }>(`
      SELECT to_char(date_trunc('day', "timestamp"), 'Mon DD') AS day, count(*) AS n FROM events
      WHERE guild_id = $1 AND "timestamp" > NOW() - INTERVAL '14 days' AND event_type NOT IN ('messageXp', 'vcXp')
      GROUP BY date_trunc('day', "timestamp"), 1 ORDER BY date_trunc('day', "timestamp")`, [guild.id]),
    dbQuery<{ command: string; uses: string; last: string }>(`
      SELECT command, sum(uses) AS uses, max(day)::text AS last FROM command_uses
      WHERE discord_guild_id = $1 AND day > CURRENT_DATE - 30 GROUP BY 1 ORDER BY 2 DESC`, [id]).catch(() => null),
    dbQuery<{ command: string; first: string }>(`
      SELECT command, min(day) AS first FROM command_uses WHERE discord_guild_id = $1 GROUP BY 1`, [id]).catch(() => null),
    // Both null until migration 012 is live.
    dbQuery<{ event: string; at: string }>(`SELECT event, at FROM guild_log WHERE discord_guild_id = $1`, [id]).catch(() => null),
    dbQuery<{ config: unknown; at: string }>(`SELECT config, at FROM config_history WHERE discord_guild_id = $1 ORDER BY id`, [id]).catch(() => null),
    dbQuery<{ helper_daily: number | null; packs: number | null; note: string | null }>(
      `SELECT helper_daily, packs, note FROM ai_limits WHERE discord_guild_id = $1`, [id]).catch(() => null),
    fetchHealth(id),
    // Null until migration 013 is live. Players keyed as in events (users.id), so letters match across the page.
    dbQuery<ClickRow & { at: string; ok: boolean; ms: number | null; role: string | null; player: string }>(`
      SELECT l.at, l.kind, l.name, l.options, l.ok, l.ms, l.role, coalesce(u.id::text, 'd' || l.discord_user_id) AS player
      FROM interaction_log l LEFT JOIN users u ON u.discord_user_id = l.discord_user_id
      WHERE l.discord_guild_id = $1 ORDER BY l.at DESC LIMIT 800`, [id]).catch(() => null),
  ]);

  const p = players.rows[0]!;
  const c = guild.config ?? {};
  const lim = limits?.rows[0];
  // Events store item ids; show each item's live name, as everywhere else.
  const itemName = (itemId: string) => {
    const it = c.shop?.items?.[itemId];
    return it?.name ? `${it.emoji ? `${it.emoji} ` : ""}${it.name}` : itemId;
  };

  // Each command's first use: exact from the interaction log, else (before migration 013) only the day from command_uses.
  type Moment = { at: string; title: string; lines?: string[]; day?: boolean };
  const exact = new Map<string, string>();
  for (const r of clicks?.rows ?? []) if (r.kind === "command") exact.set(r.name, r.at);
  const firsts: Moment[] = [
    ...[...exact].map(([command, at]) => ({ at, title: `First used /${command}` })),
    ...(firstUses?.rows ?? []).filter((r) => !exact.has(r.command)).map((r) => ({ at: r.first, title: `First used /${r.command}`, day: true })),
  ];

  // The history: joins and leaves, each setup change (compared with the version before), and each command's first use.
  const history: Moment[] = [
    ...(log?.rows.length ? log.rows : [{ event: "joined", at: guild.created_at }]).map((r) => ({ at: r.at, title: LOG_WORDS[r.event] ?? r.event })),
    ...(versions?.rows ?? []).flatMap((v, k, all): Moment[] => {
      if (k === 0) return [];
      const lines = configChanges(all[k - 1]!.config, v.config, Infinity);
      return lines.length ? [{ at: v.at, title: "Changed their setup", lines }] : [];
    }),
    ...firsts,
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  // Players told apart by a letter (A is whoever acted most recently) rather than named.
  const letters = new Map<string, string>();
  const who = (player: string) => {
    if (!letters.has(player)) letters.set(player, letters.size < 26 ? String.fromCharCode(65 + letters.size) : `#${letters.size + 1}`);
    return letters.get(player)!;
  };
  const sessionClicks: Click[] = (clicks?.rows ?? []).map((r) => ({
    at: new Date(r.at).toISOString(), who: who(r.player), role: r.role, text: describeClick(r), failed: !r.ok,
    slow: r.ms != null && r.ms > 3000 ? Math.round(r.ms / 100) / 10 : null,
  }));

  const built: Array<[string, string]> = [
    [`Enemies (${Object.keys(c.combat?.enemies ?? {}).length})${c.combat?.enabled ? "" : ", combat off"}`, names(c.combat?.enemies)],
    [`Items (${Object.keys(c.shop?.items ?? {}).length})`, names(c.shop?.items)],
    [`Gathering (${Object.keys(c.gathering?.activities ?? {}).length})`, names(c.gathering?.activities)],
    [`Crafting (${Object.keys(c.crafting?.stations ?? {}).length})`, names(c.crafting?.stations)],
    [`Quests (${Object.keys(c.quests?.quests ?? {}).length})${c.quests?.enabled === false ? ", off" : ""}`, names(c.quests?.quests)],
    [`Achievements (${Object.keys(c.achievements?.achievements ?? {}).length})${c.achievements?.enabled === false ? ", off" : ""}`, names(c.achievements?.achievements)],
    [`Characters (${Object.keys(c.characters?.list ?? {}).length})`, names(c.characters?.list)],
  ];
  const groups = Object.keys(DOING).map((type) => ({ type, rows: doing.rows.filter((r) => r.event_type === type) })).filter((g) => g.rows.length);
  const busiest = Math.max(1, ...perDay.rows.map((r) => Number(r.n)));
  const field = "rounded-sm border border-[var(--border)] bg-[var(--surface)] px-2 py-1";

  return (
    <main className="mx-auto min-h-screen max-w-5xl space-y-10 px-6 py-12">
      <div>
        <Link href="/admin" className="text-sm underline">← Admin</Link>
        <h1 className={`mt-2 text-2xl font-semibold tracking-tight ${guild.removed_at ? "line-through" : ""}`}>{guild.name ?? "Unnamed server"}</h1>
        <p className="text-sm text-[var(--muted)]">
          <span className="font-mono">{id}</span> · added havocish <When at={guild.created_at} />{guild.removed_at ? <> · removed it <When at={guild.removed_at} /></> : ""}
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
        <h2 className="font-semibold">Sessions <span className="font-normal text-[var(--muted)]">every command, button, menu and form, newest first</span></h2>
        {clicks === null ? <p className="mt-2 text-sm text-[var(--muted)]">Not recorded yet: needs migration 013 and the bot deploy with it.</p>
          : !sessionClicks.length ? <p className="mt-2 text-sm text-[var(--muted)]">Nothing since recording started.</p>
          : <Sessions clicks={sessionClicks} />}
      </section>

      <section>
        <h2 className="font-semibold">History</h2>
        {versions === null && <p className="mt-1 text-sm text-[var(--muted)]">Joins, leaves and setup changes are recorded from migration 012 on.</p>}
        <ol className="mt-2 space-y-2 border-l border-[var(--border)] pl-4 text-sm">
          {history.map((m, k) => (
            <li key={k}>
              <span className="text-[var(--muted)]">{m.day ? `that day (${new Date(m.at).toISOString().slice(0, 10)})` : <When at={m.at} />}</span> · <b className="font-semibold">{m.title}</b>
              {m.lines && (
                <ul className="mt-0.5 text-[var(--muted)]">
                  {m.lines.slice(0, 14).map((l, j) => <li key={j}>{l}</li>)}
                  {m.lines.length > 14 && (
                    <li>
                      <details>
                        <summary className="cursor-pointer">{m.lines.length - 14} more changes</summary>
                        <ul>{m.lines.slice(14).map((l, j) => <li key={j}>{l}</li>)}</ul>
                      </details>
                    </li>
                  )}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="font-semibold">What they&apos;ve built</h2>
        <dl className="mt-2 space-y-1.5 text-sm">
          {built.map(([k, v]) => (
            <div key={k} className="grid gap-x-4 sm:grid-cols-[13rem_1fr]">
              <dt className="text-[var(--muted)]">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
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
        <h2 className="font-semibold">What players do <span className="font-normal text-[var(--muted)]">last 30 days</span></h2>
        {!groups.length ? <p className="mt-2 text-sm text-[var(--muted)]">Nothing recorded yet. Fights, gathering and crafting are recorded from the bot deploy with migration 012.</p> : (
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            {groups.map((g) => (
              <div key={g.type} className="frame px-3 py-2 text-sm">
                <h3 className="mb-1 font-semibold">{DOING[g.type]!.title}</h3>
                <table className="w-full">
                  <tbody>
                    {g.rows.slice(0, 10).map((r) => (
                      <tr key={r.what ?? ""}>
                        <td className="py-0.5 pr-2">{["buy", "sell", "use"].includes(g.type) && r.what ? itemName(r.what) : r.what ?? "?"}</td>
                        <td className="py-0.5 text-right tabular-nums whitespace-nowrap">
                          ×{r.n}{DOING[g.type]!.good ? ` · ${r.good} ${DOING[g.type]!.good}` : ""}
                          <span className="text-[var(--muted)]"> · {r.players} player{r.players === "1" ? "" : "s"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-semibold">Latest activity <span className="font-normal text-[var(--muted)]">players shown as letters, chat XP left out</span></h2>
        {!recent.rows.length ? <p className="mt-2 text-sm text-[var(--muted)]">Nothing yet.</p> : (
          <ul className="mt-2 space-y-0.5 text-sm">
            {recent.rows.map((r, k) => (
              <li key={k}>
                <span className="inline-block w-44 text-[var(--muted)]"><When at={r.at} /></span>
                <span className="inline-block w-8 font-mono text-[var(--muted)]">{who(r.player)}</span>
                {describeEvent(r, itemName)}
              </li>
            ))}
          </ul>
        )}
        {perDay.rows.length > 0 && (
          <div className="mt-4 space-y-0.5 text-sm">
            <p className="text-[var(--muted)]">Per day, last 14 days</p>
            {perDay.rows.map((r) => (
              <div key={r.day} className="flex items-center gap-3">
                <span className="w-14 text-[var(--muted)]">{r.day}</span>
                <span className="h-2.5 bg-[var(--accent)]" style={{ width: `${(Number(r.n) / busiest) * 60}%` }} />
                <span className="tabular-nums">{r.n}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-semibold">Commands <span className="font-normal text-[var(--muted)]">last 30 days</span></h2>
        {commands === null ? <p className="mt-2 text-sm text-[var(--muted)]">Not counted yet: needs migration 010.</p>
          : !commands.rows.length ? <p className="mt-2 text-sm text-[var(--muted)]">No commands used since counting started.</p>
          : (
            <p className="mt-2 text-sm">
              {commands.rows.map((r) => `/${r.command} ×${r.uses}`).join(" · ")}
            </p>
          )}
      </section>

      <section>
        <h2 className="font-semibold">AI limits</h2>
        <form action={saveLimits} className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <input type="hidden" name="id" value={id} />
          <label>Helper messages a day <input name="helper_daily" type="number" min={0} defaultValue={lim?.helper_daily ?? ""} placeholder={String(DEFAULT_LIMITS.helperDaily)} className={`w-16 ${field}`} /></label>
          <label>Worlds in all <input name="packs" type="number" min={0} defaultValue={lim?.packs ?? ""} placeholder={String(DEFAULT_LIMITS.packs)} className={`w-14 ${field}`} /></label>
          <input name="note" defaultValue={lim?.note ?? ""} placeholder="note" aria-label="Note" className={`w-48 ${field}`} />
          <button type="submit" className="rounded-sm border border-[var(--border)] px-2 py-1 hover:bg-[var(--accent)]/10">Save</button>
          <span className="text-[var(--muted)]">Empty uses the default.</span>
        </form>
      </section>
    </main>
  );
}
