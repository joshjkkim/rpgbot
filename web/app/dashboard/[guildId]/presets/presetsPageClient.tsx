"use client";

import { useState } from "react";
import Link from "next/link";
import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import { RARITIES } from "@/app/components/shop/itemTooltip";
import {
  applyPack,
  missingCount,
  PACK_FEATURES,
  packFeatures,
  type GuildConfigJson,
  type StarterPack,
} from "@content/packs";
import { addEntries, entryOf, plan, type Kind, type Ref } from "@content/library";

const FEATURE_NAMES: Record<(typeof PACK_FEATURES)[number], string> = {
  shop: "Shop",
  combat: "Combat",
  quests: "Quests",
  achievements: "Achievements",
  gathering: "Gathering",
  crafting: "Crafting",
};

type Row = { id: string; label: string; detail?: string; colour?: string };

const refKey = (r: Ref) => `${r.kind}:${r.id}`;

/** A pack's entries of one kind. Tick any to add them on their own, with what they need. */
function PackColumn({ title, kind, rows, config, picked, onToggle }: {
  title: string;
  kind: Kind;
  rows: Row[];
  config: GuildConfigJson;
  picked: Set<string>;
  onToggle: (ref: Ref) => void;
}) {
  if (!rows.length) return null;
  return (
    <div>
      <h3 className="text-sm text-[var(--accent)]">
        {title} <span className="font-sans text-xs text-[var(--muted)]">({rows.length})</span>
      </h3>
      <ul className="mt-2 space-y-1 text-sm">
        {rows.map((r) => {
          const ref = { kind, id: r.id };
          const taken = !!entryOf(config, ref);
          return (
            <li key={r.id} className={taken ? "text-[var(--muted)]" : ""}>
              <label className={`flex items-baseline gap-2 ${taken ? "" : "cursor-pointer"}`}>
                <input
                  type="checkbox"
                  className="translate-y-0.5 accent-[var(--accent)]"
                  disabled={taken}
                  checked={taken || picked.has(refKey(ref))}
                  onChange={() => onToggle(ref)}
                />
                <span>
                  <span style={taken ? undefined : { color: r.colour }}>{r.label}</span>
                  {r.detail && <span className="text-xs text-[var(--muted)]"> · {r.detail}</span>}
                  {taken && <span className="text-xs"> · you have it</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const named = (e: { emoji?: string; name?: string } | undefined, id: string) => `${e?.emoji ?? ""} ${e?.name ?? id}`.trim();

function PackCard({ pack, config, saving, onAdd, onAddPicks }: {
  pack: StarterPack;
  config: GuildConfigJson;
  saving: boolean;
  onAdd: () => void;
  onAddPicks: (picks: Ref[]) => Promise<boolean>;
}) {
  const { shop, combat, quests, achievements, gathering, crafting, collections } = pack.content;
  const missing = missingCount(config, pack);
  const featuresOff = packFeatures(pack).filter((f) => !config?.[f]?.enabled);
  const upToDate = missing === 0 && featuresOff.length === 0;
  const [picks, setPicks] = useState<Ref[]>([]);
  const picked = new Set(picks.map(refKey));
  const toggle = (ref: Ref) => setPicks((p) => (picked.has(refKey(ref)) ? p.filter((x) => refKey(x) !== refKey(ref)) : [...p, ref]));
  const adds = plan(config, pack.content, picks);
  const extras = adds.filter((a) => !picked.has(refKey(a)));

  const items: Row[] = Object.entries(shop.items ?? {}).map(([id, item]) => ({
    id,
    label: named(item, id),
    detail: item.hidden ? "drop only" : `${item.price} gold`,
    colour: (RARITIES.find((r) => r.value === item.rarity) ?? RARITIES[1]).colour,
  }));
  const enemies: Row[] = Object.entries(combat.enemies ?? {}).map(([id, e]) => ({
    id,
    label: named(e, id),
    detail: e.boss ? "world boss" : `level ${e.minLevel}${e.maxLevel == null ? "+" : `–${e.maxLevel}`}`,
  }));
  const rows = (entries: Record<string, { name?: string; emoji?: string }> | undefined, detail?: (e: Record<string, unknown>) => string) =>
    Object.entries(entries ?? {}).map(([id, e]) => ({ id, label: named(e, id), ...(detail && { detail: detail(e as Record<string, unknown>) }) }));
  const count = (key: string, noun: string) => (e: Record<string, unknown>) => `${Object.keys((e[key] ?? {}) as object).length} ${noun}`;

  return (
    <section className="frame space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-xl">{pack.name}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{pack.description}</p>
          {featuresOff.length > 0 && (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Also turns on: {featuresOff.map((f) => FEATURE_NAMES[f]).join(", ")}.
            </p>
          )}
        </div>
        <button className="btn shrink-0 px-4 py-2 text-sm" disabled={saving || upToDate} onClick={onAdd}>
          {saving ? "Adding…" : upToDate ? "Already added" : "Add the whole pack"}
        </button>
      </div>
      <p className="text-xs text-[var(--muted)]">Or tick just the pieces you want: anything they need comes with them.</p>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <PackColumn title="Items" kind="items" rows={items} config={config} picked={picked} onToggle={toggle} />
        <PackColumn title="Enemies" kind="enemies" rows={enemies} config={config} picked={picked} onToggle={toggle} />
        <PackColumn title="Places" kind="places" rows={rows(combat.places)} config={config} picked={picked} onToggle={toggle} />
        <PackColumn title="Quests" kind="quests" rows={rows(quests.quests)} config={config} picked={picked} onToggle={toggle} />
        <PackColumn title="Achievements" kind="achievements" rows={rows(achievements.achievements)} config={config} picked={picked} onToggle={toggle} />
        <PackColumn title="Gathering" kind="activities" rows={rows(gathering?.activities, count("locations", "locations"))} config={config} picked={picked} onToggle={toggle} />
        <PackColumn title="Crafting" kind="stations" rows={rows(crafting?.stations, count("recipes", "recipes"))} config={config} picked={picked} onToggle={toggle} />
        <PackColumn title="Collections" kind="collections" rows={rows(collections?.sets)} config={config} picked={picked} onToggle={toggle} />
      </div>

      {picks.length > 0 && (
        <div className="sticky bottom-4 z-30 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-[var(--accent)]/60 bg-[#14100c]/95 px-4 py-3 shadow-[0_4px_16px_rgb(0_0_0/0.6)] backdrop-blur">
          <p className="min-w-0 flex-1 text-sm">
            Adds {picks.map((r) => named(entryOf(pack.content, r), r.id)).join(", ")}
            {extras.length > 0 && (
              <span className="text-[var(--muted)]">
                , plus what {picks.length === 1 ? "it needs" : "they need"}: {extras.map((r) => named(entryOf(pack.content, r), r.id)).join(", ")}
              </span>
            )}
            .
          </p>
          <div className="flex shrink-0 gap-2">
            <button type="button" className="px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)]" onClick={() => setPicks([])}>
              Clear
            </button>
            <button className="btn px-4 py-2 text-sm" disabled={saving} onClick={async () => { if (await onAddPicks(picks)) setPicks([]); }}>
              {saving ? "Adding…" : `Add ${adds.length} ${adds.length === 1 ? "entry" : "entries"}`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function PresetsPageClient({ guildId, packs }: { guildId: string; packs: StarterPack[] }) {
  const { config: typed, loading, saving, error, save } = useGuildConfig(guildId);
  // Packs work section by section on plain JSON, without the editors' types.
  const config = typed as GuildConfigJson | null;
  const [notice, setNotice] = useState<string | null>(null);

  async function add(pack: StarterPack) {
    setNotice(null);
    const { config: next, added } = applyPack(config, pack);
    if (await save(next)) {
      setNotice(`${pack.name} added: ${added} new ${added === 1 ? "entry" : "entries"}.`);
    }
  }

  async function addPicks(pack: StarterPack, picks: Ref[]) {
    setNotice(null);
    const { config: next, added } = addEntries(config, pack.content, picks);
    const ok = await save(next);
    if (ok) setNotice(`Added ${added.length} ${added.length === 1 ? "entry" : "entries"} from ${pack.name}.`);
    return !!ok;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5">
      <header className="border-b border-[var(--border)] pb-4">
        <h1 className="text-2xl">Library</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Ready-made content: add a whole starter pack, or only the pieces you want, like one enemy, a crafting
          station or a quest. Adding never changes what you have already made: anything with the same ID as yours
          is kept as yours.
        </p>
      </header>

      {loading && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
          Loading configuration…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-300">{error}</div>
      )}

      {notice && (
        <div className="frame p-4 text-sm">
          {notice} Your server is ready to play: members can try <span className="font-mono">/fight</span>,{" "}
          <span className="font-mono">/shop</span> and <span className="font-mono">/quests</span> now. Tweak anything in{" "}
          <Link href={`/dashboard/${guildId}/items`} className="text-[var(--accent)] underline-offset-2 hover:underline">
            Items
          </Link>
          ,{" "}
          <Link href={`/dashboard/${guildId}/combat`} className="text-[var(--accent)] underline-offset-2 hover:underline">
            Combat
          </Link>{" "}
          and the other pages.
        </div>
      )}

      {!loading &&
        config &&
        packs.map((pack) => (
          <PackCard key={pack.id} pack={pack} config={config} saving={saving} onAdd={() => add(pack)} onAddPicks={(picks) => addPicks(pack, picks)} />
        ))}
    </main>
  );
}
