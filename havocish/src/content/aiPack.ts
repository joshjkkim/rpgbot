import { enemyPreset, gearPreset, potionPreset, type EnemyRole, type GearSlot, type Rarity } from "./balance.ts";
import type { StarterPack } from "./packs.ts";
import classicFantasy from "./packs/classic-fantasy.json" with { type: "json" };

/**
 * The AI builder: an owner describes a world, a model writes its words (names,
 * emoji, descriptions, which enemy lives where), and this file turns that into
 * a starter pack. The model never picks a number: every stat, price and reward
 * comes from balance.ts, and gathering and crafting take Classic Fantasy's own
 * numbers tier by tier, so a generated world plays like Classic Fantasy does.
 * The result goes through the Library like any pack, so it never overwrites.
 */

const MOVE_KINDS = ["strike", "heavy", "quick", "poison", "weaken", "enrage", "guard", "stun"] as const;
const SLOTS: GearSlot[] = ["weapon", "head", "body", "legs", "hands", "feet", "shield", "accessory"];
const ROLES: EnemyRole[] = ["weak", "normal", "tough", "elite", "boss"];
const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

type MoveKind = (typeof MOVE_KINDS)[number];
type Words = { name: string; emoji: string };
/** A collection's words; what's in it comes from the world itself. */
type SetWords = Partial<Words & { description: string }>;

/** What the model fills in. Keys are its own short names, used to link entries; ids are made from names here. */
export type Skeleton = {
    name: string;
    tagline: string;
    description: string;
    shopkeeper: Words;
    announcer: Words;
    categories: { gear: Words; potions: Words; materials: Words; tools: Words };
    statuses: { poison: Words; weaken: Words; enrage: Words };
    moves: Array<Words & { key: string; telegraph: string; kind: MoveKind }>;
    materials: Array<Words & { key: string; description: string }>;
    gear: Array<Words & { key: string; description: string; slot: GearSlot; level: number; rarity: Rarity; crafted?: boolean }>;
    potions: Array<Words & { key: string; description: string; level: number }>;
    places: Array<Words & { key: string; arrival: string; bestiary?: SetWords }>;
    enemies: Array<Words & { key: string; level: number; role: EnemyRole; place: string; moves: string[]; drops: string[] }>;
    quests: Array<{ name: string; description: string; enemy: string; count: number }>;
    activities: Array<Words & {
        skillName: string; game: string; words: Record<string, unknown>;
        tools: Array<Words & { description: string }>;
        locations: Array<Words & { finds: Array<Words & { key: string; description: string }> }>;
        collection?: SetWords;
    }>;
    stations: Array<Words & { skillName: string; style: string; words: Record<string, unknown>; recipes: Array<{ makes: string; uses: string[] }> }>;
    /** The collection of crafting-only gear. */
    crafted?: SetWords;
    /** New names for Classic Fantasy's achievements, by id; their goals and rewards stay. */
    achievements?: Record<string, string>;
};

type Json = Record<string, any>;
const CF = classicFantasy.content as Json;
const OWN = ["id", "name", "emoji", "skillName", "words", "locations", "recipes", "loot", "conditions", "traits"];
const numbers = (o: Json) => Object.fromEntries(Object.entries(o).filter(([k]) => !OWN.includes(k)));

/** Each minigame's numbers and words, from Classic Fantasy's activity that plays it: location 0 is the easy one, 2 the hard. */
const GAMES: Record<string, { fields: Json; words: Record<string, string>; locations: Json[] }> = Object.fromEntries(
    (Object.values(CF.gathering.activities) as Json[]).map((a) => [a.game, { fields: numbers(a), words: a.words, locations: (Object.values(a.locations) as Json[]).map(numbers) }]),
);
/** Each crafting style's fields and words: forge (a timed strike) from Smithing, simple (one click) from Cooking. */
const STYLES: Record<string, { fields: Json; words: Record<string, string> }> = {
    forge: { fields: numbers(CF.crafting.stations.smithing), words: CF.crafting.stations.smithing.words },
    simple: { fields: numbers(CF.crafting.stations.cooking), words: CF.crafting.stations.cooking.words },
};
/** What a location's three finds sell for and how rare they are, by the location's tier (Classic Fantasy's mines, ponds and meadows). */
const FINDS: Array<Array<{ sell: number; rarity: Rarity | "poor" }>> = [
    [{ sell: 2, rarity: "poor" }, { sell: 5, rarity: "common" }, { sell: 60, rarity: "rare" }],
    [{ sell: 8, rarity: "common" }, { sell: 18, rarity: "uncommon" }, { sell: 130, rarity: "rare" }],
    [{ sell: 28, rarity: "uncommon" }, { sell: 35, rarity: "uncommon" }, { sell: 430, rarity: "epic" }],
];
const FIND_CHANCES = [40, 50, 10];
/** Tools by tier, as Classic Fantasy prices its pickaxes. */
const TOOLS = [{ price: 150, minLevel: 3, rarity: "common" }, { price: 900, minLevel: 12, rarity: "uncommon" }, { price: 3500, minLevel: 25, rarity: "rare" }];

export const SKELETON_PROMPT = `You write the content for a Discord RPG server from the owner's description of their world.
Players chat, fight enemies turn by turn (/fight), buy gear and potions (/shop), and do hunting quests. Combat levels run 1 to 40.

Write only words and choices; the game fills in every number from balanced tables. Stay true to the owner's theme and tone, and keep text short: descriptions are one line, a telegraph is what the enemy is seen doing before its move ("rears back…", "gurgles and swells…").

Make, roughly:
- 8 to 12 moves. Kinds: strike (a plain hit), heavy (a big slow hit), quick (strikes first), poison (damage over time), weaken (lowers attack), enrage (raises its own attack), guard (blocks and counters), stun.
- 6 to 10 materials enemies drop, sold for gold.
- 14 to 20 pieces of gear across the slots (weapon, head, body, legs, hands, feet, shield, accessory), rarity common, uncommon, rare, epic or legendary, from level 1 to 40, rarer as levels rise, so each slot gets an upgrade every 10 or so levels.
- 3 potions that heal, at about levels 1, 15 and 30.
- 3 to 5 places, from the first one beginners fight in to the most dangerous.
- 12 to 16 enemies spread from level 1 to 40, each in a place, with 1 to 3 of the moves and 1 or 2 of the materials (by key). Roles: weak, normal, tough, elite, boss. Mostly weak, normal and tough; a couple of elites (rare); exactly one world boss (role boss, level 30 or so) that the whole server fights together.
- 3 to 5 hunting quests: defeat some number (3 to 20) of one enemy (by key).
- 2 gathering activities that suit the world (what players dig, catch, scavenge or hack), each played as a minigame: grid (uncover tiles, avoiding hazards), timing (wait for the signal, then react) or find (spot the target among decoys). Each has 3 locations from easy to hard, each location 3 finds (two everyday ones, then a rare one), and 3 tools that get better.
- 1 or 2 crafting stations, style forge (strike at the right moment) or simple (one click), with 4 to 8 recipes that make the world's gear or potions (by key) from materials and finds (by key). Mark a few good pieces of gear "crafted": true to make them crafting-only, never sold.
- A collection for each place's enemies ("bestiary" on the place), each activity's finds ("collection" on the activity) and the crafting-only gear ("crafted"): a name, emoji and one-line description each.
- A name in the world's style for each of these achievements, by id (the goal stays as written): ${JSON.stringify(Object.fromEntries((Object.values(CF.achievements.achievements) as Json[]).map((a) => [a.id, a.description])))}
Minigame and station words replace these examples (keep anything in {braces}): ${JSON.stringify({ ...Object.fromEntries(Object.entries(GAMES).map(([g, v]) => [g, v.words])), forge: STYLES.forge!.words, simple: STYLES.simple!.words })}
Keys are short lowercase words you make up to link things together. Emoji are single standard emoji.

Reply with only a JSON object, no other text, shaped like this (lists shortened):
{"name":"","tagline":"one line","description":"two or three sentences",
"shopkeeper":{"name":"","emoji":""},"announcer":{"name":"","emoji":""},
"categories":{"gear":{"name":"","emoji":""},"potions":{"name":"","emoji":""},"materials":{"name":"","emoji":""},"tools":{"name":"","emoji":""}},
"statuses":{"poison":{"name":"","emoji":""},"weaken":{"name":"","emoji":""},"enrage":{"name":"","emoji":""}},
"moves":[{"key":"","name":"","emoji":"","telegraph":"","kind":"strike"}],
"materials":[{"key":"","name":"","emoji":"","description":""}],
"gear":[{"key":"","name":"","emoji":"","description":"","slot":"weapon","level":1,"rarity":"common","crafted":false}],
"potions":[{"key":"","name":"","emoji":"","description":"","level":1}],
"places":[{"key":"","name":"","emoji":"","arrival":"what an enemy does as it appears, e.g. drifts out of the murk","bestiary":{"name":"","emoji":"","description":""}}],
"enemies":[{"key":"","name":"","emoji":"","level":1,"role":"weak","place":"","moves":[""],"drops":[""]}],
"quests":[{"name":"","description":"","enemy":"","count":5}],
"activities":[{"name":"","emoji":"","skillName":"","game":"grid","words":{},"tools":[{"name":"","emoji":"","description":""}],"locations":[{"name":"","emoji":"","finds":[{"key":"","name":"","emoji":"","description":""}]}],"collection":{"name":"","emoji":"","description":""}}],
"stations":[{"name":"","emoji":"","skillName":"","style":"forge","words":{},"recipes":[{"makes":"","uses":[""]}]}],
"crafted":{"name":"","emoji":"","description":""},
"achievements":{"first-blood":""}}`;

/** The model's reply as a Skeleton, whatever shape it came in: missing parts become empty, so buildPack never trips on them. */
export function parseSkeleton(reply: string): Skeleton | null {
    const json = reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1);
    let raw: unknown;
    try { raw = JSON.parse(json); } catch { return null; }
    const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, any>;
    const arr = (v: unknown) => (Array.isArray(v) ? v : []).map(obj);
    const strs = (v: unknown) => (Array.isArray(v) ? v : []).map(String);
    const r = obj(raw);
    const group = (v: unknown, keys: string[]) => Object.fromEntries(keys.map((k) => [k, obj(obj(v)[k])]));
    return {
        ...r,
        shopkeeper: obj(r.shopkeeper), announcer: obj(r.announcer),
        categories: group(r.categories, ["gear", "potions", "materials", "tools"]),
        statuses: group(r.statuses, ["poison", "weaken", "enrage"]),
        moves: arr(r.moves), materials: arr(r.materials), gear: arr(r.gear), potions: arr(r.potions), places: arr(r.places),
        enemies: arr(r.enemies).map((e) => ({ ...e, moves: strs(e.moves), drops: strs(e.drops) })),
        quests: arr(r.quests),
        achievements: Object.fromEntries(Object.entries(obj(r.achievements)).map(([k, v]) => [k, String(v)])),
        activities: arr(r.activities).map((a) => ({ ...a, words: obj(a.words), tools: arr(a.tools), locations: arr(a.locations).map((l) => ({ ...l, finds: arr(l.finds) })) })),
        stations: arr(r.stations).map((st) => ({ ...st, words: obj(st.words), recipes: arr(st.recipes).map((x) => ({ ...x, uses: strs(x.uses) })) })),
    } as Skeleton;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(n) || lo)));

/** A lowercase id from a name, unique within the pack. */
function ids() {
    const used = new Set<string>();
    return (name: unknown, fallback: string) => {
        const base = String(name ?? "").toLowerCase().normalize("NFKD").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || fallback;
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
        gear: { id: id(s.categories.gear.name, "gear"), name: text(s.categories.gear.name, 40) || "Gear", icon: emoji(s.categories.gear.emoji, "⚔️"), sortOrder: 0 },
        potions: { id: id(s.categories.potions.name, "potions"), name: text(s.categories.potions.name, 40) || "Potions", icon: emoji(s.categories.potions.emoji, "🧪"), sortOrder: 1 },
        materials: { id: id(s.categories.materials.name, "materials"), name: text(s.categories.materials.name, 40) || "Materials", icon: emoji(s.categories.materials.emoji, "🧺"), sortOrder: 2 },
        tools: { id: id(s.categories.tools.name, "tools"), name: text(s.categories.tools.name, 40) || "Tools", icon: emoji(s.categories.tools.emoji, "🧰"), sortOrder: 3 },
    };
    /** The model's words for a minigame or station, over the defaults; one that drops a {placeholder} keeps the default. */
    const wordsOver = (base: Record<string, string>, theirs: Record<string, unknown>) => Object.fromEntries(Object.entries(base).map(([k, v]) => {
        const w = text(theirs[k], 120);
        return [k, w && (v.match(/\{\w+\}/g) ?? []).every((ph) => w.includes(ph)) ? w : v];
    }));

    const statuses = Object.fromEntries((Object.keys(STATUS_IDS) as Array<keyof typeof STATUS_IDS>).map((k) => {
        const base = { poison: { hpPercentPerTurn: -4 }, weaken: { hpPercentPerTurn: 0, stats: { atk: -25 } }, enrage: { hpPercentPerTurn: 0, stats: { atk: 40, def: -20 } } }[k];
        return [STATUS_IDS[k], { id: STATUS_IDS[k], name: text(s.statuses[k].name, 40) || STATUS_IDS[k], emoji: emoji(s.statuses[k].emoji, "✨"), ...base }];
    }));

    const moveIds = new Map<string, string>();
    const moves: Record<string, unknown> = {};
    for (const m of s.moves.slice(0, 16)) {
        if (!MOVE_EFFECTS[m.kind]) continue;
        const mid = id(m.name, "move");
        moveIds.set(m.key, mid);
        moves[mid] = { id: mid, name: text(m.name, 40), emoji: emoji(m.emoji, "⚔️"), telegraph: text(m.telegraph, 80), ...structuredClone(MOVE_EFFECTS[m.kind]) };
    }

    const enemies = s.enemies.slice(0, 24).map((e) => {
        const role: EnemyRole = ROLES.includes(e.role) ? e.role : "normal";
        return { ...e, role, level: role === "boss" ? clamp(e.level, 10, 40) : clamp(e.level, 1, 40) };
    });
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
        return { key: g.key, iid, level, price: n.price, crafted: !!g.crafted };
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
        return { key: p.key, iid, level, price: n.price, crafted: false };
    });
    /** The best of `list` a player at `level` could have. */
    const best = (list: Array<{ iid: string; level: number }>, level: number) => list.filter((x) => x.level <= level).sort((a, b) => b.level - a.level)[0] ?? list[0];

    // Gathering: the model's words over Classic Fantasy's numbers, location by location.
    const findIds = new Map<string, string>();
    const rareFinds = new Set<string>();
    const activities: Record<string, Json> = {};
    const activityFinds: Array<{ words: SetWords | undefined; name: string; finds: string[] }> = [];
    let tools = 0;
    for (const a of s.activities.slice(0, 3)) {
        const game = GAMES[a.game];
        if (!game) continue;
        const aid = id(a.name, "activity");
        const own = a.tools.slice(0, 3);
        const locations: Record<string, Json> = {};
        for (const [tier, l] of a.locations.slice(0, 3).entries()) {
            const loot = l.finds.slice(0, 3).map((f, i) => {
                const iid = id(f.name, "find");
                findIds.set(f.key, iid);
                if (i === 2) rareFinds.add(iid);
                const value = FINDS[tier]![i]!;
                items[iid] = {
                    id: iid, name: text(f.name, 60), emoji: emoji(f.emoji, "🪨"), rarity: value.rarity, description: text(f.description),
                    categoryId: cats.materials.id, price: 0, sellPrice: value.sell, hidden: true, permanent: false, tradeable: true,
                };
                return { itemId: iid, chance: FIND_CHANCES[i]!, min: 1, max: i === 2 ? 1 : 2 };
            });
            if (!loot.length) continue;
            const lid = id(l.name, "location");
            const at = structuredClone(game.locations[tier] ?? {});
            // A location that wants a better tool than the activity has would never open.
            if ((at.minToolTier ?? 0) > own.length) delete at.minToolTier;
            locations[lid] = { ...at, id: lid, name: text(l.name, 60), emoji: emoji(l.emoji, "📍"), loot };
        }
        if (!Object.keys(locations).length) continue;
        const name = text(a.name, 40) || "Gathering";
        activities[aid] = { ...structuredClone(game.fields), id: aid, name, emoji: emoji(a.emoji, "🧺"), skillName: text(a.skillName, 30) || name, words: wordsOver(game.words, a.words), locations };
        activityFinds.push({ words: a.collection, name, finds: Object.values(locations).flatMap((l) => l.loot.map((x: Json) => x.itemId)) });
        for (const [i, t] of own.entries()) {
            const tid = id(t.name, "tool");
            items[tid] = {
                id: tid, name: text(t.name, 60), emoji: emoji(t.emoji, "🧰"), rarity: TOOLS[i]!.rarity, description: text(t.description), categoryId: cats.tools.id,
                price: TOOLS[i]!.price, sellPrice: Math.round(TOOLS[i]!.price / 3), minLevel: TOOLS[i]!.minLevel, tradeable: true,
                tool: { activityId: aid, tier: i + 1, bonus: i + 1 },
            };
            tools++;
        }
    }

    // Crafting: recipes for the world's own gear and potions, from what enemies drop and gathering finds.
    const makes = new Map([...gear, ...potions].map((x) => [x.key, x]));
    const stations: Record<string, Json> = {};
    const craftedOnly: Array<{ iid: string; level: number }> = [];
    for (const st of s.stations.slice(0, 3)) {
        const style = st.style === "simple" ? "simple" : "forge";
        const recipes: Record<string, Json> = {};
        for (const r of st.recipes.slice(0, 12)) {
            const out = makes.get(r.makes);
            const inputs = [...new Set(r.uses.map((k) => findIds.get(k) ?? materialIds.get(k)).filter((x): x is string => !!x))].slice(0, 3);
            if (!out || !inputs.length || Object.values(stations).some((x) => x.recipes[out.iid]) || recipes[out.iid]) continue;
            const qty = clamp(2 + out.level / 5, 2, 10);
            recipes[out.iid] = {
                id: out.iid,
                inputs: inputs.map((itemId, i) => ({ itemId, quantity: rareFinds.has(itemId) ? 1 : i === 0 ? qty : Math.ceil(qty / 2) })),
                output: { itemId: out.iid, quantity: 1 },
                // Classic Fantasy's: the skill about matches the level, the XP about ten per level, the gold about a third of the shop price.
                minSkill: clamp(out.level * 0.9, 1, 40), skillXp: Math.max(15, out.level * 10), gold: Math.round(out.price * 0.3),
            };
            if (out.crafted) {
                Object.assign(items[out.iid]!, { price: 0, hidden: true });
                craftedOnly.push(out);
            }
        }
        if (!Object.keys(recipes).length) continue;
        const sid = id(st.name, "station");
        const name = text(st.name, 40) || "Crafting";
        stations[sid] = { ...structuredClone(STYLES[style]!.fields), id: sid, name, emoji: emoji(st.emoji, "🛠️"), skillName: text(st.skillName, 30) || name, style, words: wordsOver(STYLES[style]!.words, st.words), recipes };
    }

    const characters = {
        shopkeeper: { id: id(s.shopkeeper.name, "shopkeeper"), name: text(s.shopkeeper.name, 60), avatar: emoji(s.shopkeeper.emoji, "🧙") },
        announcer: { id: id(s.announcer.name, "announcer"), name: text(s.announcer.name, 60), avatar: emoji(s.announcer.emoji, "📯") },
    };

    const placeIds = new Map<string, string>();
    const bestiaries = new Map<string, SetWords | undefined>();
    const places: Record<string, { id: string; enemies: Array<{ enemyId: string; weight: number }> } & Record<string, unknown>> = {};
    for (const p of s.places.slice(0, 8)) {
        const pid = id(p.name, "place");
        placeIds.set(p.key, pid);
        bestiaries.set(pid, p.bestiary);
        places[pid] = { id: pid, name: text(p.name, 60), emoji: emoji(p.emoji, "🗺️"), arrival: text(p.arrival, 80), channelIds: [], enemies: [], fights: "thread" };
    }

    const enemyIds = new Map<string, { id: string; xp: number; gold: number }>();
    const enemyMap: Record<string, unknown> = {};
    const enemyLevels = new Map<string, number>();
    const bosses: string[] = [];
    for (const e of enemies) {
        const eid = id(e.name, "enemy");
        const role = e.role;
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
        enemyLevels.set(eid, e.level);
        // A world boss turns up on its own; everything else lives in a place (the model's, or the nearest by order).
        if (role === "boss") {
            bosses.push(eid);
            continue;
        }
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

    // Collections: each place's enemies (the boss in the last), each activity's finds, the crafting-only gear. Rewards at half and all, by level.
    const sets: Record<string, Json> = {};
    const avg = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;
    const addSet = (words: SetWords | undefined, fallback: Words, entries: Array<{ kind: "item" | "enemy"; id: string }>, half: number, all: number, xp: number) => {
        if (entries.length < 3) return;
        const w = words && typeof words === "object" ? words : {};
        const cid = id(w.name || fallback.name, "collection");
        sets[cid] = {
            id: cid, name: text(w.name, 60) || fallback.name, emoji: emoji(w.emoji, fallback.emoji), description: text(w.description), entries,
            milestones: [
                { at: Math.ceil(entries.length / 2), actions: [{ type: "giveGold", amount: Math.round(half) }] },
                { at: entries.length, actions: [{ type: "giveGold", amount: Math.round(all) }, ...(xp ? [{ type: "giveCombatXp", amount: Math.round(xp) }] : [])] },
            ],
        };
    };
    const livePlaces = Object.values(places).filter((p) => p.enemies.length);
    for (const [i, p] of livePlaces.entries()) {
        const eids = [...p.enemies.map((e) => e.enemyId), ...(i === livePlaces.length - 1 ? bosses : [])];
        const n = enemyPreset(Math.round(avg(eids.map((e) => enemyLevels.get(e)!))), "normal");
        addSet(bestiaries.get(p.id), { name: String(p.name), emoji: "📖" }, eids.map((e) => ({ kind: "enemy", id: e })), n.goldReward * 2.5, n.goldReward * 8, n.xpReward * 3);
    }
    for (const a of activityFinds) {
        const sell = a.finds.reduce((sum, f) => sum + Number(items[f]!.sellPrice), 0);
        addSet(a.words, { name: a.name, emoji: "🎒" }, a.finds.map((f) => ({ kind: "item", id: f })), Math.max(25, sell * 0.07), sell * 0.25, 150);
    }
    const L = craftedOnly.length ? avg(craftedOnly.map((c) => c.level)) : 0;
    addSet(s.crafted, { name: "Crafted", emoji: "⚒️" }, craftedOnly.map((c) => ({ kind: "item", id: c.iid })), L * 6, L * 18, L * 10);

    // Achievements: Classic Fantasy's goals and rewards under the world's names, leaving out any for a feature this world doesn't have.
    const setCount = Object.keys(sets).length;
    const achievements: Record<string, Json> = {};
    for (const a of Object.values(CF.achievements.achievements) as Json[]) {
        const stat = a.conditions.statKey;
        if ((stat === "gatherRuns" && !Object.keys(activities).length) || (stat === "craftsMade" && !Object.keys(stations).length)) continue;
        if (stat === "collectionsCompleted" && (a.conditions.value > 1 ? setCount < 2 : !setCount)) continue;
        const name = text(s.achievements?.[a.id], 60) || a.name;
        const aid = id(name, a.id);
        const copy: Json = { ...structuredClone(a), id: aid, name };
        if (stat === "collectionsCompleted" && a.conditions.value > 1) copy.conditions.value = setCount;
        // Its item reward is Classic Fantasy's own; the world's best gear at that level stands in.
        if (copy.reward.itemId) copy.reward = gear.length ? { itemId: best(gear, a.conditions.value)!.iid, quantity: 1 } : { gold: 400 };
        achievements[aid] = copy;
    }

    return {
        id: packId,
        name: text(s.name, 60) || "Your world",
        description: text(s.description, 400),
        tagline: text(s.tagline, 100),
        content: {
            shop: { categories: { [cats.gear.id]: cats.gear, [cats.potions.id]: cats.potions, [cats.materials.id]: cats.materials, ...(tools && { [cats.tools.id]: cats.tools }) }, items: items as never },
            combat: { enemies: enemyMap as never, places: Object.fromEntries(Object.entries(places).filter(([, p]) => p.enemies.length)) as never, moves: moves as never, statuses: statuses as never },
            quests: { quests: quests as never },
            achievements: { achievements: achievements as never },
            ...(setCount && { collections: { sets: sets as never } }),
            ...(Object.keys(activities).length && { gathering: { activities: activities as never } }),
            ...(Object.keys(stations).length && { crafting: { stations: stations as never } }),
            characters: { list: { [characters.shopkeeper.id]: characters.shopkeeper, [characters.announcer.id]: characters.announcer }, shopkeeperId: characters.shopkeeper.id, announcerId: characters.announcer.id },
        },
    };
}
