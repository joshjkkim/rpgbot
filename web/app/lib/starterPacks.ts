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
    combat: { enemies: Record<string, Named & { emoji: string; minLevel: number; maxLevel: number | null }> };
    quests: { quests: Record<string, Named> };
    achievements: { achievements: Record<string, Named> };
  };
};

export const STARTER_PACKS: StarterPack[] = [classicFantasy as StarterPack];

/** Where pack content lands in the guild config: [section, map]. */
const TARGETS = [
  ["shop", "categories"],
  ["shop", "items"],
  ["combat", "enemies"],
  ["quests", "quests"],
  ["achievements", "achievements"],
] as const;

/** Features a pack switches on, so its content works straight away. */
export const PACK_FEATURES = ["shop", "combat", "quests", "achievements"] as const;

function packMap(pack: StarterPack, section: string, map: string) {
  const content = pack.content as unknown as Record<string, Record<string, Record<string, unknown>>>;
  return content[section]?.[map] ?? {};
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
  );
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

  for (const feature of PACK_FEATURES) next[feature]!.enabled = true;

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
