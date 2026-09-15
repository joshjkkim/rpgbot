import type { shopItemAction, shopItemConfig } from "./shopBasicsEditor";

export type ItemRarity = "poor" | "common" | "uncommon" | "rare" | "epic" | "legendary";

// Item quality colours, muted to match the landing page's chat feed.
export const RARITIES: ReadonlyArray<{ value: ItemRarity; label: string; colour: string }> = [
  { value: "poor", label: "Poor", colour: "#8a857c" },
  { value: "common", label: "Common", colour: "#e2dacb" },
  { value: "uncommon", label: "Uncommon", colour: "#7fb86a" },
  { value: "rare", label: "Rare", colour: "#6c95d0" },
  { value: "epic", label: "Epic", colour: "#a584cc" },
  { value: "legendary", label: "Legendary", colour: "#d0894a" },
];

const STAT_NAMES = { hp: "Health", atk: "Attack", def: "Defense", spd: "Speed" } as const;
const GREEN = "text-[#8fbf72]";

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

// The bot applies boosts only to XP and gold from fights, and only while equipped.
function boostLine(mult: number | undefined, what: string) {
  if (mult == null || mult === 1) return null;
  const pct = Math.round(Math.abs(mult - 1) * 100);
  return `Equip: Fights award ${pct}% ${mult > 1 ? "more" : "less"} ${what}.`;
}

function describeAction(a: shopItemAction) {
  switch (a.type) {
    case "assignRole":
      return "Grants a server role.";
    case "removeRole":
      return "Removes a server role.";
    case "sendMessage":
      return "Posts a message.";
    case "giveStat":
      return `Gives ${a.amount ?? 0} ${a.statId || "of a stat"}.`;
    case "giveItem":
      return `Gives ${a.quantity ?? 1} × ${a.itemId || "an item"}.`;
  }
}

/**
 * A WoW-style tooltip showing how an item reads to members. It takes a plain
 * item config, so quest rewards, enemy drops and giveItem actions can reuse it.
 */
export default function ItemTooltip({ item }: { item: shopItemConfig }) {
  const rarity = RARITIES.find((r) => r.value === item.rarity) ?? RARITIES[1];
  const { stats = {}, boosts = {}, cosmetic = {} } = item.effects ?? {};

  const baseStats = (Object.keys(STAT_NAMES) as Array<keyof typeof STAT_NAMES>).filter((k) => stats[k]);
  const equipLines = [
    stats.crit ? `Equip: ${signed(stats.crit)}% critical strike chance.` : null,
    boostLine(boosts.xpMultiplier, "XP"),
    boostLine(boosts.goldMultiplier, "gold"),
    cosmetic.title ? `Equip: Grants the title "${cosmetic.title}".` : null,
  ].filter((l): l is string => !!l);
  const useLines = Object.values(item.actions ?? {}).map(describeAction);
  // Every equip bonus is read from equipped items, so on anything else they do nothing.
  const inert = !item.equipable && (baseStats.length > 0 || equipLines.length > 0);
  const cap = item.maxPerUser ?? 0;

  return (
    <div className="w-full rounded-[3px] border border-[var(--border-bright)] bg-[#0e0f14]/95 px-3 py-2.5 text-[13px] leading-5 shadow-[inset_0_0_0_1px_#000,0_2px_8px_rgb(0_0_0/0.6)] [text-shadow:0_1px_0_#000]">
      <p className="font-display text-base" style={{ color: rarity.colour }}>
        {item.emoji && <span className="mr-1.5">{item.emoji}</span>}
        {item.name || item.id}
      </p>
      {cap > 0 && <p>{cap === 1 ? "Unique" : `Unique (${cap})`}</p>}
      {item.equipable && <p className="capitalize">{item.equipSlot ?? "accessory"}</p>}
      {baseStats.map((k) => (
        <p key={k}>
          {signed(stats[k]!)} {STAT_NAMES[k]}
        </p>
      ))}
      {equipLines.map((l) => (
        <p key={l} className={GREEN}>
          {l}
        </p>
      ))}
      {inert && <p className="text-[#c96b5b]">Not equipable, so these bonuses never apply.</p>}
      {useLines.map((l, i) => (
        <p key={i} className={GREEN}>
          Use: {l}
        </p>
      ))}
      {item.description && <p className="mt-1 text-[var(--gold)]">&ldquo;{item.description}&rdquo;</p>}
      {!!item.minLevel && <p className="mt-1">Requires Level {item.minLevel}</p>}
      {!!item.sellPrice && <p>Sell Price: {item.sellPrice} gold</p>}
    </div>
  );
}
