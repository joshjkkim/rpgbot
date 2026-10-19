import type { DashboardConfig } from "@/app/lib/dashboardConfig";

/*
 * Where an item comes from and what it is for, worked out from the config the
 * dashboard already holds. Nothing is stored: every link is a reverse lookup
 * over shop, combat, gathering, quests, achievements and other items.
 */

/** A dashboard page (`page`) or another item (`itemId`) a link points to. */
export type ItemLink = { label: string; detail?: string; page?: string; itemId?: string };

type Item = {
  name?: string; emoji?: string; price?: number; hidden?: boolean; categoryId?: string;
  equipable?: boolean; equipSlot?: string; sellPrice?: number | null; tradeable?: boolean;
  tool?: { activityId: string; tier?: number };
  effects?: { stats?: Record<string, number | undefined> };
  actions?: Record<number, { type: string; itemId?: string; quantity?: number; statId?: string; amount?: number }>;
};
type Loot = { itemId: string; chance: number };

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

export function itemConnections(config: DashboardConfig, id: string) {
  const c = config as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped config JSON
  const items = (c.shop?.items ?? {}) as Record<string, Item>;
  const item = items[id];
  const name = (i?: Item, fallback = "") => `${i?.emoji ? `${i.emoji} ` : ""}${i?.name ?? fallback}`;
  const from: ItemLink[] = [];
  const to: ItemLink[] = [];
  const warnings: string[] = [];
  if (!item) return { from, to, warnings };

  // ── Comes from ──
  if (!item.hidden && (item.price ?? 0) > 0) {
    const cat = c.shop?.categories?.[item.categoryId ?? ""];
    from.push({ label: "Shop", detail: `${item.price} gold${cat ? ` · ${cat.name}` : ""}`, page: "shop" });
  }
  for (const e of Object.values(c.combat?.enemies ?? {}) as Array<{ name: string; emoji: string; boss?: boolean; drops?: Array<{ itemId: string; chance: number; quantity?: number }> }>) {
    for (const d of e.drops ?? []) {
      if (d.itemId === id) from.push({ label: `${e.emoji} ${e.name}`, detail: `${e.boss ? "world boss, " : ""}${pct(d.chance)} drop`, page: "combat" });
    }
  }
  for (const a of Object.values(c.gathering?.activities ?? {}) as Array<{ name: string; emoji: string; locations?: Record<string, { name: string; loot?: Loot[] }> }>) {
    for (const l of Object.values(a.locations ?? {})) {
      const live = (l.loot ?? []).filter((x) => x.chance > 0 && items[x.itemId]);
      const total = live.reduce((s, x) => s + x.chance, 0);
      const mine = live.filter((x) => x.itemId === id).reduce((s, x) => s + x.chance, 0);
      if (mine > 0) from.push({ label: `${a.emoji} ${a.name}`, detail: `${l.name}, ${pct(mine / total)} of finds`, page: "gathering" });
    }
  }
  for (const q of Object.values(c.quests?.quests ?? {}) as Array<{ name: string; reward?: Record<string, { itemId?: string; quantity?: number }> }>) {
    for (const r of Object.values(q.reward ?? {})) {
      if (r.itemId === id) from.push({ label: `Quest: ${q.name}`, detail: `reward ×${r.quantity ?? 1}`, page: "quests" });
    }
  }
  for (const a of Object.values(c.achievements?.achievements ?? {}) as Array<{ name: string; reward?: { itemId?: string; quantity?: number } }>) {
    if (a.reward?.itemId === id) from.push({ label: `Achievement: ${a.name}`, detail: `reward ×${a.reward.quantity ?? 1}`, page: "achievements" });
  }
  for (const [otherId, other] of Object.entries(items)) {
    for (const act of Object.values(other.actions ?? {})) {
      if (act.type === "giveItem" && act.itemId === id) from.push({ label: name(other, otherId), detail: `gives ×${act.quantity ?? 1} when used`, itemId: otherId });
    }
  }

  // ── Used for ──
  if (item.equipable) to.push({ label: "Gear", detail: `${item.equipSlot ?? "accessory"} slot` });
  if (item.tool) {
    const act = c.gathering?.activities?.[item.tool.activityId];
    if (act) to.push({ label: `Tool for ${act.emoji} ${act.name}`, detail: `tier ${item.tool.tier ?? 1}`, page: "gathering" });
    else warnings.push("It's a tool for an activity that no longer exists, so it does nothing.");
  }
  for (const act of Object.values(item.actions ?? {})) {
    if (act.type === "giveItem") {
      const other = items[act.itemId ?? ""];
      if (other) to.push({ label: `Gives ${name(other, act.itemId)}`, detail: `×${act.quantity ?? 1} when used`, itemId: act.itemId });
      else warnings.push("Using it gives an item that no longer exists.");
    } else if (act.type === "giveStat") {
      to.push({ label: `Use: gives ${act.amount ?? 0} ${act.statId || "of a stat"}` });
    } else {
      to.push({ label: `Use: ${act.type === "assignRole" ? "gives a role" : act.type === "removeRole" ? "removes a role" : "posts a message"}` });
    }
  }
  if ((item.sellPrice ?? 0) > 0) to.push({ label: "Sells back", detail: `${item.sellPrice} gold` });
  if (item.tradeable) to.push({ label: "Trading and gifting" });

  // ── Warnings ──
  if (from.length === 0) warnings.unshift("Nothing gives this item: it isn't sold, dropped, found or rewarded anywhere.");
  const stats = Object.values(item.effects?.stats ?? {}).some((v) => v);
  if (stats && !item.equipable) warnings.push("It has stats but can't be equipped, so they never apply.");

  return { from, to, warnings };
}
