import { enemyPreset, type EnemyRole, type GearSlot, type Rarity } from "./balance.ts";
import { DEFAULT_MOVES, DEFAULT_STATUSES, enemyMoveList, moveById, type EnemyMove, type FightConfig, type MoveConfig, type StatusConfig } from "./fight.ts";
import {
    hash, LEVEL, POOL_SIZE, shuffled, statsAt, GRID, PULLS, TUNNEL,
    EFFECT_KINDS, ENRAGE_STATUS, ITEM_KINDS, REGEN_STATUS, RELICS, TRAITS, act, mapScore, startState, SIDE, START_NODE,
    type Daily, type DailyEnemy, type DailyOverride, type DayMap, type Find, type GatherSpec, type MapAction, type MapNode, type MapState, type Perk, type Recipe, type Slot, type ItemKind, type Shrine, type ShopItem, type Stats,
} from "./daily.ts";
import classicFantasy from "./packs/classic-fantasy.json" with { type: "json" };
import dustwater from "./worlds/dustwater.json" with { type: "json" };
import frontierStation from "./packs/frontier-station.json" with { type: "json" };
import frostmarch from "./worlds/frostmarch.json" with { type: "json" };
import glassDunes from "./worlds/glass-dunes.json" with { type: "json" };
import hollyhockHollow from "./worlds/hollyhock-hollow.json" with { type: "json" };
import lanternCoast from "./worlds/lantern-coast.json" with { type: "json" };
import neonUndercity from "./worlds/neon-undercity.json" with { type: "json" };
import sporedeep from "./worlds/sporedeep.json" with { type: "json" };
import sugarfen from "./worlds/sugarfen.json" with { type: "json" };
import sunkenIsles from "./worlds/sunken-isles.json" with { type: "json" };
import thornwickAcademy from "./worlds/thornwick-academy.json" with { type: "json" };
import yokaiValley from "./worlds/yokai-valley.json" with { type: "json" };

/**
 * The worlds the Daily turns through, and the day built from them. Kept apart
 * from daily.ts so the page's own code doesn't carry every world: the server
 * builds the day and hands it over.
 */

type WorldItem = { id: string; name: string; emoji: string; rarity?: string; equipSlot?: string; actions?: Record<string, { type: string; statId?: string }> };
type World = {
    id: string;
    name: string;
    content: {
        combat: {
            enemies: Record<string, { id: string; name: string; emoji: string; boss?: boolean; minLevel?: number; moves?: EnemyMove[] }>;
            moves: Record<string, MoveConfig>;
            statuses?: Record<string, StatusConfig>;
        };
        shop: { items: Record<string, WorldItem> };
        gathering: { activities: Record<string, { id: string; name: string; emoji: string; locations: Record<string, { id: string; name: string; emoji: string; loot?: { itemId: string; chance: number }[] }> }> };
    };
};

/** The worlds the Daily turns through, one a day. */
// One a day in this order, mixed so two alike don't come back to back. New ones: web/scripts/daily-world.mts.
export const WORLDS = [
    classicFantasy, sunkenIsles, hollyhockHollow, neonUndercity, glassDunes,
    thornwickAcademy, frontierStation, frostmarch, sugarfen, lanternCoast,
    dustwater, yokaiValley, sporedeep,
] as unknown as World[];

const ENEMY_LEVEL = 21;
// A world boss's own numbers are for a whole server: alone, an elite's, with more HP.
/** The map's enemies: four mobs, easiest first, and its elites. Mobs are fights you can win for XP. */
const MAP_MOBS: Array<{ role: EnemyRole; hp: number; level: number }> = [
    { role: "weak", hp: 1.8, level: 14 },
    { role: "normal", hp: 1.8, level: 14 },
    { role: "normal", hp: 1.8, level: 17 },
    { role: "tough", hp: 1.8, level: 17 },
];
const MAP_ELITE = { role: "elite" as EnemyRole, hp: 1, level: 21 };
// On the map the boss is met fresh, after whatever you prepared, so it has to be a wall that levels, gear and
// relics get you over. Each day's boss has two traits (withTraits, with less HP for the nastier pairs: TRAIT_HP)
// and each elite offers three relics (withRelics); gear takes one of three slots. Fights use energy, enemies
// follow habits and their worst move winds up for a turn and hits hard (withPatterns), so a guard timed on it
// (a parry) is the skill. Simulated over 12 days with a simple planner: guarding wind-ups beats twice as many
// days as attacking every turn (6 against 3), and neither rushing nor skipping fights ever wins.
const BOSS = { role: "elite" as EnemyRole, hp: 3.5, level: 21 };
/** The shrines a day can have, one a day: each a blessing for the boss, some with a price. */
const SHRINES: Shrine[] = [
    { name: "Shrine of Might", emoji: "⚔️", atk: 30 },
    { name: "Shrine of Stone", emoji: "🗿", def: 20, maxHp: 90 },
    { name: "Blood Altar", emoji: "🩸", atk: 60, hpCost: 30 },
    { name: "Shrine of the Wind", emoji: "🌪️", spd: 40, crit: 15 },
    { name: "Gambler's Idol", emoji: "🎲", crit: 35, def: -20 },
];
const FIND_VALUE: Record<string, number> = { poor: 16, common: 30, uncommon: 50, rare: 90, epic: 160, legendary: 240 };
/**
 * What each kind of shop item does and costs, and which of the world's items
 * it takes its name from. Prices are set so a day's gold buys two or three.
 */
const KINDS: Record<ItemKind, { from: "potion" | GearSlot[] | { name: string; emoji: string }; rarity: Rarity; price: number; stats?: Stats; stock?: number; slot?: Slot }> = {
    weapon: { from: ["weapon"], rarity: "uncommon", price: 90, stats: { atk: 22 }, slot: "weapon" },
    heavy: { from: ["weapon"], rarity: "rare", price: 100, stats: { atk: 40, spd: -25 }, slot: "weapon" },
    // DEF is kept small everywhere: the damage formula takes most of it off every hit, so it stacks fast.
    armour: { from: ["body", "shield"], rarity: "uncommon", price: 110, stats: { def: 9, hp: 100 }, slot: "armour" },
    boots: { from: ["feet"], rarity: "uncommon", price: 60, stats: { spd: 20, def: 2 }, slot: "trinket" },
    charm: { from: ["accessory", "hands", "head"], rarity: "rare", price: 70, stats: { crit: 20 }, slot: "trinket" },
    teacher: { from: ["weapon", "hands", "accessory"], rarity: "rare", price: 70, stats: { atk: 15 }, slot: "weapon" },
    potion: { from: "potion", rarity: "common", price: 50, stock: 3 },
    elixir: { from: "potion", rarity: "rare", price: 70 },
    featured: { from: ["weapon", "body", "legs", "head"], rarity: "epic", price: 160, stats: { atk: 30, def: 6, hp: 90 }, slot: "armour" },
    // Effect items: carried in the bag, used in a fight for a turn. Their moves are in EFFECT_MOVES.
    bomb: { from: { name: "Bomb", emoji: "💣" }, rarity: "uncommon", price: 45, stock: 2 },
    tonic: { from: { name: "Tonic of Might", emoji: "💪" }, rarity: "uncommon", price: 40, stock: 2 },
    draught: { from: { name: "Energy Draught", emoji: "⚡" }, rarity: "uncommon", price: 35, stock: 2 },
    antidote: { from: { name: "Antidote", emoji: "🌿" }, rarity: "common", price: 30, stock: 2 },
};
/** What each effect item does when used: a move of its own. */
const EFFECT_MOVES: Record<(typeof EFFECT_KINDS)[number], MoveConfig> = {
    bomb: { id: "use-bomb", name: "Bomb", emoji: "💣", effects: [{ type: "hit", power: 2.5, pierce: 100 }] },
    tonic: { id: "use-tonic", name: "Tonic of Might", emoji: "💪", effects: [{ type: "status", statusId: "daily-might", turns: 3, target: "self" }] },
    draught: { id: "use-draught", name: "Energy Draught", emoji: "⚡", energy: -3, effects: [] },
    antidote: { id: "use-antidote", name: "Antidote", emoji: "🌿", effects: [{ type: "cleanse", harmfulOnly: true }, { type: "heal", percent: 15 }] },
};
const MIGHT: StatusConfig = { id: "daily-might", name: "Might", emoji: "💪", hpPercentPerTurn: 0, stats: { atk: 40 } };
/** Gear kinds a day sells, besides a potion and one effect item every day. */
const GEAR_A_DAY = 4;
const POTION_HEAL_SHARE = 0.35;
/** The elixir's status: every fight starts with it on. */
const ELIXIR = { id: "daily-elixir", turns: 2, atk: 40 };
/** Bosses are drawn from the world's boss and its strongest few, so the same one doesn't come back every few days. */
const BOSS_CANDIDATES = 4;


type WorldEnemy = World["content"]["combat"]["enemies"][string];

/** An enemy's words from its world, its numbers from the balance tables. */
function enemyAt(e: WorldEnemy, at: { role: EnemyRole; hp: number; level?: number }): DailyEnemy {
    const n = enemyPreset(at.level ?? ENEMY_LEVEL, at.role);
    return {
        name: e.name, emoji: e.emoji, ...(e.moves && { moves: e.moves }),
        atk: n.atk, def: n.def, spd: n.spd, critChance: n.critChance, critMultiplier: n.critMultiplier,
        hp: Math.round(n.hp * at.hp),
    };
}

/** A gathering game's tiles from a place's loot, seeded by `seed`. */
function tilesFor(seed: number, game: GatherSpec["game"], placeLoot: { itemId: string; chance: number }[], items: Record<string, WorldItem>): GatherSpec["tiles"] {
    const loot = placeLoot.filter((l) => items[l.itemId]);
    const total = loot.reduce((sum, l) => sum + l.chance, 0);
    const findsOf = (n: number, salt: number) => Array.from({ length: n }, (_, i): Find => {
        let roll = (hash(seed * 7919 + salt * 101 + i) % 10_000) / 10_000 * total;
        const pick = loot.find((l) => (roll -= l.chance) < 0) ?? loot[0]!;
        const item = items[pick.itemId]!;
        return { name: item.name, emoji: item.emoji, rarity: item.rarity ?? "common", value: FIND_VALUE[item.rarity ?? "common"] ?? 15 };
    });
    if (game === "pulls") {
        // Each catch is worth more than the last; whether the line holds is down to timing (reelZone in daily.ts).
        return findsOf(PULLS.zone.length, 1).map((f, k) => ({ ...f, value: Math.max(1, Math.round(f.value * PULLS.worth * (1 + PULLS.growth * k))) }));
    }
    if (game === "tunnel") {
        // The descent: the top level safe, then one cave-in a level; finds on about half the rest, worth more the deeper.
        const { rows, cols } = TUNNEL;
        const finds = findsOf(TUNNEL.size, 2);
        return [...Array(TUNNEL.size).keys()].map((i) => {
            const row = Math.floor(i / cols);
            if (row > 0 && i % cols === hash(seed * 131 + row) % cols) return "hazard";
            if (hash(seed * 137 + i) % 100 >= TUNNEL.ore) return null;
            const f = finds[i]!;
            return { ...f, value: Math.round(f.value * (1 + TUNNEL.depth * row)) };
        }).slice(0, rows * cols);
    }
    return shuffled([...findsOf(GRID.finds, 0), ...Array<"hazard">(GRID.hazards).fill("hazard"), ...Array<null>(GRID.size - GRID.finds - GRID.hazards).fill(null)], seed, 4);
}

/**
 * The minigame that suits an activity, by its name: fishing is reeled in (pulls), anything that goes down
 * into the ground (mining, delving, digging, diving) is the descent (tunnel), and searching the surface
 * (gardening, foraging, scavenging, and anything else) is the dig (grid).
 */
export function gameFor(activity: { name: string }): GatherSpec["game"] {
    if (/fish|angl|reel|cast/i.test(activity.name)) return "pulls";
    if (/min(e|ing)|quarr|delv|dig|div(e|ing)|prospect|excavat|tunnel|cave/i.test(activity.name)) return "tunnel";
    return "grid";
}

/** Tiles a Manhattan distance from the middle. */
function far(id: number): number {
    const c = Math.floor(SIDE / 2);
    return Math.abs((id % SIDE) - c) + Math.abs(Math.floor(id / SIDE) - c);
}

/** Every open tile reachable from the start. */
function connected(blocked: Set<number>): boolean {
    const open = [...Array(SIDE * SIDE).keys()].filter((i) => !blocked.has(i));
    const seen = new Set([START_NODE]);
    const queue = [START_NODE];
    while (queue.length) {
        const at = queue.shift()!;
        const x = at % SIDE, y = Math.floor(at / SIDE);
        for (const [a, b] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
            const n = b * SIDE + a;
            if (a >= 0 && b >= 0 && a < SIDE && b < SIDE && !blocked.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
        }
    }
    return open.every((i) => seen.has(i));
}

/** Gear the forge makes, by recipe: something you can't buy. */
const CRAFTED: Array<{ from: GearSlot[]; stats: Stats; slot: Slot }> = [
    { from: ["weapon"], stats: { atk: 35, crit: 10 }, slot: "weapon" },
    { from: ["body", "shield", "legs"], stats: { def: 10, hp: 140 }, slot: "armour" },
];

/** What a point of each stat is worth, for gear's budgets: the shop's prices were set on these. */
const WORTH = { atk: 1, def: 2.5, hp: 0.1, spd: 0.4, crit: 1 } as const;
type StatKey = keyof typeof WORTH;
/** A piece of gear's value: the sum of its stats' worth. */
function worthOf(stats: Stats): number {
    return (Object.entries(stats) as Array<[StatKey, number]>).reduce((sum, [k, v]) => sum + v * WORTH[k], 0);
}
/** A drawback's smallest and biggest size, per stat. */
const DRAWBACK_MIN: Record<StatKey, number> = { atk: 4, def: 3, hp: 40, spd: 8, crit: 5 };
const DRAWBACK_CAP: Record<StatKey, number> = { atk: 15, def: 6, hp: 90, spd: 25, crit: 10 };
/** The perk each slot can roll: a weapon drinks, armour bites back, a trinket starts you charged. */
const PERKS: Record<Slot, Perk> = { weapon: { lifesteal: 6 }, armour: { thorns: 12 }, trinket: { energy: 1 } };

/**
 * A piece of gear rolled for the day: the same value as `like` (so prices still fit), spent its own way.
 * Its `lead` stat always gets most of it; sometimes a second stat shares it, sometimes a drawback pays
 * for more (`drawback` forces one), and now and then a perk takes a quarter of it. Seeded, so it's the
 * same for everyone that day.
 */
function rollGear(slot: Slot, like: Stats, seed: number, drawback = false): { stats: Stats; perk?: Perk } {
    const r = (k: number) => (hash(seed * 7919 + k * 104729) % 1000) / 1000;
    const lead = (Object.entries(like) as Array<[StatKey, number]>).sort((a, b) => b[1] * WORTH[b[0]] - a[1] * WORTH[a[0]])[0]![0];
    let budget = worthOf(like);
    const out: Partial<Record<StatKey, number>> = {};
    let perk: Perk | undefined;
    if (r(0) < 0.3) { perk = PERKS[slot]; budget *= 0.75; }
    // A drawback, paid back at four-fifths of what it costs: never so small it's a rounding error, never crippling.
    const downs: StatKey[] = slot === "armour" ? ["spd"] : slot === "weapon" ? ["spd", "def"] : ["hp", "def"];
    if (drawback || (budget >= 20 && r(1) < 0.35)) {
        const k = downs.filter((d) => d !== lead)[Math.floor(r(2) * downs.length) % downs.length] ?? "spd";
        const n = Math.min(DRAWBACK_CAP[k], Math.max(DRAWBACK_MIN[k], Math.round(((0.25 + r(3) * 0.25) * budget) / WORTH[k])));
        out[k] = -n;
        budget += n * WORTH[k] * 0.8;
    }
    // Armour always has both DEF and HP, split its own way; the rest sometimes take a second stat.
    // (A weapon that pays with a drawback is heavy: it never rolls speed.)
    const seconds: StatKey[] = slot === "armour" ? [lead === "def" ? "hp" : "def"] : slot === "weapon" ? (drawback ? ["crit"] : ["crit", "spd"]) : ["atk", "hp", "def"].filter((k) => k !== lead) as StatKey[];
    const second = seconds.filter((k) => out[k] == null)[Math.floor(r(4) * seconds.length) % seconds.length];
    if (second && (slot === "armour" || r(5) < 0.6)) {
        const share = (slot === "armour" ? 0.3 : 0.15) + r(6) * 0.3;
        out[second] = Math.round((budget * share) / WORTH[second]);
        budget -= budget * share;
    }
    out[lead] = Math.round(budget / WORTH[lead]);
    return { stats: out as Stats, ...(perk && { perk }) };
}

/**
 * The day's map: cliffs that roads go around, the boss's lair far from the
 * start, the town near it, and the rest (forge, shrine, campfire, four
 * gathering spots, four enemies, two elites) spread over what's left.
 */
function buildMap(day: number, world: World, normals: WorldEnemy[], elites: WorldEnemy[], boss: WorldEnemy, shrine: Shrine, shopIds: Set<string>, firstPlace?: string): DayMap {
    const { gathering, shop } = world.content;
    // Cliffs: three tiles off the middle, kept only if every other tile can still be reached.
    let blocked = new Set<number>();
    for (let salt = 0; salt < 20; salt++) {
        blocked = new Set(shuffled([...Array(SIDE * SIDE).keys()].filter((i) => far(i) >= 2), day, 60 + salt).slice(0, 3));
        if (connected(blocked)) break;
    }
    const open = [...Array(SIDE * SIDE).keys()].filter((i) => i !== START_NODE && !blocked.has(i));
    const lair = shuffled(open.filter((i) => far(i) >= 3), day, 61)[0]!;
    const town = shuffled(open.filter((i) => i !== lair && far(i) <= 2), day, 62)[0]!;
    const rest = shuffled(open.filter((i) => i !== lair && i !== town), day, 63);
    const nodes: MapNode[] = [...Array(SIDE * SIDE).keys()].map((id) => ({ id, kind: "wild", name: "Open road", emoji: "🌾" }));
    for (const id of blocked) nodes[id] = { id, kind: "blocked", name: "Cliffs", emoji: "⛰️" };
    nodes[START_NODE] = { id: START_NODE, kind: "start", name: "Crossroads", emoji: "🧭" };
    nodes[lair] = { id: lair, kind: "lair", name: `${boss.name}'s lair`, emoji: boss.emoji, enemy: enemyAt(boss, BOSS) };
    nodes[town] = { id: town, kind: "town", name: "Town", emoji: "🏘️" };

    // Four gathering spots: different activities and places where the world has them, each its natural game.
    // An admin's "activity/location" pick is the first.
    const [chosenActivity, chosenPlace] = (firstPlace ?? "").split("/");
    const chosen = gathering.activities[chosenActivity ?? ""];
    const activities = [...(chosen ? [chosen] : []), ...shuffled(Object.values(gathering.activities).filter((a) => a !== chosen), day, 64)];
    const spots = [0, 1, 2, 3].map((k): GatherSpec => {
        const activity = activities[k % activities.length]!;
        const place = (k === 0 && chosen?.locations[chosenPlace ?? ""])
            || shuffled(Object.values(activity.locations), day, 65 + k)[Math.floor(k / activities.length)] || Object.values(activity.locations)[0]!;
        const game = gameFor(activity);
        return { game, name: activity.name, emoji: activity.emoji, place: `${place.emoji} ${place.name}`, tiles: tilesFor(day * 11 + k, game, place.loot ?? [], shop.items) };
    });

    const features: Array<Omit<MapNode, "id">> = [
        { kind: "forge", name: "Forge", emoji: "⚒️" },
        { kind: "shrine", name: shrine.name, emoji: shrine.emoji },
        { kind: "camp", name: "Campfire", emoji: "🏕️" },
        ...spots.map((g): Omit<MapNode, "id"> => ({ kind: "gather", name: g.place.replace(/^\S+ /, ""), emoji: g.emoji, gather: g })),
        ...normals.slice(0, 4).map((e, k): Omit<MapNode, "id"> => ({ kind: "enemy", name: e.name, emoji: e.emoji, enemy: enemyAt(e, MAP_MOBS[k]!) })),
        ...elites.slice(0, 2).map((e): Omit<MapNode, "id"> => ({ kind: "elite", name: e.name, emoji: e.emoji, enemy: enemyAt(e, MAP_ELITE), trophy: { name: `${e.name}'s Trophy`, emoji: e.emoji } })),
    ];
    features.forEach((f, k) => { const id = rest[k]; if (id != null) nodes[id] = { id, ...f }; });

    // Two recipes, from what the gathering spots can turn up: three of one spot's commonest find, one of another's rarest.
    const findsAt = (g: GatherSpec) => g.tiles.filter((t): t is Find => !!t && t !== "hazard");
    const items = Object.values(shop.items);
    const recipes = CRAFTED.map((c, k): Recipe => {
        const a = findsAt(spots[k]!), b = findsAt(spots[(k + 2) % 4]!);
        const common = [...a].sort((x, y) => a.filter((t) => t.name === y.name).length - a.filter((t) => t.name === x.name).length)[0]!;
        // The second recipe needs an elite's trophy: a reason to take one on.
        const trophyFrom = k === 1 ? nodes.find((n) => n.kind === "elite") : undefined;
        const commonOf = (fs: Find[]) => [...fs].sort((x, y) => fs.filter((t) => t.name === y.name).length - fs.filter((t) => t.name === x.name).length)[0]!;
        const rare = trophyFrom?.trophy ? { ...trophyFrom.trophy, value: 0 } : commonOf(b.filter((t) => t.name !== common.name).length ? b.filter((t) => t.name !== common.name) : b);
        const item = shuffled(items.filter((it) => c.from.includes(it.equipSlot as GearSlot) && !shopIds.has(it.id)), day, 70 + k)[0] ?? items[0]!;
        return {
            id: `craft-${k}`,
            // Two of the spot's commonest find and one more thing: reachable in a single good visit.
            needs: [{ name: common.name, emoji: common.emoji, count: 2 }, { name: rare.name, emoji: rare.emoji, count: 1 }].filter((n, i, all) => all.findIndex((m) => m.name === n.name) === i),
            gives: { id: "featured", name: item.name, emoji: item.emoji, rarity: "epic", price: 0, stock: 1, slot: c.slot, ...rollGear(c.slot, c.stats, day * 97 + 50 + k) },
        };
    });
    return { nodes, recipes };
}

/** Energy a player move costs (positive) or builds (negative): basic hits and guards build one, the rest cost by what they do. */
function energyFor(m: MoveConfig): number {
    const power = m.effects.reduce((sum, e) => sum + (e.type === "hit" ? e.power * (e.hits ?? 1) : 0), 0);
    const extra = m.effects.some((e) => (e.type === "stun" && !e.when) || e.type === "status" || e.type === "heal" || (e.type === "boost" && e.target === "target")) ? 1 : 0;
    // Plain and light hits (Quick Jab's interrupt only counts against a wind-up) build energy; guards too.
    if (m.effects.some((e) => e.type === "guard") || (power <= 1 && !extra)) return -1;
    return Math.max(1, Math.min(3, Math.round(power * 0.9 + extra)));
}

/** How dangerous an enemy move is, for ordering its habit: its damage, more for a wind-up. */
function threatOf(m: MoveConfig): number {
    return m.effects.reduce((sum, e) => sum + (e.type === "hit" ? e.power * (e.hits ?? 1) : e.type === "stun" ? 1 : e.type === "status" ? 0.6 : 0), 0) + (m.charge ? 1 : 0);
}

/**
 * Gives every enemy on the map a habit: its plainest move most turns, its
 * worst every few, in a loop. The screen shows what's coming two turns out,
 * so a fight is read and planned rather than reacted to.
 */
/** How hard a wind-up hits, in plain hits: enough that guarding it (a parry, which blocks it all) beats a turn of damage. */
const WINDUP_POWER = 5;

function withPatterns(map: DayMap, config: FightConfig, day: number): DayMap {
    for (const node of map.nodes) {
        if (!node.enemy) continue;
        const ids = [...new Set(enemyMoveList(node.enemy).map((m) => m.moveId))].sort((a, b) => threatOf(moveById(config, a)) - threatOf(moveById(config, b)));
        const hits = (id: string) => moveById(config, id).effects.some((e) => e.type === "hit" && e.target !== "self");
        const attacks = ids.filter(hits);
        // Its weakest attack most turns, its worst every few, and a guard or a buff (else another attack) for a change of pace.
        const plain = attacks[0] ?? ids[0]!, worst = ids[ids.length - 1]!;
        const middle = ids.find((id) => !hits(id)) ?? attacks[Math.floor(attacks.length / 2)] ?? plain;
        // Its worst move takes a turn to wind up, so a telegraphed hit can be guarded or interrupted.
        // (Not a move the player can use too: their copy shares the id.)
        const big = config.combat?.moves?.[worst];
        if (big && worst !== plain && !big.players && big.effects.some((e) => e.type === "hit" && e.target !== "self")) {
            // …and hits like several plain hits, so letting it land is a real cost, not a rounding error.
            const power = big.effects.reduce((sum, e) => sum + (e.type === "hit" && e.target !== "self" ? e.power * (e.hits ?? 1) : 0), 0);
            const scale = Math.max(1, WINDUP_POWER / power);
            const effects = big.effects.map((e) => (e.type === "hit" && e.target !== "self" ? { ...e, power: Math.round(e.power * scale * 10) / 10 } : e));
            config.combat!.moves![worst] = { ...big, effects, charge: big.charge || 1 };
        }
        const loop = [plain, plain, worst, plain, middle];
        const turn = hash(day * 101 + node.id) % loop.length;
        node.enemy = { ...node.enemy, pattern: [...loop.slice(turn), ...loop.slice(0, turn)] };
    }
    return map;
}

/** Each elite offers three relics, and the two elites offer different ones where they can. */
function withRelics(map: DayMap, day: number): DayMap {
    const pool = shuffled(RELICS.map((r) => r.id), day, 90);
    map.nodes.filter((n) => n.kind === "elite").forEach((n, k) => { n.relics = [0, 1, 2].map((i) => pool[(k * 3 + i) % pool.length]!); });
    return map;
}

/** What each boss trait leaves of its HP, so the hard pairs (Enrage + Thorns) aren't walls. */
const TRAIT_HP: Record<string, number> = { "thick-hide": 1, regenerates: 0.85, thorns: 0.8, enrage: 0.85, swift: 0.9 };

/** The boss's traits for the day: two, from the list, set on its lair's enemy. */
function withTraits(map: DayMap, day: number): DayMap {
    const lair = map.nodes.find((n) => n.kind === "lair");
    if (!lair?.enemy) return map;
    const traits = shuffled(TRAITS.map((t) => t.id), day, 91).slice(0, 2);
    const e: DailyEnemy = { ...lair.enemy, traits };
    if (traits.includes("thick-hide")) e.armor = 25;
    if (traits.includes("thorns")) e.thorns = 15;
    if (traits.includes("enrage")) e.enrage = { at: 50, statusId: ENRAGE_STATUS };
    if (traits.includes("swift")) e.spd = 999;
    // The nastier the traits, the less HP: every pair should be about as hard to beat.
    e.hp = Math.round(e.hp * traits.reduce((f, t) => f * (TRAIT_HP[t] ?? 1), 1));
    lair.enemy = e;
    return map;
}

export function dailyFor(day: number, override: DailyOverride = {}): Daily {
    const world = WORLDS.find((w) => w.id === override.world) ?? WORLDS[(day - 1) % WORLDS.length]!;
    const { combat, shop } = world.content;
    const all = Object.values(combat.enemies);
    const strongest = all.filter((e) => !e.boss).sort((a, b) => (b.minLevel ?? 0) - (a.minLevel ?? 0)).slice(0, BOSS_CANDIDATES);
    const boss = combat.enemies[override.boss ?? ""] ?? shuffled([...all.filter((e) => e.boss), ...strongest], day, 6)[0]!;
    const picked = (override.mobs ?? []).flatMap((id) => combat.enemies[id] ?? []);
    // The strong ones are kept for the boss slot, so a Lich never warms up for a Golem.
    // Normals from the weaker half of the rest, elites from the stronger half: a rat is never an elite.
    const rest = all.filter((e) => !e.boss && !strongest.includes(e) && !picked.includes(e)).sort((a, b) => (a.minLevel ?? 0) - (b.minLevel ?? 0));
    const half = Math.ceil(rest.length / 2);
    const normals = picked.length === 2 ? picked : shuffled(rest.slice(0, half), day, 1).slice(0, 2);
    const elites = shuffled(rest.slice(half).filter((e) => !normals.includes(e)), day, 11).slice(0, 2);

    const own = Object.values(combat.moves).filter((m) => m.players);
    const source = own.length > 3 ? world : WORLDS[0]!;
    const playable = movesFor(world.id);

    const chosenMoves = (override.moves ?? []).filter((id) => playable.some((m) => m.id === id));
    const movePool = ["attack", ...(chosenMoves.length ? chosenMoves : shuffled(playable.map((m) => m.id), day, 5).slice(0, POOL_SIZE - 1))];
    // Every day has a way to parry (below): reading the enemy's wind-ups is the skill the fights are built on.
    const guards = (id: string) => playable.find((m) => m.id === id)?.effects.some((e) => e.type === "guard");
    if (!chosenMoves.length && !movePool.some(guards)) movePool[movePool.length - 1] = "guard";

    // Five kinds a day: a potion on most days, the rest drawn. Each takes the name of a different item of the world's.
    const chosenKinds = (override.kinds ?? []).filter((k) => ITEM_KINDS.includes(k));
    // Every day: a potion, one of the effect items, and four kinds of gear.
    const effect = shuffled([...EFFECT_KINDS], day, 14)[0]!;
    const kinds: ItemKind[] = chosenKinds.length ? chosenKinds : [
        "potion", effect,
        ...shuffled(ITEM_KINDS.filter((k) => k !== "potion" && !(EFFECT_KINDS as readonly string[]).includes(k)), day, 7).slice(0, GEAR_A_DAY),
    ];
    const items = Object.values(shop.items);
    // Worlds list their healing items weakest first: the potion is named after the first, the elixir after the last.
    const potions = items.filter((it) => Object.values(it.actions ?? {}).some((a) => a.type === "giveStat" && a.statId === "health"));
    const used = new Set<string>();
    const nameFor = (kind: ItemKind, i: number) => {
        const from = KINDS[kind].from;
        if (typeof from === "object" && !Array.isArray(from)) return { id: kind, ...from };
        const options = from === "potion"
            ? (kind === "elixir" ? [...potions].reverse() : potions)
            : shuffled(items.filter((it) => from.includes(it.equipSlot as GearSlot)), day, 30 + i);
        const item = options.find((it) => !used.has(it.id)) ?? options[0];
        if (item) used.add(item.id);
        return item;
    };
    // Not the basics: gear should teach something worth a fifth button.
    const taughtMove = shuffled(playable.filter((m) => !movePool.includes(m.id) && !(m.id in DEFAULT_MOVES)), day, 8)[0];
    const elixirStatus: Record<string, StatusConfig> = {};
    const shopItems = kinds.flatMap((kind, i): ShopItem[] => {
        const k = KINDS[kind];
        const item = nameFor(kind, i);
        if (kind === "teacher" && !taughtMove) return [];
        const base: ShopItem = {
            id: kind, name: item?.name ?? kind, emoji: item?.emoji ?? "📦", rarity: k.rarity, price: k.price, stock: k.stock ?? 1,
            ...(k.stats && { stats: k.stats }),
            ...(k.slot && { slot: k.slot }),
            // Gear's stats are rolled for the day: the same value, spent its own way (a heavy weapon always pays with a drawback).
            ...(k.stats && k.slot && rollGear(k.slot, k.stats, day * 97 + i, kind === "heavy")),
        };
        if (kind === "potion") base.heal = Math.round(statsAt(LEVEL).maxHp * POTION_HEAL_SHARE);
        if ((EFFECT_KINDS as readonly string[]).includes(kind)) base.use = EFFECT_MOVES[kind as (typeof EFFECT_KINDS)[number]].id;
        if (kind === "teacher") base.teaches = taughtMove!.id;
        if (kind === "elixir") {
            // The status is named after the elixir, so its words are the world's too.
            elixirStatus[ELIXIR.id] = { id: ELIXIR.id, name: base.name, emoji: base.emoji, hpPercentPerTurn: 0, stats: { atk: ELIXIR.atk } };
            base.opener = { statusId: ELIXIR.id, turns: ELIXIR.turns };
        }
        return [base];
    });

    const shrine = SHRINES[hash(day * 17) % SHRINES.length]!;
    // The player's moves get energy costs (basic ones build it); enemies don't keep energy, so theirs are unaffected.
    const moves: Record<string, MoveConfig> = { ...DEFAULT_MOVES, ...source.content.combat.moves, ...combat.moves, ...Object.fromEntries(Object.values(EFFECT_MOVES).map((m) => [m.id, m])) };
    for (const id of new Set([...movePool, ...(taughtMove ? [taughtMove.id] : [])])) if (moves[id]) moves[id] = { ...moves[id]!, energy: energyFor(moves[id]!) };
    // A guard against a wind-up is a parry: it blocks the whole hit. Guarding costs a turn of damage, so it has to
    // be clearly worth it when timed well, or attacking every turn is always best.
    for (const id of movePool) {
        const m = moves[id];
        if (m?.effects.some((e) => e.type === "guard")) moves[id] = { ...m, effects: [...m.effects, { type: "guard", percent: 100, when: { type: "targetCharging" } }] };
    }
    const config: FightConfig = {
        combat: { moves, statuses: { ...DEFAULT_STATUSES, ...source.content.combat.statuses, ...combat.statuses, ...elixirStatus, [MIGHT.id]: MIGHT,
            [REGEN_STATUS]: { id: REGEN_STATUS, name: "Regenerating", emoji: "💚", hpPercentPerTurn: 4 },
            [ENRAGE_STATUS]: { id: ENRAGE_STATUS, name: "Enraged", emoji: "💢", hpPercentPerTurn: 0, stats: { atk: 60 } } } },
    };
    return {
        day,
        world: world.name,
        worldId: world.id,
        config,
        shop: shopItems,
        movePool,
        boss: enemyAt(boss, BOSS),
        shrine,
        map: withTraits(withRelics(withPatterns(buildMap(day, world, [...normals, ...shuffled(rest.slice(0, half).filter((e) => !normals.includes(e)), day, 12)], [...elites, ...rest.slice(half)], boss, shrine, new Set(shopItems.map((it) => it.id)), override.place), config, day), day), day),
        ids: { boss: boss.id, mobs: normals.map((e) => e.id), place: override.place ?? "", kinds: shopItems.map((it) => it.id) },
    };
}

/** The moves a world's Daily can offer: its players' moves, or Classic Fantasy's for a world without its own. */
export function movesFor(worldId: string): MoveConfig[] {
    const world = WORLDS.find((w) => w.id === worldId) ?? WORLDS[0]!;
    const own = Object.values(world.content.combat.moves).filter((m) => m.players);
    return Object.values((own.length > 3 ? world : WORLDS[0]!).content.combat.moves).filter((m) => m.players && m.id !== "attack");
}


// ─── Checking a run ───────────────────────────────────────────────────────────

/**
 * Plays a run on the map from its actions, in order, and scores it, so a
 * submitted run can be checked. The first action the rules refuse ends it there.
 */
export function replayMap(day: number, actions: MapAction[], override?: DailyOverride): { state: MapState; score: number } {
    const daily = dailyFor(day, override);
    let s = startState(daily);
    for (const a of actions) {
        const next = act(daily, s, a);
        if (!next) break;
        s = next;
    }
    return { state: s, score: mapScore(daily, s) };
}
