import type { GuildConfigJson, StarterPack } from "./packs.ts";

/**
 * The content library: any single entry of a pack (one enemy, one station, one
 * quest) can be added on its own. What it can't work without comes along (an
 * enemy's moves and drops, a recipe's ingredients), and whatever the server
 * already has is reused, never copied or overwritten.
 */

/** Every kind of entry, and where it lives in the guild config. */
export const KINDS = {
    categories: ["shop", "categories"],
    items: ["shop", "items"],
    enemies: ["combat", "enemies"],
    moves: ["combat", "moves"],
    statuses: ["combat", "statuses"],
    places: ["combat", "places"],
    quests: ["quests", "quests"],
    achievements: ["achievements", "achievements"],
    activities: ["gathering", "activities"],
    conditions: ["gathering", "conditions"],
    stations: ["crafting", "stations"],
    collections: ["collections", "sets"],
    characters: ["characters", "list"],
    unlocks: ["unlocks", "list"],
} as const;

export type Kind = keyof typeof KINDS;
export type Ref = { kind: Kind; id: string };
type Entry = Record<string, unknown>;

/** Keys that point at another entry, wherever they appear inside one. */
const REF_KEYS: Record<string, Kind> = {
    itemId: "items", itemIds: "items",
    enemyId: "enemies", enemyIds: "enemies",
    moveId: "moves",
    statusId: "statuses",
    conditionId: "conditions",
    categoryId: "categories",
    characterId: "characters",
    placeId: "places",
};

/**
 * What an entry needs to work. Loose links aren't followed: a tool's activity,
 * a scroll's station, a skill requirement. Those work once the server has the
 * thing, and pulling them in would drag half a pack along.
 */
export function refsOf(kind: Kind, entry: unknown): Ref[] {
    const out: Ref[] = [];
    const add = (k: Kind, ids: unknown) => {
        for (const id of Array.isArray(ids) ? ids : [ids]) if (typeof id === "string" && id) out.push({ kind: k, id });
    };
    const walk = (o: unknown, key?: string) => {
        if (Array.isArray(o)) return o.forEach((x) => walk(x, key));
        if (!o || typeof o !== "object") return;
        const e = o as Entry;
        // A collection's entries: { kind: "item" | "enemy", id }.
        if (kind === "collections" && (e.kind === "item" || e.kind === "enemy") && typeof e.id === "string") add(e.kind === "item" ? "items" : "enemies", e.id);
        for (const [k, v] of Object.entries(e)) {
            if (REF_KEYS[k]) add(REF_KEYS[k], v);
            // Gear that grants moves, and requirements on anything.
            else if (k === "moves" && key === "effects") add("moves", v);
            else if (k === "found" && key === "requirements") add("items", v);
            else if (k === "collections" && key === "requirements") add("collections", v);
            if (v && typeof v === "object") walk(v, k);
        }
    };
    walk(entry);
    return out;
}

export function entryOf(config: GuildConfigJson | StarterPack["content"] | null | undefined, { kind, id }: Ref): Entry | undefined {
    const [section, map] = KINDS[kind];
    return ((config as Record<string, Record<string, Record<string, Entry>>> | null | undefined)?.[section]?.[map])?.[id];
}

const key = (r: Ref) => `${r.kind}:${r.id}`;

/**
 * What adding `picks` from `source` would add to `config`: the picks and
 * everything they need, minus what the server already has. A need the source
 * doesn't have either is skipped (it can't be added from here).
 */
export function plan(config: GuildConfigJson | null, source: StarterPack["content"], picks: Ref[]): Ref[] {
    const seen = new Set<string>();
    const out: Ref[] = [];
    const queue = [...picks];
    while (queue.length) {
        const ref = queue.shift()!;
        if (seen.has(key(ref))) continue;
        seen.add(key(ref));
        const entry = entryOf(source, ref);
        // The server's own copy wins, and so do its needs.
        if (!entry || entryOf(config, ref)) continue;
        out.push(ref);
        queue.push(...refsOf(ref.kind, entry));
    }
    return out;
}

/** Sections whose feature switches on when you add one of their entries yourself (not as a need). */
const FEATURE: Record<Kind, string> = {
    categories: "shop", items: "shop",
    enemies: "combat", moves: "combat", statuses: "combat", places: "combat",
    quests: "quests", achievements: "achievements",
    activities: "gathering", conditions: "gathering",
    stations: "crafting", collections: "collections", characters: "characters", unlocks: "unlocks",
};

/** Adds the planned entries to a copy of `config`, and switches on what the picks are for. */
export function addEntries(config: GuildConfigJson | null, source: StarterPack["content"], picks: Ref[]) {
    const next: GuildConfigJson = structuredClone(config ?? {});
    const added = plan(config, source, picks);
    for (const ref of added) {
        const [section, map] = KINDS[ref.kind];
        const target = ((next[section] ??= {})[map] ??= {}) as Record<string, unknown>;
        const entry = structuredClone(entryOf(source, ref)!);
        // A place's channels belong to the server it came from.
        if (ref.kind === "places") entry.channelIds = [];
        target[ref.id] = entry;
    }
    for (const pick of picks) {
        const feature = FEATURE[pick.kind];
        if (!["collections", "characters", "unlocks"].includes(feature) && added.some((a) => key(a) === key(pick))) (next[feature] ??= {}).enabled = true;
    }
    return { config: next, added };
}
