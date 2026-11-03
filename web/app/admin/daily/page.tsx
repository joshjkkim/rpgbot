import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/app/lib/admin";
import { dbQuery } from "@/app/lib/db";
import { dailyOverrides } from "@/app/lib/daily";
import { dateOf, dayNumber, ITEM_KINDS, POOL_SIZE, type Daily, type DailyOverride, type ItemKind } from "@content/daily";
import { dailyFor, movesFor, WORLDS } from "@content/dailyWorlds";

export const metadata: Metadata = { title: "Admin · Daily", robots: { index: false } };
export const dynamic = "force-dynamic";

/*
 * The Daily, two weeks at a time: what each day picked, and a form to change
 * any of it for one day. Saved changes go in daily_overrides; a field left on
 * "Auto" keeps the day's own pick.
 */

const DAYS_SHOWN = 14;

/** A day's map in a line: its mobs, its elites, then the boss. */
function fightsText(d: Daily): string {
  const names = (kind: string) => d.map.nodes.filter((n) => n.kind === kind).map((n) => `${n.emoji} ${n.name}`).join(", ");
  return `${names("enemy")} · elites ${names("elite")} · boss ${d.boss.emoji} ${d.boss.name}`;
}

/** The map's gathering spots. */
function gatherText(d: Daily): string {
  return d.map.nodes.flatMap((n) => (n.gather ? [n.gather.place] : [])).join(", ");
}
const KIND_LABELS: Record<ItemKind, string> = {
  weapon: "Weapon (+ATK)", heavy: "Heavy weapon (+ATK, −SPD)", armour: "Armour (+DEF, +HP)", boots: "Boots (+SPD)",
  charm: "Charm (+crit)", teacher: "Gear that teaches a move", potion: "Potion (heals, ×3)", elixir: "Elixir (opens fights enraged)",
  featured: "Featured epic (big, pricey)", bomb: "Bomb (ignores defence)", tonic: "Tonic of Might (+ATK)", draught: "Energy Draught (+3 energy)",
  antidote: "Antidote (cleanse + heal)",
};
const field = "rounded-sm border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm";

/** Saves one day's changes, keeping only ids that exist in the chosen world. */
async function saveDay(form: FormData) {
  "use server";
  if (!(await isAdmin())) return;
  const day = Number(form.get("day"));
  if (!Number.isInteger(day) || day < 1) return;
  const pick = (k: string) => String(form.get(k) ?? "").trim();
  const chosen = WORLDS.find((w) => w.id === pick("world"));
  const world = chosen ?? WORLDS.find((w) => w.id === dailyFor(day).worldId)!;
  const o: DailyOverride = chosen ? { world: chosen.id } : {};
  const { enemies } = world.content.combat;
  if (enemies[pick("boss")]) o.boss = pick("boss");
  const mobs = [pick("mob1"), pick("mob2")];
  if (mobs.every((id) => enemies[id]) && mobs[0] !== mobs[1]) o.mobs = mobs;
  const [a, p] = pick("place").split("/");
  if (a && p && world.content.gathering.activities[a]?.locations[p]) o.place = `${a}/${p}`;
  const kinds = ITEM_KINDS.filter((k) => form.getAll("kinds").includes(k));
  if (kinds.length) o.kinds = kinds;
  const playable = movesFor(world.id).map((m) => m.id);
  const moves = form.getAll("moves").map(String).filter((id) => playable.includes(id));
  if (moves.length) o.moves = moves.slice(0, POOL_SIZE - 1);
  if (Object.keys(o).length === 0) await dbQuery(`DELETE FROM daily_overrides WHERE day = $1`, [day]);
  else {
    await dbQuery(
      `INSERT INTO daily_overrides (day, override) VALUES ($1, $2)
       ON CONFLICT (day) DO UPDATE SET override = $2, updated_at = NOW()`,
      [day, JSON.stringify(o)],
    );
  }
  revalidatePath("/admin/daily");
}

async function resetDay(form: FormData) {
  "use server";
  if (!(await isAdmin())) return;
  await dbQuery(`DELETE FROM daily_overrides WHERE day = $1`, [Number(form.get("day"))]);
  revalidatePath("/admin/daily");
}

export default async function AdminDaily({ searchParams }: { searchParams: Promise<{ edit?: string; world?: string }> }) {
  if (!(await isAdmin())) notFound();
  const today = dayNumber();
  const params = await searchParams;
  const edit = Number(params.edit) || null;
  const overrides = await dailyOverrides(today - 1, Math.max(today + DAYS_SHOWN, edit ?? 0));
  const days = Array.from({ length: DAYS_SHOWN + 1 }, (_, i) => today - 1 + i).filter((d) => d > 0);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <p className="text-sm text-[var(--muted)]"><Link href="/admin" className="underline">Admin</Link> › Daily</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Daily</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Today is #{today} ({dateOf(today)}, UTC). Edit a day to change what it picks; anything left on Auto stays as the day chose.
        Play any day early from its link.
      </p>

      {edit && <Editor day={edit} override={overrides.get(edit) ?? {}} worldParam={params.world} />}

      <div className="frame mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[var(--muted)]">
            <tr>
              {["Day", "World", "Gather", "Fights", "Shop", ""].map((h) => <th key={h} className="px-3 py-2 font-normal">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const d = dailyFor(day, overrides.get(day));
              return (
                <tr key={day} className={`border-t border-[var(--border)] ${day === today ? "bg-[var(--accent)]/5" : ""}`}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    #{day} <span className="text-xs text-[var(--muted)]">{dateOf(day).slice(5)}</span>
                    {day === today && <span className="ml-1 text-xs text-[var(--gold)]">today</span>}
                    {overrides.has(day) && <span className="ml-1 text-xs text-[var(--accent)]">edited</span>}
                  </td>
                  <td className="px-3 py-2">{d.world}</td>
                  <td className="px-3 py-2">{gatherText(d)}</td>
                  <td className="px-3 py-2">{fightsText(d)}</td>
                  <td className="px-3 py-2">{d.shop.map((s) => s.emoji).join(" ")}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Link href={`/admin/daily?edit=${day}`} className="underline">Edit</Link>
                    {" · "}
                    <Link href={`/daily?day=${day}`} className="underline">Play</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

/** One day's form. The world is picked first (it reloads the page), since every other choice comes from it. */
function Editor({ day, override, worldParam }: { day: number; override: DailyOverride; worldParam?: string | undefined }) {
  const worldId = WORLDS.some((w) => w.id === worldParam) ? worldParam! : override.world;
  // A different world than the saved one starts its picks over.
  const kept = worldId === override.world ? override : { world: worldId };
  const d = dailyFor(day, kept);
  const world = WORLDS.find((w) => w.id === d.worldId)!;
  const enemies = Object.values(world.content.combat.enemies);
  const places = Object.values(world.content.gathering.activities).flatMap((a) => Object.values(a.locations).map((l) => ({ id: `${a.id}/${l.id}`, label: `${a.emoji} ${a.name}: ${l.emoji} ${l.name}` })));
  const moves = movesFor(world.id);

  const select = (name: string, value: string | undefined, options: Array<{ id: string; label: string }>) => (
    <select name={name} defaultValue={value ?? ""} className={field}>
      <option value="">Auto</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
  const enemyOptions = enemies.map((e) => ({ id: e.id, label: `${e.emoji} ${e.name}${e.boss ? " (world boss)" : ""}` }));

  return (
    <section className="frame mt-6 space-y-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg">Day #{day} · {dateOf(day)}</h2>
        <Link href={`/daily?day=${day}`} className="text-sm underline">Play this day</Link>
      </div>
      <p className="text-sm text-[var(--muted)]">
        Now: {gatherText(d)} · {fightsText(d)} · {d.shrine.emoji} {d.shrine.name} · shop {d.shop.map((s) => s.emoji).join(" ")}
      </p>

      <form method="get" action="/admin/daily" className="flex items-center gap-2 text-sm">
        <input type="hidden" name="edit" value={day} />
        <span className="w-28 text-[var(--muted)]">World</span>
        <select name="world" defaultValue={kept.world ?? ""} className={field}>
          <option value="">Auto ({WORLDS[(day - 1) % WORLDS.length]!.name})</option>
          {WORLDS.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <button className="rounded-sm border border-[var(--border)] px-2 py-1">Choose</button>
      </form>

      <form action={saveDay} className="space-y-3 text-sm">
        <input type="hidden" name="day" value={day} />
        <input type="hidden" name="world" value={kept.world ?? ""} />
        <label className="flex items-center gap-2"><span className="w-28 text-[var(--muted)]">Boss</span>{select("boss", kept.boss, enemyOptions)}</label>
        <div className="flex items-center gap-2">
          <span className="w-28 text-[var(--muted)]">Two of the mobs</span>
          {select("mob1", kept.mobs?.[0], enemyOptions)}
          {select("mob2", kept.mobs?.[1], enemyOptions)}
          <span className="text-xs text-[var(--muted)]">both, or neither</span>
        </div>
        <label className="flex items-center gap-2"><span className="w-28 text-[var(--muted)]">First gathering</span>{select("place", kept.place, places)}</label>

        <fieldset>
          <legend className="text-[var(--muted)]">Shop <span className="text-xs">(none ticked: the day&apos;s own potion, effect item and four gear; names come from the world)</span></legend>
          <div className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-3">
            {ITEM_KINDS.map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" name="kinds" value={k} defaultChecked={kept.kinds?.includes(k)} />
                {KIND_LABELS[k]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-[var(--muted)]">Moves on offer <span className="text-xs">(Attack always; none ticked: the day&apos;s own; up to {POOL_SIZE - 1})</span></legend>
          <div className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-3">
            {moves.map((m) => (
              <label key={m.id} className="flex items-center gap-2">
                <input type="checkbox" name="moves" value={m.id} defaultChecked={kept.moves?.includes(m.id)} />
                {m.emoji} {m.name}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex gap-2">
          <button type="submit" className="btn px-4 py-1.5">Save day #{day}</button>
          <Link href="/admin/daily" className="rounded-sm border border-[var(--border)] px-3 py-1.5">Close</Link>
        </div>
      </form>
      <form action={resetDay}>
        <input type="hidden" name="day" value={day} />
        <button type="submit" className="text-xs text-[var(--muted)] underline">Reset this day to its own picks</button>
      </form>
    </section>
  );
}
