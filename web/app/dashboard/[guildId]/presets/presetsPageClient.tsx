"use client";

import { useState } from "react";
import Link from "next/link";
import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import { RARITIES } from "@/app/components/shop/itemTooltip";
import {
  applyPack,
  hasEntry,
  missingCount,
  PACK_FEATURES,
  STARTER_PACKS,
  type GuildConfigJson,
  type StarterPack,
} from "@/app/lib/starterPacks";

const FEATURE_NAMES: Record<(typeof PACK_FEATURES)[number], string> = {
  shop: "Shop",
  combat: "Combat",
  quests: "Quests",
  achievements: "Achievements",
};

type Row = { id: string; label: string; detail?: string; colour?: string };

function PackColumn({ title, rows, taken }: { title: string; rows: Row[]; taken: (id: string) => boolean }) {
  return (
    <div>
      <h3 className="text-sm text-[var(--accent)]">
        {title} <span className="font-sans text-xs text-[var(--muted)]">({rows.length})</span>
      </h3>
      <ul className="mt-2 space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.id} className={taken(r.id) ? "text-[var(--muted)]" : ""}>
            <span style={taken(r.id) ? undefined : { color: r.colour }}>{r.label}</span>
            {r.detail && <span className="text-xs text-[var(--muted)]"> · {r.detail}</span>}
            {taken(r.id) && <span className="text-xs"> · keeps yours</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PackCard({ pack, config, saving, onAdd }: { pack: StarterPack; config: GuildConfigJson; saving: boolean; onAdd: () => void }) {
  const { shop, combat, quests, achievements } = pack.content;
  const missing = missingCount(config, pack);
  const featuresOff = PACK_FEATURES.filter((f) => !config?.[f]?.enabled);
  const upToDate = missing === 0 && featuresOff.length === 0;

  const items: Row[] = Object.entries(shop.items ?? {}).map(([id, item]) => ({
    id,
    label: `${item.emoji ?? ""} ${item.name}`.trim(),
    detail: item.hidden ? "drop only" : `${item.price} gold`,
    colour: (RARITIES.find((r) => r.value === item.rarity) ?? RARITIES[1]).colour,
  }));
  const enemies: Row[] = Object.entries(combat.enemies ?? {}).map(([id, e]) => ({
    id,
    label: `${e.emoji} ${e.name}`,
    detail: `level ${e.minLevel}${e.maxLevel == null ? "+" : `–${e.maxLevel}`}`,
  }));
  const questRows: Row[] = Object.entries(quests.quests ?? {}).map(([id, q]) => ({ id, label: q.name }));
  const achievementRows: Row[] = Object.entries(achievements.achievements ?? {}).map(([id, a]) => ({ id, label: a.name }));

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
          {saving ? "Adding…" : upToDate ? "Already added" : "Add to my server"}
        </button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <PackColumn title="Items" rows={items} taken={(id) => hasEntry(config, "shop", "items", id)} />
        <PackColumn title="Enemies" rows={enemies} taken={(id) => hasEntry(config, "combat", "enemies", id)} />
        <PackColumn title="Quests" rows={questRows} taken={(id) => hasEntry(config, "quests", "quests", id)} />
        <PackColumn
          title="Achievements"
          rows={achievementRows}
          taken={(id) => hasEntry(config, "achievements", "achievements", id)}
        />
      </div>
    </section>
  );
}

export default function PresetsPageClient({ guildId }: { guildId: string }) {
  const { config, loading, saving, error, save } = useGuildConfig(guildId);
  const [notice, setNotice] = useState<string | null>(null);

  async function add(pack: StarterPack) {
    setNotice(null);
    const { config: next, added } = applyPack(config, pack);
    if (await save(next)) {
      setNotice(`${pack.name} added: ${added} new ${added === 1 ? "entry" : "entries"}.`);
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5">
      <header className="border-b border-[var(--border)] pb-4">
        <h1 className="text-2xl">Starter packs</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Ready-made items, enemies, quests and achievements to get your server going. Adding a pack never
          changes what you have already made: anything with the same ID as yours is skipped.
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
          {notice} Tweak anything in{" "}
          <Link href={`/dashboard/${guildId}/shop`} className="text-[var(--accent)] underline-offset-2 hover:underline">
            Economy
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
        STARTER_PACKS.map((pack) => (
          <PackCard key={pack.id} pack={pack} config={config} saving={saving} onAdd={() => add(pack)} />
        ))}
    </main>
  );
}
