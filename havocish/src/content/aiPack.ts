import { enemyPreset, gearPreset, potionPreset, type EnemyRole, type GearSlot, type Rarity } from "./balance.ts";
import type { StarterPack } from "./packs.ts";

/**
 * The AI builder: an owner describes a world, a model writes its words (names,
 * emoji, descriptions, which enemy lives where), and this file turns that into
 * a starter pack. The model never picks a number: every stat, price and reward
 * comes from balance.ts, so a generated world plays like Classic Fantasy does.
 * The result goes through the Library like any pack, so it never overwrites.
 */

const MOVE_KINDS = ["strike", "heavy", "quick", "poison", "weaken", "enrage", "guard", "stun"] as const;
const SLOTS: GearSlot[] = ["weapon", "head", "body", "legs", "hands", "feet", "shield", "accessory"];
const ROLES: EnemyRole[] = ["weak", "normal", "tough", "elite", "boss"];
const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

type MoveKind = (typeof MOVE_KINDS)[number];
type Words = { name: string; emoji: string };

/** What the model fills in. Keys are its own short names, used to link entries; ids are made from names here. */
export type Skeleton = {
    name: string;
    tagline: string;
    description: string;
    shopkeeper: Words;
    announcer: Words;
    categories: { gear: Words; potions: Words; materials: Words };
    statuses: { poison: Words; weaken: Words; enrage: Words };
    moves: Array<Words & { key: string; telegraph: string; kind: MoveKind }>;
    materials: Array<Words & { key: string; description: string }>;
    gear: Array<Words & { description: string; slot: GearSlot; level: number; rarity: Rarity }>;
    potions: Array<Words & { description: string; level: number }>;
    places: Array<Words & { key: string; arrival: string }>;
    enemies: Array<Words & { key: string; level: number; role: EnemyRole; place: string; moves: string[]; drops: string[] }>;
    quests: Array<{ name: string; description: string; enemy: string; count: number }>;
};

const words = { type: "object", additionalProperties: false, required: ["name", "emoji"], properties: { name: { type: "string" }, emoji: { type: "string" } } };
const obj = (props: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
const list = (props: Record<string, unknown>) => ({ type: "array", items: obj({ name: { type: "string" }, emoji: { type: "string" }, ...props }) });
const str = { type: "string" };
const int = { type: "integer" };

/** Skeleton as a JSON schema, for structured outputs. Counts and ranges are in the prompt and clamped here. */
export const SKELETON_SCHEMA = obj({
    name: str, tagline: str, description: str,
    shopkeeper: words, announcer: words,
    categories: obj({ gear: words, potions: words, materials: words }),
    statuses: obj({ poison: words, weaken: words, enrage: words }),
    moves: list({ key: str, telegraph: str, kind: { type: "string", enum: MOVE_KINDS } }),
    materials: list({ key: str, description: str }),
    gear: list({ description: str, slot: { type: "string", enum: SLOTS }, level: int, rarity: { type: "string", enum: RARITIES } }),
    potions: list({ description: str, level: int }),
    places: list({ key: str, arrival: str }),
    enemies: list({ key: str, level: int, role: { type: "string", enum: ROLES }, place: str, moves: { type: "array", items: str }, drops: { type: "array", items: str } }),
    quests: { type: "array", items: obj({ name: str, description: str, enemy: str, count: int }) },
});

export const SKELETON_PROMPT = `You write the content for a Discord RPG server from the owner's description of their world.
Players chat, fight enemies turn by turn (/fight), buy gear and potions (/shop), and do hunting quests. Combat levels run 1 to 40.

Write only words and choices; the game fills in every number from balanced tables. Stay true to the owner's theme and tone, and keep text short: descriptions are one line, a telegraph is what the enemy is seen doing before its move ("rears back…", "gurgles and swells…").

Make, roughly:
- 8 to 12 moves. Kinds: strike (a plain hit), heavy (a big slow hit), quick (strikes first), poison (damage over time), weaken (lowers attack), enrage (raises its own attack), guard (blocks and counters), stun.
- 6 to 10 materials enemies drop, sold for gold.
- 14 to 20 pieces of gear across the slots, from level 1 to 40, rarer as levels rise, so each slot gets an upgrade every 10 or so levels.
- 3 potions that heal, at about levels 1, 15 and 30.
- 3 to 5 places, from the first one beginners fight in to the most dangerous.
- 12 to 16 enemies spread from level 1 to 40, each in a place, with 1 to 3 of the moves and 1 or 2 of the materials (by key). Mostly weak, normal and tough; a couple of elites (rare); exactly one world boss (role boss, level 30 or so) that the whole server fights together.
- 3 to 5 hunting quests: defeat some number (3 to 20) of one enemy (by key).
Keys are short lowercase words you make up to link things together. Emoji are single standard emoji.`;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(n) || lo)));

/** A lowercase id from a name, unique within the pack. */
function ids() {
    const used = new Set<string>();
    return (name: string, fallback: string) => {
        const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || fallback;
        let id = base;
        for (let i = 2; used.has(id); i++) id = `${base}-${i}`;
        used.add(id);
        return id;
    };
}

const STATUS_IDS = { poison: "poison", weaken: "weakened", enrage: "enraged" } as const;

/** Each kind of move, with the effects and cooldowns Classic Fantasy's own use. */
const MOVE_EFFECTS: Record<MoveKind, { cooldown?: number; firstStrike?: true; effects: unknown[] }> = {
    strike: { effects: [{ type: "hit", power: 1 }] },
    heavy: { cooldown: 3, effects: [{ type: "hit", power: 1.6 }] },
    quick: { cooldown: 2, firstStrike: true, effects: [{ type: "hit", power: 1.3 }] },
    poison: { cooldown: 3, effects: [{ type: "hit", power: 0.5 }, { type: "status", statusId: "poison", turns: 3 }] },
    weaken: { cooldown: 4, effects: [{ type: "hit", power: 0.6 }, { type: "status", statusId: "weakened", turns: 2 }] },
    enrage: { cooldown: 5, effects: [{ type: "status", statusId: "enraged", turns: 3, target: "self" }] },
    guard: { cooldown: 3, effects: [{ type: "guard", percent: 70 }, { type: "counter", percent: 40 }] },
    stun: { cooldown: 4, effects: [{ type: "hit", power: 0.5 }, { type: "stun" }] },
};

/** Turns the model's skeleton into a pack. Anything it got wrong (a bad key, a level out of range) is fixed or dropped, never trusted. */
export function buildPack(s: Skeleton, packId: string): StarterPack {
    const id = ids();
    const text = (v: unknown, max = 120) => String(v ?? "").trim().slice(0, max);
    const emoji = (v: unknown, fallback: string) => text(v, 16) || fallback;

    const cats = {
        gear: { id: id(s.categories.gear.name, "gear"), name: text(s.categories.gear.name, 40), icon: emoji(s.categories.gear.emoji, "⚔️"), sortOrder: 0 },
        potions: { id: id(s.categories.potions.name, "potions"), name: text(s.categories.potions.name, 40), icon: emoji(s.categories.potions.emoji, "🧪"), sortOrder: 1 },
        materials: { id: id(s.categories.materials.name, "materials"), name: text(s.categories.materials.name, 40), icon: emoji(s.categories.materials.emoji, "🧺"), sortOrder: 2 },
    };

    const statuses = Object.fromEntries((Object.keys(STATUS_IDS) as Array<keyof typeof STATUS_IDS>).map((k) => {
        const base = { poison: { hpPercentPerTurn: -4 }, weaken: { hpPercentPerTurn: 0, stats: { atk: -25 } }, enrage: { hpPercentPerTurn: 0, stats: { atk: 40, def: -20 } } }[k];
        return [STATUS_IDS[k], { id: STATUS_IDS[k], name: text(s.statuses[k].name, 40), emoji: emoji(s.statuses[k].emoji, "✨"), ...base }];
    }));

    const moveIds = new Map<string, string>();
    const moves: Record<string, unknown> = {};
    for (const m of s.moves.slice(0, 16)) {
        if (!MOVE_EFFECTS[m.kind]) continue;
        const mid = id(m.name, "move");
        moveIds.set(m.key, mid);
        moves[mid] = { id: mid, name: text(m.name, 40), emoji: emoji(m.emoji, "⚔️"), telegraph: text(m.telegraph, 80), ...structuredClone(MOVE_EFFECTS[m.kind]) };
    }

    const enemies = s.enemies.slice(0, 24).map((e) => ({ ...e, level: e.role === "boss" ? clamp(e.level, 10, 40) : clamp(e.level, 1, 40) }));
    // Where each material first drops sets what it sells for.
    const dropLevel = new Map<string, number>();
    for (const e of enemies) for (const d of e.drops) if (e.role !== "boss") dropLevel.set(d, Math.min(dropLevel.get(d) ?? 99, e.level));

    const items: Record<string, Record<string, unknown>> = {};
    const materialIds = new Map<string, string>();
    for (const m of s.materials.slice(0, 16)) {
        const iid = id(m.name, "material");
        materialIds.set(m.key, iid);
        const level = dropLevel.get(m.key) ?? 1;
        items[iid] = {
            id: iid, name: text(m.name, 60), emoji: emoji(m.emoji, "🪨"), rarity: "poor", description: text(m.description),
            categoryId: cats.materials.id, price: 0, sellPrice: Math.max(2, Math.round(enemyPreset(level, "normal").goldReward * 1.5)),
            hidden: true, permanent: false, tradeable: true,
        };
    }
    const gear = s.gear.slice(0, 30).filter((g) => SLOTS.includes(g.slot)).map((g) => {
        const iid = id(g.name, "gear");
        const level = clamp(g.level, 1, 40);
        const rarity = RARITIES.includes(g.rarity) ? g.rarity : "common";
        const n = gearPreset(g.slot, level, rarity);
        items[iid] = {
            id: iid, name: text(g.name, 60), emoji: emoji(g.emoji, "🗡️"), rarity, description: text(g.description), categoryId: cats.gear.id,
            price: n.price, sellPrice: n.sellPrice, ...(level > 1 && { minLevel: level }),
            equipable: true, equipSlot: g.slot, permanent: true, tradeable: true, effects: { stats: n.stats },
        };
        return { iid, level };
    });
    const potions = s.potions.slice(0, 6).map((p) => {
        const iid = id(p.name, "potion");
        const level = clamp(p.level, 1, 40);
        const n = potionPreset(level);
        items[iid] = {
            id: iid, name: text(p.name, 60), emoji: emoji(p.emoji, "🧪"), rarity: "common", description: text(p.description), categoryId: cats.potions.id,
            price: n.price, sellPrice: n.sellPrice, permanent: false, tradeable: true, dailyLimit: n.dailyLimit,
            actions: { "0": { type: "giveStat", statId: "health", amount: n.heal } },
        };
        return { iid, level };
    });
    /** The best of `list` a player at `level` could have. */
    const best = (list: Array<{ iid: string; level: number }>, level: number) => list.filter((x) => x.level <= level).sort((a, b) => b.level - a.level)[0] ?? list[0];

    const characters = {
        shopkeeper: { id: id(s.shopkeeper.name, "shopkeeper"), name: text(s.shopkeeper.name, 60), avatar: emoji(s.shopkeeper.emoji, "🧙") },
        announcer: { id: id(s.announcer.name, "announcer"), name: text(s.announcer.name, 60), avatar: emoji(s.announcer.emoji, "📯") },
    };

    const placeIds = new Map<string, string>();
    const places: Record<string, { id: string; enemies: Array<{ enemyId: string; weight: number }> } & Record<string, unknown>> = {};
    for (const p of s.places.slice(0, 8)) {
        const pid = id(p.name, "place");
        placeIds.set(p.key, pid);
        places[pid] = { id: pid, name: text(p.name, 60), emoji: emoji(p.emoji, "🗺️"), arrival: text(p.arrival, 80), channelIds: [], enemies: [], fights: "thread" };
    }

    const enemyIds = new Map<string, { id: string; xp: number; gold: number }>();
    const enemyMap: Record<string, unknown> = {};
    for (const e of enemies) {
        const eid = id(e.name, "enemy");
        const role = ROLES.includes(e.role) ? e.role : "normal";
        const n = enemyPreset(e.level, role);
        enemyIds.set(e.key, { id: eid, xp: n.xpReward, gold: n.goldReward });
        const own = e.moves.map((k) => moveIds.get(k)).filter((m): m is string => !!m);
        const drops = [
            ...e.drops.map((k) => materialIds.get(k)).filter((m): m is string => !!m).slice(0, 2).map((itemId) => ({ itemId, chance: role === "boss" ? 1 : 0.5, quantity: role === "boss" ? 3 : 1 })),
            ...(potions.length ? [{ itemId: best(potions, e.level)!.iid, chance: role === "boss" ? 1 : 0.15, quantity: role === "boss" ? 3 : 1 }] : []),
            // Elites and the boss are where the rare gear comes from.
            ...((role === "elite" || role === "boss") && gear.length ? [{ itemId: best(gear, e.level)!.iid, chance: role === "boss" ? 0.5 : 0.1, quantity: 1 }] : []),
        ];
        enemyMap[eid] = {
            id: eid, name: text(e.name, 60), emoji: emoji(e.emoji, "👾"), ...n, drops,
            ...(own.length && { moves: own.map((moveId, i) => ({ moveId, weight: i === 0 ? 3 : 1 })) }),
        };
        // A world boss turns up on its own; everything else lives in a place (the model's, or the nearest by order).
        if (role === "boss") continue;
        const place = places[placeIds.get(e.place) ?? ""] ?? Object.values(places)[Math.min(Object.keys(places).length - 1, Math.floor(e.level / 10))];
        place?.enemies.push({ enemyId: eid, weight: role === "elite" ? 1 : 3 });
    }

    const quests: Record<string, unknown> = {};
    for (const q of s.quests.slice(0, 8)) {
        const target = enemyIds.get(q.enemy);
        if (!target) continue;
        const qid = id(q.name, "quest");
        const count = clamp(q.count, 3, 20);
        quests[qid] = {
            id: qid, name: text(q.name, 60), description: text(q.description),
            conditions: { type: "defeatEnemies", target: count, enemyIds: [target.id] },
            // About a quarter of the fights' own XP again, and half their gold.
            reward: { "0": { xp: Math.round(target.xp * count * 0.25), gold: Math.round(target.gold * count * 0.5) } },
            active: true, cooldown: 604800, characterId: characters.announcer.id,
        };
    }

    return {
        id: packId,
        name: text(s.name, 60) || "Your world",
        description: text(s.description, 400),
        tagline: text(s.tagline, 100),
        content: {
            shop: { categories: { [cats.gear.id]: cats.gear, [cats.potions.id]: cats.potions, [cats.materials.id]: cats.materials }, items: items as never },
            combat: { enemies: enemyMap as never, places: Object.fromEntries(Object.entries(places).filter(([, p]) => p.enemies.length)) as never, moves: moves as never, statuses: statuses as never },
            quests: { quests: quests as never },
            achievements: { achievements: {} },
            characters: { list: { [characters.shopkeeper.id]: characters.shopkeeper, [characters.announcer.id]: characters.announcer }, shopkeeperId: characters.shopkeeper.id, announcerId: characters.announcer.id },
        },
    };
}
