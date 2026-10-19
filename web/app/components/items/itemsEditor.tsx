"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Section } from "@/app/components/ui/form";
import { ContentBrowser, idFromName } from "@/app/components/ui/slots";
import ItemTooltip, { RARITIES } from "@/app/components/shop/itemTooltip";
import type { ShopConfig, shopItemConfig } from "@/app/components/shop/shopBasicsEditor";
import type { DashboardConfig } from "@/app/lib/dashboardConfig";
import ItemForm, { dropRetiredActions } from "./itemForm";
import { itemConnections, type ItemLink } from "./itemConnections";

type Filter = "all" | "shop" | "drop" | "gear" | "tool" | "usable" | "material";

const FILTERS: Array<{ id: Filter; label: string; test: (i: shopItemConfig) => boolean }> = [
  { id: "all", label: "All", test: () => true },
  { id: "shop", label: "Sold in shop", test: (i) => !i.hidden && (i.price ?? 0) > 0 },
  { id: "drop", label: "Not sold", test: (i) => !!i.hidden || !(i.price ?? 0) },
  { id: "gear", label: "Gear", test: (i) => !!i.equipable },
  { id: "tool", label: "Tools", test: (i) => !!i.tool },
  { id: "usable", label: "Usable", test: (i) => Object.keys(i.actions ?? {}).length > 0 },
  { id: "material", label: "Materials", test: (i) => !i.equipable && !i.tool && !Object.keys(i.actions ?? {}).length },
];

function Links({ title, links, guildId, onItem }: { title: string; links: ItemLink[]; guildId: string; onItem: (id: string) => void }) {
  const chip = "rounded-sm border border-[var(--border)] bg-black/30 px-2 py-1 text-xs";
  return (
    <div>
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--muted)]">{title}</p>
      {links.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">Nothing yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {links.map((l, i) => {
            const body = <>{l.label}{l.detail && <span className="text-[var(--muted)]"> · {l.detail}</span>}</>;
            return (
              <li key={i}>
                {l.itemId ? (
                  <button type="button" onClick={() => onItem(l.itemId!)} className={`${chip} hover:border-[var(--accent)]`}>{body}</button>
                ) : l.page ? (
                  <Link href={`/dashboard/${guildId}/${l.page}`} className={`${chip} inline-block hover:border-[var(--accent)]`}>{body}</Link>
                ) : (
                  <span className={`${chip} inline-block`}>{body}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function ItemsEditor({
  guildId,
  config,
  onChange,
}: {
  guildId: string;
  config: DashboardConfig;
  /** The shop section with its items updated. */
  onChange: (next: ShopConfig) => void;
}) {
  const shop = useMemo(() => dropRetiredActions(config.shop ?? {}), [config.shop]);
  const items = shop.items ?? {};
  const [filter, setFilter] = useState<Filter>("all");
  const [picked, setSelected] = useState<string | null>(null);
  // An item deleted while open simply stops being selected.
  const selected = picked && items[picked] ? picked : null;

  const upsert = (item: shopItemConfig) => onChange({ ...shop, items: { ...items, [item.id]: item } });

  const categoryOptions = useMemo(
    () => [
      { value: "", label: "— none —" },
      ...Object.entries(shop.categories ?? {}).map(([id, c]) => ({ value: id, label: c.name || id })),
    ],
    [shop.categories],
  );
  const activities = ((config.gathering?.activities ?? {}) as Record<string, { name?: string; emoji?: string }>);

  const test = FILTERS.find((f) => f.id === filter)!.test;
  const entries = Object.entries(items)
    .filter(([id, i]) => test(i) || id === selected)
    .sort((a, b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0]));

  function jump(id: string) {
    setFilter("all");
    setSelected(id);
  }

  return (
    <Section title="Items" description="Everything members can own. Click an item to see where it comes from, what it's for, and to edit it.">
      <ContentBrowser<shopItemConfig>
        entries={entries}
        selected={selected}
        onSelect={setSelected}
        newLabel="New item"
        empty="No items yet. Make one, or add a starter pack."
        above={
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-sm border px-2 py-1 text-xs transition-colors ${
                  filter === f.id ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--border-bright)]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        }
        look={(id, item) => ({
          icon: item.emoji,
          label: item.name || id,
          colour: RARITIES.find((r) => r.value === item.rarity)?.colour,
          faded: item.hidden,
        })}
        tooltip={(_, item) => <ItemTooltip item={item} />}
        onCreate={(name) => {
          const id = idFromName(name, Object.keys(items));
          upsert({ id, name, categoryId: Object.keys(shop.categories ?? {})[0] ?? "", price: 0, hidden: true });
          setFilter("all");
          return id;
        }}
        onRemove={(id) => {
          const next = { ...items };
          delete next[id];
          onChange({ ...shop, items: next });
        }}
        renderItem={(id, item) => {
          const { from, to, warnings } = itemConnections(config, id);
          return (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
                <ItemTooltip item={item} />
                <div className="space-y-4">
                  <Links title="Comes from" links={from} guildId={guildId} onItem={jump} />
                  <Links title="Used for" links={to} guildId={guildId} onItem={jump} />
                </div>
              </div>
              {warnings.length > 0 && (
                <ul className="space-y-1 rounded-sm border-l-2 border-[#c96b5b] bg-[#c96b5b]/10 px-3 py-2 text-sm">
                  {warnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              )}
              <ItemForm item={item} onChange={upsert} allItems={items} categoryOptions={categoryOptions} activities={activities} />
            </div>
          );
        }}
      />
    </Section>
  );
}
