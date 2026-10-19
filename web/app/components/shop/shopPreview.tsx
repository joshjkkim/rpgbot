"use client";

import { useState } from "react";
import { DButton, DiscordMessage, Sub } from "@/app/components/ui/discordMock";
import type { ShopConfig, shopItemConfig } from "./shopBasicsEditor";

/*
 * /shop as members see it, drawn from the unsaved config so owners see a change
 * before saving. It mirrors havocish/src/commands/user/shop.ts: categories in
 * sort order, hidden ones left out, five to a page, and each item's effects line
 * (havocish/src/ui/canvas/itemCard.ts, itemEffects). Change one, change the other.
 */

const PAGE_SIZE = 5;
const STAT_NAMES = { hp: "Health", atk: "Attack", def: "Defense", spd: "Speed" } as const;
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const boost = (m: number | undefined, what: string) =>
  m == null || m === 1 ? null : `Equip: Fights award ${Math.round(Math.abs(m - 1) * 100)}% ${m > 1 ? "more" : "less"} ${what}.`;

function effectsLine(item: shopItemConfig) {
  const { stats = {}, boosts = {}, cosmetic = {} } = item.effects ?? {};
  const statLines = (Object.keys(STAT_NAMES) as Array<keyof typeof STAT_NAMES>).filter((k) => stats[k]).map((k) => `${signed(stats[k]!)} ${STAT_NAMES[k]}`);
  const equip = [
    stats.crit ? `Equip: ${signed(stats.crit)}% critical strike chance.` : null,
    boost(boosts.xpMultiplier, "XP"),
    boost(boosts.goldMultiplier, "gold"),
    cosmetic.title ? `Equip: Grants the title "${cosmetic.title}".` : null,
  ].filter(Boolean) as string[];
  const use = Object.values(item.actions ?? {}).map((a) =>
    a.type === "assignRole" ? "Use: Grants a server role."
    : a.type === "removeRole" ? "Use: Removes a server role."
    : a.type === "sendMessage" ? "Use: Posts a message."
    : a.type === "giveStat" ? `Use: Gives ${a.amount ?? 0} ${a.statId || "of a stat"}.`
    : `Use: Gives ${a.quantity ?? 1} x ${a.itemId || "an item"}.`);
  return [...(item.tool ? [`Tool, tier ${item.tool.tier ?? 1}`] : []), ...(item.equipable ? [...statLines, ...equip] : []), ...use].join(" · ");
}

export default function ShopPreview({ shop, goldIcon, serverName }: { shop: ShopConfig; goldIcon: string; serverName: string }) {
  const [view, setView] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const balance = <p className="text-sm">You have <b>1,250 {goldIcon}</b>.</p>;

  // Role-limited categories show, since the owner can see everything; the bot hides them from members without the role.
  const categories = Object.entries(shop.categories ?? {})
    .filter(([, c]) => !c.hidden)
    .sort(([ai, a], [bi, b]) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.name || ai).localeCompare(b.name || bi));
  const items = Object.values(shop.items ?? {});
  const open = categories.find(([id]) => id === view);

  if (!shop.enabled) {
    return (
      <DiscordMessage>
        <p className="font-semibold text-white">🛒 {serverName} Shop</p>
        {balance}
        <p className="mt-2 font-semibold text-white">Shop Closed</p>
        <p className="text-sm">The shopkeeper hasn&apos;t opened for business yet.</p>
      </DiscordMessage>
    );
  }

  if (open) {
    const [id, cat] = open;
    const shelf = items.filter((i) => i.categoryId === id && !i.hidden);
    const pages = Math.max(1, Math.ceil(shelf.length / PAGE_SIZE));
    const p = Math.min(page, pages - 1);
    return (
      <DiscordMessage>
        <p className="font-semibold text-white">{cat.icon || "📦"} {cat.name}</p>
        {cat.description && <p className="text-sm">{cat.description}</p>}
        {balance}
        <div className="mt-2 space-y-3 border-t border-white/10 pt-2">
          {shelf.length === 0 && <p className="text-sm italic">Nothing on this shelf yet.</p>}
          {shelf.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE).map((item) => {
            const effects = effectsLine(item);
            const details = [
              item.stock != null ? `Stock: ${item.stock}` : "",
              item.minLevel ? `Level ${item.minLevel}+` : "",
              item.requiresRoleIds?.length ? "Role required" : "",
            ].filter(Boolean).join(" · ");
            return (
              <div key={item.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-white">{item.emoji || "•"} {item.name}</p>
                  {item.description && <Sub>{item.description.length > 150 ? `${item.description.slice(0, 147)}...` : item.description}</Sub>}
                  {effects && <p>{effects}</p>}
                  {details && <Sub>{details}</Sub>}
                </div>
                <div className="shrink-0">
                  <DButton colour="green" disabled={item.stock === 0}>{item.stock === 0 ? "Sold out" : `Buy · ${item.price} ${goldIcon}`}</DButton>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <DButton onClick={() => { setView(null); setPage(0); }}>← Back</DButton>
          {pages > 1 && (
            <>
              <DButton onClick={() => setPage(Math.max(0, p - 1))} disabled={p === 0}>◀</DButton>
              <DButton disabled>{`Page ${p + 1}/${pages}`}</DButton>
              <DButton onClick={() => setPage(Math.min(pages - 1, p + 1))} disabled={p === pages - 1}>▶</DButton>
            </>
          )}
        </div>
      </DiscordMessage>
    );
  }

  return (
    <DiscordMessage>
      <p className="font-semibold text-white">🛒 {serverName} Shop</p>
      {balance}
      <div className="mt-2 space-y-3 border-t border-white/10 pt-2">
        {categories.length === 0 && <p className="text-sm">The shelves are bare. Nothing has been stocked yet.</p>}
        {categories.map(([id, cat]) => {
          const count = items.filter((i) => i.categoryId === id && !i.hidden).length;
          return (
            <div key={id} className="flex items-start justify-between gap-3 text-sm">
              <div>
                <p><b className="text-white">{cat.icon || "📦"} {cat.name}</b> · {count} item{count === 1 ? "" : "s"}</p>
                {cat.description && <Sub>{cat.description}</Sub>}
                {!!cat.roleRequiredIds?.length && <Sub>Only members with a chosen role see this.</Sub>}
              </div>
              <DButton colour="blurple" onClick={() => { setView(id); setPage(0); }}>Browse</DButton>
            </div>
          );
        })}
      </div>
    </DiscordMessage>
  );
}
