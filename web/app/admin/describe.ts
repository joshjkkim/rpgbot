/*
 * Plain words for the admin pages: how long ago, what an event row means,
 * and what changed between two saved versions of a server's config
 * (config_history, from migration 012).
 */

export function ago(when: string | Date | null): string {
  if (!when) return "never";
  const mins = Math.round((Date.now() - new Date(when).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 48) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export type EventRow = {
  event_type: string; at: string; xp_delta: string | null; gold_delta: string | null;
  item_id: string | null; quantity: number | null; new_level: number | null; metadata: Record<string, unknown> | null;
};

const OUTCOME: Record<string, string> = { win: "won", loss: "lost", flee: "fled" };

/** One event as a line: "fought Goblin: won, party of 2, +30 XP". `itemName` turns an item id into its live name. Unknown types fall back to their name. */
export function describeEvent(e: EventRow, itemName: (id: string) => string = (id) => id): string {
  const m = e.metadata ?? {};
  const s = (k: string) => (m[k] == null ? "" : String(m[k]));
  const item = `${itemName(e.item_id ?? s("itemId"))}${e.quantity && e.quantity !== 1 ? ` ×${e.quantity}` : ""}`;
  switch (e.event_type) {
    case "fight": {
      const party = Number(m.party) > 1 ? `, party of ${m.party}` : "";
      const loot = [Number(m.xp) ? `+${m.xp} XP` : "", Number(m.gold) ? `+${m.gold} gold` : "", Number(m.drops) ? `${m.drops} drop${Number(m.drops) > 1 ? "s" : ""}` : ""].filter(Boolean).join(", ");
      return `${m.type === "boss" ? "fought the boss" : "fought"} ${s("enemy") || "an enemy"}: ${OUTCOME[s("outcome")] ?? s("outcome")}${party}${loot ? ` · ${loot}` : ""}`;
    }
    case "gather": {
      const found = Array.isArray(m.found) ? m.found.join(", ") : "";
      return `gathered (${s("activity")}) at ${s("place")}: ${found || "found nothing"}`;
    }
    case "craft": return m.ruined ? `ruined a craft of ${s("item")} at ${s("station")}` : `crafted ${s("item")}${Number(m.quantity) > 1 ? ` ×${m.quantity}` : ""} at ${s("station")}${m.masterwork ? " (masterwork)" : ""}`;
    case "upgrade": return `upgraded ${s("item")} to +${s("to")}: ${m.success ? "success" : "failed"} (${s("chance")}%)`;
    case "buy": return `bought ${item}${e.gold_delta ? ` for ${-Number(e.gold_delta)} gold` : ""}`;
    case "sell": return `sold ${item}${e.gold_delta ? ` for ${e.gold_delta} gold` : ""}`;
    case "use": return `used ${item}`;
    case "grantDaily": return `claimed the daily reward${e.xp_delta ? ` (+${e.xp_delta} XP)` : ""}`;
    case "levelUp": return `reached level ${e.new_level ?? "?"}`;
    case "startQuest": return "started a quest";
    case "claimQuest": return `finished a quest${e.xp_delta ? ` (+${e.xp_delta} XP)` : ""}`;
    case "duel": return "fought a duel";
    case "giftItem": return `gave someone ${item}`;
    case "configChange": return `changed settings in Discord${s("subcommand") || s("section") ? ` (${[s("section"), s("subcommand") || s("action")].filter(Boolean).join(" ")})` : ""}`;
    case "giveitem": case "removeitem": case "clearinventory": case "setxp": case "setlevel": case "setgold": case "setstreak":
      return `admin: ${e.event_type}${e.item_id ? ` ${item}` : ""}`;
    default: return e.event_type;
  }
}

// ─── Config changes ──────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const nameOf = (v: unknown, id: string) => (isObj(v) && typeof v.name === "string" && v.name ? `${typeof v.emoji === "string" ? `${v.emoji} ` : ""}${v.name}` : id);
/** A set of owner-made things keyed by id (enemies, items, quests...): every value an object, one with a name. */
const isNamedSet = (v: Obj) => {
  const vals = Object.values(v);
  return vals.length > 0 && vals.every(isObj) && vals.some((x) => typeof (x as Obj).name === "string");
};
const short = (v: unknown) => {
  const t = typeof v === "string" ? `"${v}"` : JSON.stringify(v);
  return t.length > 40 ? `${t.slice(0, 37)}…` : t;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * What changed from one saved config to the next, as short lines: "combat › enemies: added 🐺 Frost Wolf",
 * "xp › perMessage: 10 → 15". Fields appearing or vanishing on their own are left out: that is a save
 * filling in a default, not an owner's change.
 */
export function configChanges(before: unknown, after: unknown, max = 14): string[] {
  if (!isObj(before) || !Object.keys(before).length) return ["started from the default settings"];
  const lines: string[] = [];
  const walk = (a: unknown, b: unknown, path: string[]) => {
    if (same(a, b)) return;
    const label = path.join(" › ");
    const ao = isObj(a) ? a : a === undefined ? {} : null, bo = isObj(b) ? b : b === undefined ? {} : null;
    if (ao && bo && (isNamedSet(ao) || isNamedSet(bo))) {
      const added = Object.keys(bo).filter((k) => !(k in ao)), removed = Object.keys(ao).filter((k) => !(k in bo));
      const edited = Object.keys(bo).filter((k) => k in ao && !same(ao[k], bo[k]));
      const list = (ids: string[], from: Obj) => `${ids.length > 8 ? `${ids.length}: ` : ""}${ids.slice(0, 8).map((k) => nameOf(from[k], k)).join(", ")}${ids.length > 8 ? ` … +${ids.length - 8} more` : ""}`;
      if (added.length) lines.push(`${label}: added ${list(added, bo)}`);
      if (removed.length) lines.push(`${label}: removed ${list(removed, ao)}`);
      for (const k of edited) {
        const x = ao[k], y = bo[k];
        const fields = isObj(x) && isObj(y) ? [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((f) => !same(x[f], y[f])) : [];
        lines.push(`${label}: edited ${nameOf(y, k)}${fields.length ? ` (${fields.slice(0, 5).join(", ")}${fields.length > 5 ? "…" : ""})` : ""}`);
      }
      return;
    }
    if (ao && bo) {
      for (const k of new Set([...Object.keys(ao), ...Object.keys(bo)])) walk(ao[k], bo[k], [...path, k]);
      return;
    }
    if (a === undefined || b === undefined) return;
    lines.push(Array.isArray(a) || Array.isArray(b) ? `${label}: changed` : `${label}: ${short(a)} → ${short(b)}`);
  };
  walk(before, after, []);
  return lines.length > max ? [...lines.slice(0, max), `…and ${lines.length - max} more`] : lines;
}
