import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/app/lib/admin";
import { dbQuery } from "@/app/lib/db";
import { costOf, DAILY_BUDGET, DEFAULT_LIMITS, spentToday } from "@/app/lib/aiUsage";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

/*
 * havocish's own admin page: every server, what its AI use costs, and its AI
 * limits, editable in place. Only ADMIN_USER_IDS can open it; anyone else
 * gets a 404.
 */

type Row = { id: string; name: string | null; removed: boolean; helper_daily: number | null; packs: number | null; note: string | null; worlds: string; today: string };

/** Saves one server's limits; empty fields go back to the default, and a row with nothing left is removed. */
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
  revalidatePath("/admin");
}

export default async function AdminPage() {
  if (!(await isAdmin())) notFound();

  const [servers, usage, spent] = await Promise.all([
    // ponytail: every server on one page; a search box once there are a few hundred.
    dbQuery<Row>(`
      SELECT g.discord_guild_id::text AS id, g.name, g.removed_at IS NOT NULL AS removed,
             l.helper_daily, l.packs, l.note,
             (SELECT count(*) FROM ai_packs p WHERE p.discord_guild_id = g.discord_guild_id) AS worlds,
             (SELECT count(*) FROM ai_usage u WHERE u.discord_guild_id = g.discord_guild_id AND u.kind = 'helper' AND u.created_at > NOW() - INTERVAL '1 day') AS today
      FROM guilds g LEFT JOIN ai_limits l ON l.discord_guild_id = g.discord_guild_id`),
    dbQuery<{ id: string; model: string; input: string; output: string }>(`
      SELECT discord_guild_id::text AS id, model, sum(input_tokens) AS input, sum(output_tokens) AS output
      FROM ai_usage WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY 1, 2`),
    spentToday(),
  ]);

  const cost = new Map<string, number>();
  for (const u of usage.rows) cost.set(u.id, (cost.get(u.id) ?? 0) + costOf(u.model, Number(u.input), Number(u.output)));
  const rows = servers.rows.sort((a, b) => (cost.get(b.id) ?? 0) - (cost.get(a.id) ?? 0) || (a.name ?? "").localeCompare(b.name ?? ""));
  const month = [...cost.values()].reduce((a, b) => a + b, 0);
  const dollars = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        AI today: {spent === null ? "no usage table yet" : `${dollars(spent)} of ${dollars(DAILY_BUDGET)}`} · last 30 days: {dollars(month)} · {rows.length} servers.
        Empty limits use the defaults ({DEFAULT_LIMITS.helperDaily} helper messages a day, {DEFAULT_LIMITS.packs} worlds).
      </p>

      <div className="frame mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2 font-normal">Server</th>
              <th className="px-3 py-2 font-normal">AI, 30 days</th>
              <th className="px-3 py-2 font-normal">Helper today</th>
              <th className="px-3 py-2 font-normal">Worlds made</th>
              <th className="px-3 py-2 font-normal">Limits: helper a day · worlds · note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2">
                  <div className={r.removed ? "text-[var(--muted)] line-through" : ""}>{r.name ?? "Unnamed server"}</div>
                  <div className="font-mono text-xs text-[var(--muted)]">{r.id}</div>
                </td>
                <td className="px-3 py-2 tabular-nums">{cost.has(r.id) ? dollars(cost.get(r.id)!) : "–"}</td>
                <td className="px-3 py-2 tabular-nums">{r.today} / {r.helper_daily ?? DEFAULT_LIMITS.helperDaily}</td>
                <td className="px-3 py-2 tabular-nums">{r.worlds} / {r.packs ?? DEFAULT_LIMITS.packs}</td>
                <td className="px-3 py-2">
                  <form action={saveLimits} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input name="helper_daily" type="number" min={0} defaultValue={r.helper_daily ?? ""} placeholder={String(DEFAULT_LIMITS.helperDaily)} aria-label="Helper messages a day" className="w-16 rounded-sm border border-[var(--border)] bg-[var(--surface)] px-2 py-1" />
                    <input name="packs" type="number" min={0} defaultValue={r.packs ?? ""} placeholder={String(DEFAULT_LIMITS.packs)} aria-label="Worlds in all" className="w-14 rounded-sm border border-[var(--border)] bg-[var(--surface)] px-2 py-1" />
                    <input name="note" defaultValue={r.note ?? ""} placeholder="note" aria-label="Note" className="w-28 rounded-sm border border-[var(--border)] bg-[var(--surface)] px-2 py-1" />
                    <button type="submit" className="rounded-sm border border-[var(--border)] px-2 py-1 hover:bg-[var(--accent)]/10">Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
