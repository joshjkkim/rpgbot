import classicFantasy from "./packs/classic-fantasy.json";

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
  content: {
    shop: {
      categories: Record<string, Named>;
      items: Record<string, Named & { emoji?: string; rarity?: string; price: number; hidden?: boolean }>;
    };
    combat: {
      enemies: Record<string, Named & { emoji: string; minLevel: number; maxLevel: number | null; boss?: boolean }>;
      /** Optional: fight moves and statuses, from Combat v2. */
      moves?: Record<string, Named>;
      statuses?: Record<string, Named>;
    };
    quests: { quests: Record<string, Named> };
    achievements: { achievements: Record<string, Named> };
    /** Optional: packs from before gathering existed have none. */
    gathering?: { activities: Record<string, Named & { emoji?: string; skillName?: string; locations?: Record<string, unknown> }> };
    /** Optional, like gathering. */
    crafting?: { stations: Record<string, Named & { emoji?: string; recipes?: Record<string, unknown> }> };
  };
};

export const STARTER_PACKS: StarterPack[] = [classicFantasy as StarterPack];

/** Where pack content lands in the guild config: [section, map]. */
const TARGETS = [
  ["shop", "categories"],
  ["shop", "items"],
  ["combat", "enemies"],
  ["combat", "moves"],
  ["combat", "statuses"],
  ["quests", "quests"],
  ["achievements", "achievements"],
  ["gathering", "activities"],
  ["crafting", "stations"],
] as const;

/**
 * Fields a newer pack version added to entries a server may already have from
 * an older one: [section, map, path in the entry]. They're filled in only
 * where the entry has nothing there, so an owner's own choice is never touched.
 */
const FILLS = [
  ["combat", "enemies", ["moves"]],
  ["shop", "items", ["effects", "moves"]],
] as const;

type Entry = Record<string, unknown>;
const getPath = (e: Entry, path: readonly string[]) => path.reduce<unknown>((o, k) => (o as Entry | undefined)?.[k], e);
function setPath(e: Entry, path: readonly string[], value: unknown) {
  const parent = path.slice(0, -1).reduce<Entry>((o, k) => ((o[k] ??= {}) as Entry), e);
  parent[path.at(-1)!] = structuredClone(value);
}

/** Each fill the pack would make on this config: the server's entry, the path, and the pack's value. */
function fillsFor(config: GuildConfigJson | null, pack: StarterPack) {
  const out: Array<{ entry: Entry; path: readonly string[]; value: unknown }> = [];
  for (const [section, map, path] of FILLS) {
    const have = (config?.[section]?.[map] ?? {}) as Record<string, Entry>;
    for (const [id, packEntry] of Object.entries(packMap(pack, section, map))) {
      const value = getPath(packEntry as Entry, path);
      if (have[id] && value !== undefined && getPath(have[id], path) === undefined) out.push({ entry: have[id], path, value });
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
  ) + fillsFor(config, pack).length;
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
