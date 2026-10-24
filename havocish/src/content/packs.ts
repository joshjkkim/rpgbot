import classicFantasy from "./packs/classic-fantasy.json" with { type: "json" };
import frontierStation from "./packs/frontier-station.json" with { type: "json" };

/** Guild config as the dashboard holds it: untyped JSON, section by section. */
export type GuildConfigJson = Record<string, (Record<string, unknown> & { enabled?: boolean }) | undefined>;

type Named = { id: string; name: string };

/**
 * Ready-made content keyed by id, laid out like the guild config it merges
 * into. Packs are plain JSON, so a new theme is data rather than code. Only
 * the fields the dashboard reads are typed; the rest pass through untouched.
 */
export type StarterPack = {
  id: string;
  name: string;
  description: string;
  /** One short line (Discord menus cut at 100 characters). */
  tagline?: string;
  content: {
    shop: {
      categories: Record<string, Named & { icon?: string }>;
      items: Record<string, Named & { emoji?: string; rarity?: string; price: number; hidden?: boolean; categoryId?: string }>;
    };
    combat: {
      enemies: Record<string, Named & { emoji: string; minLevel: number; maxLevel: number | null; boss?: boolean }>;
      /** Optional: places, fight moves and statuses, from Combat v2. */
      places?: Record<string, Named>;
      moves?: Record<string, Named>;
      statuses?: Record<string, Named>;
    };
    quests: { quests: Record<string, Named> };
    achievements: { achievements: Record<string, Named> };
    /** Optional: packs from before gathering existed have none. */
    gathering?: { activities: Record<string, Named & { emoji?: string; skillName?: string; locations?: Record<string, unknown> }>; conditions?: Record<string, Named> };
    /** Optional, like gathering. */
    crafting?: { stations: Record<string, Named & { emoji?: string; recipes?: Record<string, unknown> }> };
    /** Optional: owner-made collections. */
    collections?: { sets: Record<string, Named> };
  };
};

export const STARTER_PACKS: StarterPack[] = [classicFantasy as StarterPack, frontierStation as StarterPack];

/** Where pack content lands in the guild config: [section, map]. */
const TARGETS = [
  ["shop", "categories"],
  ["shop", "items"],
  ["combat", "enemies"],
  ["combat", "places"],
  ["combat", "moves"],
  ["combat", "statuses"],
  ["quests", "quests"],
  ["achievements", "achievements"],
  ["gathering", "activities"],
  ["gathering", "conditions"],
  ["crafting", "stations"],
  ["collections", "sets"],
] as const;

/**
 * Fields a newer pack version added to entries a server may already have from
 * an older one: [section, map, path in the entry]. They're filled in only
 * where the entry has nothing there, so an owner's own choice is never touched.
 */
type Entry = Record<string, unknown>;

/**
 * Fields a newer pack version added to entries a server may already have from
 * an older one: per [section, map], the paths inside each entry to fill. They're
 * filled only where the server's entry has nothing there, so an owner's own
 * choice is never touched. New recipes and locations inside existing stations
 * and activities come in the same way.
 */
const FILLS: Array<{ section: string; map: string; paths: (entry: Entry) => string[][] }> = [
  { section: "combat", map: "enemies", paths: () => [["moves"]] },
  { section: "shop", map: "items", paths: () => [["effects", "moves"], ["dailyLimit"]] },
  {
    section: "gathering", map: "activities",
    paths: (a) => Object.keys((a.locations ?? {}) as Entry).flatMap((lid) => [["locations", lid], ["locations", lid, "traits"], ["locations", lid, "conditions"]]),
  },
  { section: "crafting", map: "stations", paths: (st) => Object.keys((st.recipes ?? {}) as Entry).map((rid) => ["recipes", rid]) },
];

/**
 * Lists a newer pack added to: [section, map, list, key, and where the key
 * points]. An entry is added only when what it points at is new to the server,
 * so a place gets a brand-new enemy but never one the owner took out.
 */
const LIST_ADDS: Array<[string, string, string, string, [string, string]]> = [
  ["combat", "places", "enemies", "enemyId", ["combat", "enemies"]],
];

/**
 * Each list entry the pack would add. `before` is the config as it was, which
 * decides what's new; the lists changed are `target`'s.
 */
function listAddsFor(before: GuildConfigJson | null, pack: StarterPack, target: GuildConfigJson | null = before) {
  const out: Array<{ list: unknown[]; value: unknown }> = [];
  for (const [section, map, field, key, [refSection, refMap]] of LIST_ADDS) {
    const have = (target?.[section]?.[map] ?? {}) as Record<string, Entry>;
    const known = (before?.[refSection]?.[refMap] ?? {}) as Record<string, unknown>;
    for (const [id, packEntry] of Object.entries(packMap(pack, section, map))) {
      const mine = have[id]?.[field];
      if (!Array.isArray(mine) || !(before?.[section]?.[map] as Record<string, unknown> | undefined)?.[id]) continue;
      for (const value of ((packEntry as Entry)[field] ?? []) as Entry[]) {
        const ref = value[key] as string;
        if (!known[ref] && !mine.some((x) => (x as Entry)?.[key] === ref)) out.push({ list: mine, value });
      }
    }
  }
  return out;
}

const getPath = (e: Entry, path: readonly string[]) => path.reduce<unknown>((o, k) => (o as Entry | undefined)?.[k], e);
function setPath(e: Entry, path: readonly string[], value: unknown) {
  const parent = path.slice(0, -1).reduce<Entry>((o, k) => ((o[k] ??= {}) as Entry), e);
  parent[path.at(-1)!] = structuredClone(value);
}

/** Each fill the pack would make on this config: the server's entry, the path, and the pack's value. */
function fillsFor(config: GuildConfigJson | null, pack: StarterPack) {
  const out: Array<{ entry: Entry; path: readonly string[]; value: unknown }> = [];
  for (const { section, map, paths } of FILLS) {
    const have = (config?.[section]?.[map] ?? {}) as Record<string, Entry>;
    for (const [id, packEntry] of Object.entries(packMap(pack, section, map))) {
      if (!have[id]) continue;
      for (const path of paths(packEntry as Entry)) {
        const value = getPath(packEntry as Entry, path);
        // A whole new location or recipe already carries its own traits, so those aren't counted twice.
        const parentMissing = path.length > 2 && getPath(have[id], path.slice(0, 2)) === undefined;
        if (value !== undefined && !parentMissing && getPath(have[id], path) === undefined) out.push({ entry: have[id], path, value });
      }
    }
  }
  return out;
}

/** Features a pack switches on, so its content works straight away. */
export const PACK_FEATURES = ["shop", "combat", "quests", "achievements", "gathering", "crafting"] as const;

/** Features only some packs bring, and the map that holds their content. */
const OPTIONAL: Partial<Record<(typeof PACK_FEATURES)[number], string>> = { gathering: "activities", crafting: "stations" };

function packMap(pack: StarterPack, section: string, map: string) {
  const content = pack.content as unknown as Record<string, Record<string, Record<string, unknown>>>;
  return content[section]?.[map] ?? {};
}

/** The features a pack switches on: the four every pack has, plus gathering and crafting when it brings them. */
export function packFeatures(pack: StarterPack) {
  return PACK_FEATURES.filter((f) => !OPTIONAL[f] || Object.keys(packMap(pack, f, OPTIONAL[f])).length > 0);
}

export function hasEntry(config: GuildConfigJson | null, section: string, map: string, id: string) {
  const entries = config?.[section]?.[map] as Record<string, unknown> | undefined;
  return !!entries?.[id];
}

/** How many of a pack's entries a server does not have yet. */
export function missingCount(config: GuildConfigJson | null, pack: StarterPack) {
  return TARGETS.reduce(
    (n, [section, map]) =>
      n + Object.keys(packMap(pack, section, map)).filter((id) => !hasEntry(config, section, map, id)).length,
    0
  ) + fillsFor(config, pack).length + listAddsFor(config, pack).length;
}

/**
 * Adds a pack to a config without overwriting anything: an entry whose id the
 * server already uses stays exactly as the server has it.
 */
export function applyPack(config: GuildConfigJson | null, pack: StarterPack) {
  const next: GuildConfigJson = structuredClone(config ?? {});
  let added = 0;

  for (const [section, map] of TARGETS) {
    const target = ((next[section] ??= {})[map] ??= {}) as Record<string, unknown>;
    for (const [id, entry] of Object.entries(packMap(pack, section, map))) {
      if (target[id]) continue;
      target[id] = structuredClone(entry);
      added++;
    }
  }
  for (const fill of fillsFor(next, pack)) {
    setPath(fill.entry, fill.path, fill.value);
    added++;
  }
  for (const add of listAddsFor(config, pack, next)) {
    add.list.push(structuredClone(add.value));
    added++;
  }

  for (const feature of packFeatures(pack)) next[feature]!.enabled = true;

  // Servers created before the default was fixed store crit as 0.05 / 0.01,
  // which combat reads as percentages -- effectively never a crit. Repair only
  // that exact untouched pair, never a value an owner chose.
  const combat = next.combat!;
  if (combat.critChanceBase === 0.05 && combat.critChancePerLevel === 0.01) {
    combat.critChanceBase = 5;
    combat.critChancePerLevel = 0.5;
  }

  return { config: next, added };
}
