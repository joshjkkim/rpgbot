import {
    moveById, newFighterState, pickIntent, playTurn, usable,
    type Fight, type FightConfig, type FightEnemy, type FightStats, type PlayerChoice,
} from "./fight.ts";

/**
 * The website's Daily: one day a day, the same for everyone. A map of the
 * day's world to cross in 24 hours (gathering, the town, the forge, mobs,
 * elites with relics, a shrine and a camp) to beat its boss, as fast as you
 * can. Every roll is seeded from the day, so a run played the same way always
 * ends the same way, and the server can replay a submitted run to check its
 * score.
 *
 * Words come from a world; numbers come from the balance tables, so every
 * world's Daily is equally hard. The worlds themselves, and building a day
 * from them, are in dailyWorlds.ts: this file is what the page runs, without them.
 */

/** Daily #1. */
const FIRST_DAY = Date.UTC(2026, 9, 31);

/** The Daily's number on a date: a new one at midnight UTC. */
export function dayNumber(now = Date.now()): number {
    return Math.max(1, Math.floor((now - FIRST_DAY) / 86_400_000) + 1);
}

/** The UTC date a Daily number falls on, as YYYY-MM-DD. */
export function dateOf(day: number): string {
    return new Date(FIRST_DAY + (day - 1) * 86_400_000).toISOString().slice(0, 10);
}

/** A number from the day, to seed its picks and fights. */
export function hash(n: number): number {
    let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    h ^= h >>> 13;
    return Math.abs(Math.imul(h, 0xc2b2ae35) ^ (h >>> 16));
}

/** `list` in the day's own order, from `salt`. */
export function shuffled<T>(list: T[], day: number, salt: number): T[] {
    return list.map((x, i) => ({ x, k: hash(day * 1009 + salt * 31 + i) })).sort((a, b) => a.k - b.k).map((e) => e.x);
}

// ─── Tuning ───────────────────────────────────────────────────────────────────

/** The player's Combat level, for their stats and the gear's. */
export const LEVEL = 30;
/** Moves offered each day, and how many a player takes in. */
export const POOL_SIZE = 7;
export const LOADOUT_SIZE = 4;
// Simulated over 60 days with a blind dig: the best buys and moves beat the boss on about 88% of days,
// skipping the shop on about a third, a careless plan rarely. Beatable; how well is the score.

/** Gold before gathering, so even a bad dig buys something. */
export const START_GOLD = 30;
/** The gathering minigames, one a day in turn. Each is decided by choices, never reflexes, so it can be replayed. */
export const GATHER_GAMES = ["grid", "pulls", "tunnel"] as const;
export type GatherGame = (typeof GATHER_GAMES)[number];
/** Grid: a 4x4 field read from clues (gridCounts, hintsAt). */
export const GRID = { size: 16, finds: 8, hazards: 2, tries: 7 };
/**
 * Tunnel, "the descent": a shaft seen from the side, `rows` levels deep and `cols` spots across. You dig one
 * spot a level, going down, straight or one step aside. Below the top, each level has one cave-in; finds are
 * worth more the deeper they are (`depth`, per level). You can read only the spot right under you (shaftHint).
 */
export const TUNNEL = { rows: 6, cols: 3, size: 18, tries: 6, ore: 55, depth: 0.3 };
/**
 * Pulls: fishing, played on timing. A marker sweeps a bar and you reel when it's in the zone; each catch is
 * worth more than the last, and each zone is narrower (`zone`, a share of the bar) and swept faster (`speed`,
 * sweeps a second). Miss and the line snaps (SNAP in what was opened). Catches are worth less than tiles
 * (`worth`), since every pull that lands finds something.
 */
export const PULLS = {
    zone: [0.34, 0.28, 0.23, 0.19, 0.15, 0.12, 0.1, 0.08],
    speed: [0.7, 0.8, 0.95, 1.1, 1.25, 1.4, 1.6, 1.8],
    growth: 0.3, worth: 0.45,
};
/** A missed reel, in a pulls game's opened list: the line snapped there. */
export const SNAP = -1;
/** The bot's default stats for a player at a Combat level (player/combat.ts calculateStats). */
export function statsAt(level: number): FightStats {
    return {
        maxHp: 100 + level * 10, atk: 10 + level * 2, def: 5 + level, spd: 5 + level,
        // Crits are kept small in the Daily (the bot's formula gives ×3 at level 30): fights should turn on plans, not lucky rolls.
        critChance: 5 + level * 0.5, critMultiplier: 1.75,
    };
}

// ─── The day ──────────────────────────────────────────────────────────────────

export type DailyEnemy = FightEnemy & { hp: number; traits?: string[] };
export type Find = { name: string; emoji: string; rarity: string; value: number };
export type Stats = Partial<Record<"atk" | "def" | "hp" | "spd" | "crit", number>>;

/** The kinds of thing the shop sells. Each day offers five, so the best buy changes with the day. */
export const ITEM_KINDS = ["weapon", "heavy", "armour", "boots", "charm", "teacher", "potion", "elixir", "featured", "bomb", "tonic", "draught", "antidote"] as const;
/** The shop's effect items: used in a fight from the bag, each plays a move of its own. */
export const EFFECT_KINDS = ["bomb", "tonic", "draught", "antidote"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** A shop entry; its id is its kind, since a day sells each kind once. */
export type ShopItem = {
    id: ItemKind; name: string; emoji: string; rarity: string; price: number; stock: number;
    stats?: Stats;
    /** Potion: HP back, drunk in a fight. */
    heal?: number;
    /** A move it adds, on top of the four picked. */
    teaches?: string;
    /** A status every fight starts with. */
    opener?: { statusId: string; turns: number };
    /** An effect item: the move it plays when used in a fight (it takes the turn). */
    use?: string;
    /** Gear's slot: one weapon, one armour, one trinket at a time. */
    slot?: Slot;
};

export type Slot = "weapon" | "armour" | "trinket";

// ─── Relics and boss traits ──────────────────────────────────────────────────
// An elite, beaten, offers three relics to pick one from: each bends a build, some
// with a price. A boss has a trait or two, shown from the start, that decide
// which builds beat it. Together they make each day's best plan its own.

export type Relic = {
    id: string; name: string; emoji: string; text: string;
    /** Changes to your stats, in % (crit in points). */
    stats?: { atk?: number; hp?: number; crit?: number };
    /** What it does in every fight. */
    fight?: { energy?: number; lifesteal?: number; mark?: number; thorns?: number };
    /** Heals this % of max HP after every fight you win. */
    afterWin?: number;
};

export const RELICS: Relic[] = [
    { id: "vampire-fang", name: "Vampire Fang", emoji: "🦷", text: "Heal 8% of the damage you deal.", fight: { lifesteal: 8 } },
    { id: "glass-edge", name: "Glass Edge", emoji: "🔪", text: "+50% ATK, but −30% max HP.", stats: { atk: 50, hp: -30 } },
    { id: "ember-heart", name: "Ember Heart", emoji: "❤️‍🔥", text: "Start every fight with 3 energy.", fight: { energy: 3 } },
    { id: "hunters-mark", name: "Hunter's Mark", emoji: "🎯", text: "+60% damage to an enemy that's suffering a harmful effect (bleeding, poisoned…).", fight: { mark: 60 } },
    { id: "iron-skin", name: "Iron Skin", emoji: "🪨", text: "+40% max HP, but −10% ATK.", stats: { hp: 40, atk: -10 } },
    { id: "lucky-coin", name: "Lucky Coin", emoji: "🍀", text: "+25% crit chance.", stats: { crit: 25 } },
    { id: "troll-blood", name: "Troll Blood", emoji: "🩸", text: "Heal 25% of your max HP after every fight you win.", afterWin: 25 },
    { id: "thorn-mail", name: "Thorn Mail", emoji: "🌵", text: "Send 25% of the damage you take back at the attacker.", fight: { thorns: 25 } },
];

export type Trait = { id: string; name: string; emoji: string; text: string };

export const TRAITS: Trait[] = [
    { id: "thick-hide", name: "Thick Hide", emoji: "🪨", text: "Takes 25 less damage from every hit: small hits barely scratch it." },
    { id: "regenerates", name: "Regenerates", emoji: "💚", text: "Heals 4% of its HP every turn: you need to hit hard or keep it bleeding." },
    { id: "thorns", name: "Thorns", emoji: "🌵", text: "Sends 15% of the damage it takes back at you." },
    { id: "enrage", name: "Enrage", emoji: "💢", text: "At half HP its ATK rises by 60% for the rest of the fight." },
    { id: "swift", name: "Swift", emoji: "⚡", text: "Always acts first." },
];

/** A pick that uses an effect item from the bag: "use:" and the item's id. */
export const USE = "use:";

/**
 * What an admin changed about one day (the daily_overrides table): any of
 * these replace what the day would have picked. Ids are the world's own.
 */
export type DailyOverride = {
    world?: string;
    boss?: string;
    mobs?: string[];
    /** "activityId/locationId". */
    place?: string;
    kinds?: ItemKind[];
    moves?: string[];
};

/** One gathering option. For pulls, tiles are the catches in order and "hazard" the pull the line snaps on. */
export type GatherSpec = { game: GatherGame; name: string; emoji: string; place: string; tiles: Array<Find | "hazard" | null> };

/** A shrine's blessing: stat changes in % (and flat max HP), for what's left of the run, at a cost in HP. */
export type Shrine = { name: string; emoji: string; atk?: number; def?: number; spd?: number; crit?: number; maxHp?: number; hpCost?: number };

export interface Daily {
    day: number;
    world: string;
    worldId: string;
    config: FightConfig;
    shop: ShopItem[];
    /** Today's moves to choose from, Attack always among them. */
    movePool: string[];
    boss: DailyEnemy;
    shrine: Shrine;
    /** The day's world as a map to walk (see "The map" below). */
    map: DayMap;
    /** The ids behind the day's picks, for the admin page. */
    ids: { boss: string; mobs: string[]; place: string; kinds: ItemKind[] };
}

// ─── Gather ───────────────────────────────────────────────────────────────────

export type GatherState = { opened: number[]; gold: number; triesLeft: number; end: null | "hazard" | "out" | "left" };

/** The descent: the next level down, straight below the last dig or one step aside. */
export function canDig(opened: number[], i: number): boolean {
    const w = TUNNEL.cols;
    if (Math.floor(i / w) !== opened.length) return false;
    const last = opened.at(-1);
    return last == null || Math.abs((i % w) - (last % w)) <= 1;
}

/** What the descent shows of the spot right under the last dig: cracks if it's a cave-in, a glint if it holds a find. */
export function shaftHint(spec: GatherSpec, opened: number[]): { cracks: boolean; glint: boolean } | null {
    const last = opened.at(-1);
    if (last == null) return null;
    const below = spec.tiles[last + TUNNEL.cols];
    return below === undefined ? null : { cracks: below === "hazard", glint: !!below && below !== "hazard" };
}

export function triesFor(game: GatherGame): number {
    return game === "grid" ? GRID.tries : game === "tunnel" ? TUNNEL.tries : PULLS.zone.length;
}

/**
 * The day's gathering after opening `opened` in order (tiles, or for pulls
 * 0, 1, 2…): each costs a try, a find adds its gold, a hazard halves what was
 * found and ends it. Returns null for a move the game doesn't allow (a tile
 * twice, out of turn, out of reach, after the end).
 */
export function gather(spec: GatherSpec, opened: number[], left = false): GatherState | null {
    const { game, tiles } = spec;
    const s: GatherState = { opened: [], gold: 0, triesLeft: triesFor(game), end: null };
    for (const i of opened) {
        if (game === "pulls" && i === SNAP && !s.end) {
            s.opened.push(i);
            s.gold = Math.ceil(s.gold / 2);
            s.end = "hazard";
            continue;
        }
        if (s.end || !Number.isInteger(i) || i < 0 || i >= tiles.length || s.opened.includes(i)) return null;
        if (game === "pulls" ? i !== s.opened.length : game === "tunnel" && !canDig(s.opened, i)) return null;
        s.opened.push(i);
        s.triesLeft -= 1;
        const tile = tiles[i];
        if (tile === "hazard") {
            s.gold = Math.ceil(s.gold / 2);
            s.end = "hazard";
        } else if (tile) {
            s.gold += tile.value;
        }
        if (!s.end && s.triesLeft <= 0) s.end = "out";
    }
    if (left && !s.end) s.end = "left";
    return s;
}

/**
 * What an opened grid tile tells you, so digging is read rather than guessed: how many hazards touch it
 * (all eight around it), and whether a find still hidden lies next to it (a glint).
 */
export function hintsAt(spec: GatherSpec, opened: number[], i: number): { danger: number; glint: boolean } {
    const w = 4;
    const x = i % w, y = Math.floor(i / w);
    const around = spec.tiles.flatMap((t, j) => {
        const dx = Math.abs((j % w) - x), dy = Math.abs(Math.floor(j / w) - y);
        return j !== i && dx <= 1 && dy <= 1 ? [{ t, j }] : [];
    });
    return {
        danger: around.filter(({ t }) => t === "hazard").length,
        glint: around.some(({ t, j }) => !!t && t !== "hazard" && !opened.includes(j)),
    };
}

/** The grid's clues before any digging: how many hazards each row and each column holds. */
export function gridCounts(spec: GatherSpec): { rows: number[]; cols: number[] } {
    const rows = [0, 0, 0, 0], cols = [0, 0, 0, 0];
    spec.tiles.forEach((t, i) => { if (t === "hazard") { rows[Math.floor(i / 4)]! += 1; cols[i % 4]! += 1; } });
    return { rows, cols };
}

/** Pull `k`'s zone on the reel bar (its middle, as a share of the bar), how wide it is and how fast the marker sweeps. The same for everyone today. */
export function reelZone(spec: GatherSpec, k: number): { centre: number; width: number; speed: number } {
    const width = PULLS.zone[k] ?? PULLS.zone.at(-1)!;
    const seed = spec.tiles.reduce((sum, t, j) => sum + (t && t !== "hazard" ? t.value * (j + 1) : 0), 0);
    const r = Math.sin((k + 1) * 12.9898 + seed * 78.233) * 43758.5453;
    const centre = width / 2 + 0.05 + (r - Math.floor(r)) * (0.9 - width);
    return { centre, width, speed: PULLS.speed[k] ?? PULLS.speed.at(-1)! };
}

// ─── Prepare ──────────────────────────────────────────────────────────────────

export type Prepared = {
    stats: FightStats; potions: number; heal: number; spent: number;
    /** Relics carried (the map's runs): what they do in a fight is set up by startFight. */
    relics?: string[];
    /** Moves from gear, usable alongside the loadout. */
    taught: string[];
    opener: { statusId: string; turns: number } | null;
};

/**
 * What a player goes in with after buying `buys` (item ids; the potion as
 * often as bought) from `gold`. Null when it costs more than they have, or
 * buys past an item's stock.
 */
export function prepare(daily: Daily, gold: number, buys: string[]): Prepared | null {
    const base = statsAt(LEVEL);
    const stats = { ...base };
    let spent = 0;
    let potions = 0;
    const taught: string[] = [];
    let opener: Prepared["opener"] = null;
    for (const item of daily.shop) {
        const n = buys.filter((id) => id === item.id).length;
        if (n > item.stock) return null;
        spent += n * item.price;
        if (!n) continue;
        if (item.heal) potions += n;
        if (item.teaches) taught.push(item.teaches);
        if (item.opener) opener = item.opener;
        stats.atk += item.stats?.atk ?? 0;
        stats.def += item.stats?.def ?? 0;
        stats.spd = Math.max(1, stats.spd + (item.stats?.spd ?? 0));
        stats.maxHp += item.stats?.hp ?? 0;
        stats.critChance += item.stats?.crit ?? 0;
    }
    if (buys.some((id) => !daily.shop.some((it) => it.id === id)) || spent > gold) return null;
    return { stats, potions, heal: daily.shop.find((it) => it.heal)?.heal ?? 0, spent, taught, opener };
}

/** Every move the player can use in a fight: their four, and any their gear teaches. */
export function fightMoves(loadout: string[], kit: Prepared): string[] {
    return [...new Set([...loadout, ...kit.taught])];
}

/** Whether a loadout is one the day allows: up to four of its moves, none twice. */
export function validLoadout(daily: Daily, loadout: string[]): boolean {
    return loadout.length > 0 && loadout.length <= LOADOUT_SIZE && new Set(loadout).size === loadout.length &&
        loadout.every((id) => daily.movePool.includes(id));
}

// ─── Fights ───────────────────────────────────────────────────────────────────

/** The pick that drinks a potion instead of using a move. */
export const DRINK = "potion";
/** The pick that does nothing: for a turn lost to a stun or a wind-up, or when every move is cooling down. */
export const WAIT = "wait";

// ─── The route ────────────────────────────────────────────────────────────────

/** Gold a fight drops, by what it was. */
export const LOOT = { normal: 40, elite: 60 };
/** A kit after the shrine: its stats changed for the rest of the run. */
export function bless(kit: Prepared, shrine: Shrine): Prepared {
    const s = kit.stats;
    const pct = (v: number, p = 0) => Math.round(v * (1 + p / 100));
    return {
        ...kit,
        stats: {
            ...s, atk: pct(s.atk, shrine.atk), def: pct(s.def, shrine.def), spd: Math.max(1, pct(s.spd, shrine.spd)),
            critChance: s.critChance + (shrine.crit ?? 0), maxHp: s.maxHp + (shrine.maxHp ?? 0),
        },
    };
}

/** HP after the shrine's blessing: it costs what it costs and adds what it adds. */
export function blessedHp(daily: Daily, hp: number): number {
    return Math.max(1, hp - Math.round(hp * (daily.shrine.hpCost ?? 0) / 100) + (daily.shrine.maxHp ?? 0));
}

/** A fight against `enemy` with the HP the player has left; `slot` seeds its dice (the map uses 100 + the tile). */
export function startFight(daily: Daily, slot: number, enemy: DailyEnemy, kit: Prepared, hp: number): Fight {
    const state = newFighterState();
    // The Daily's fights use energy: you start each with none and build it with basic moves.
    state.energy = 0;
    for (const r of RELICS.filter((x) => kit.relics?.includes(x.id))) {
        state.energy += r.fight?.energy ?? 0;
        if (r.fight?.lifesteal) state.lifesteal = (state.lifesteal ?? 0) + r.fight.lifesteal;
        if (r.fight?.mark) state.mark = (state.mark ?? 0) + r.fight.mark;
        if (r.fight?.thorns) state.thorns = (state.thorns ?? 0) + r.fight.thorns;
    }
    if (kit.opener) state.statuses[kit.opener.statusId] = kit.opener.turns;
    const fight: Fight = {
        members: [{ userId: "you", name: "You", stats: kit.stats, hp, state, dealt: 0, taken: 0 }],
        enemy, enemyMaxHp: enemy.hp, enemyCurrentHp: enemy.hp, foe: newFighterState(),
        enemyIntent: "attack", enemyTarget: "you", round: 0,
        seed: hash(daily.day * 7 + slot * 2),
    };
    if (enemy.traits?.includes("regenerates")) fight.foe.statuses[REGEN_STATUS] = 999;
    fight.enemyIntent = pickIntent(fight, daily.config);
    return fight;
}

/** The statuses the boss traits use; the day's config has them. */
export const REGEN_STATUS = "daily-regen";
export const ENRAGE_STATUS = "daily-enrage";

/** A pick as the engine takes it: a move, or a drink of the day's potion. */
export function choiceFor(daily: Daily, pick: string): PlayerChoice {
    if (pick === WAIT) return { kind: "pass" };
    if (pick.startsWith(USE)) return { kind: "move", moveId: daily.shop.find((it) => it.id === pick.slice(USE.length))?.use ?? "attack" };
    if (pick !== DRINK) return { kind: "move", moveId: pick };
    const p = daily.shop.find((it) => it.heal)!;
    return { kind: "potion", heal: p.heal!, name: p.name, emoji: p.emoji };
}

// ─── The map ──────────────────────────────────────────────────────────────────
// The day as a small world: a grid of places, a start in the middle, the quest
// somewhere far off, and 24 hours to finish it. Every action takes an hour,
// except walking (half an hour a tile), looking, and shopping in town. The whole map is shown from the start:
// the puzzle is the fastest plan that's still strong enough to win.

export const SIDE = 5;
export const HOURS = 24;
export const START_NODE = Math.floor((SIDE * SIDE) / 2);
/** Walking a tile takes half an hour; everything you do there takes an hour. Getting around is cheap, doing things isn't. */
export const WALK_HOURS = 0.5;
/** The camp heals this share of max HP per hour of rest. */
export const REST_HEAL = 0.3;
/** XP for beating each kind of enemy, and the XP each level needs (level 1 at 0). */
export const XP = { enemy: 1, elite: 3 };
export const LEVELS = [0, 1, 3, 5, 8, 12];
/** What each level above the first adds to ATK and max HP, as a share of what you had. */
export const LEVEL_BONUS = 0.25;

/** Your level for the XP you have. */
export function levelOf(xp: number): number {
    return LEVELS.filter((need) => xp >= need).length;
}

export type NodeKind = "start" | "town" | "forge" | "shrine" | "camp" | "gather" | "enemy" | "elite" | "lair" | "wild" | "blocked";

export type MapNode = {
    id: number;
    kind: NodeKind;
    name: string;
    emoji: string;
    gather?: GatherSpec;
    enemy?: DailyEnemy;
    /** What an elite drops when beaten: a trophy one of the forge's recipes needs. */
    trophy?: { name: string; emoji: string };
    /** The relics an elite offers when beaten, to pick one. */
    relics?: string[];
};

/** A forge recipe: materials in, a piece of gear out. */
export type Recipe = { id: string; needs: Array<{ name: string; emoji: string; count: number }>; gives: ShopItem };

export type DayMap = { nodes: MapNode[]; recipes: Recipe[] };

/** The neighbours of a tile on the grid, blocked ones left out. */
export function neighbours(map: DayMap, id: number): number[] {
    const x = id % SIDE, y = Math.floor(id / SIDE);
    return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
        .filter(([a, b]) => a! >= 0 && b! >= 0 && a! < SIDE && b! < SIDE)
        .map(([a, b]) => b! * SIDE + a!)
        .filter((n) => map.nodes[n]!.kind !== "blocked");
}

/** Hours to walk from one tile to another by the shortest road; Infinity when there's no way. */
export function distance(map: DayMap, from: number, to: number): number {
    const seen = new Map<number, number>([[from, 0]]);
    const queue = [from];
    while (queue.length) {
        const at = queue.shift()!;
        if (at === to) return seen.get(at)!;
        for (const n of neighbours(map, at)) if (!seen.has(n)) { seen.set(n, seen.get(at)! + 1); queue.push(n); }
    }
    return Infinity;
}

export type MapState = {
    hour: number;
    at: number;
    hp: number;
    gold: number;
    /** Materials carried, by name. */
    mats: Record<string, number>;
    buys: string[];
    crafted: string[];
    blessed: boolean;
    /** From beating enemies; sets your level. */
    xp: number;
    loadout: string[];
    potionsUsed: number;
    /** Effect items used up, by item id. */
    itemsUsed: Record<string, number>;
    relics: string[];
    /** Forged gear taken off for something else: it stays forged, but no longer counts. */
    unequipped: string[];
    /** An elite just beaten, whose relics wait to be picked from: nothing else happens until one is. */
    pendingRelic: number | null;
    /** Places used up: gathered, beaten. */
    done: number[];
    over: null | "won" | "lost" | "timeout";
};

export type MapAction =
    | { type: "move"; to: number }
    | { type: "gather"; opened: number[] }
    | { type: "sell"; name: string; count: number }
    | { type: "buy"; id: string }
    | { type: "unbuy"; id: string }
    | { type: "loadout"; moves: string[] }
    | { type: "craft"; recipe: string }
    | { type: "pray" }
    | { type: "rest" }
    | { type: "fight"; picks: string[] }
    | { type: "relic"; id: string };

export function startState(daily: Daily): MapState {
    return {
        hour: 0, at: START_NODE, hp: statsAt(LEVEL).maxHp, gold: START_GOLD, mats: {}, buys: [], crafted: [],
        blessed: false, xp: 0, loadout: [], potionsUsed: 0, itemsUsed: {}, relics: [], unequipped: [], pendingRelic: null, done: [], over: null,
    };
}

/** What the player fights with now: shop gear, crafted gear, their level, the shrine's blessing. */
export function kitOf(daily: Daily, s: MapState): Prepared {
    let kit = prepare(daily, Infinity, s.buys)!;
    for (const id of s.crafted.filter((c) => !s.unequipped.includes(c))) {
        const g = daily.map.recipes.find((r) => r.id === id)?.gives.stats ?? {};
        kit = { ...kit, stats: { ...kit.stats, atk: kit.stats.atk + (g.atk ?? 0), def: kit.stats.def + (g.def ?? 0), maxHp: kit.stats.maxHp + (g.hp ?? 0), spd: Math.max(1, kit.stats.spd + (g.spd ?? 0)), critChance: kit.stats.critChance + (g.crit ?? 0) } };
    }
    const lv = 1 + LEVEL_BONUS * (levelOf(s.xp) - 1);
    // Levels raise ATK and HP, not DEF: defence stacked from gear, shrine and levels made you near untouchable.
    kit = { ...kit, stats: { ...kit.stats, atk: Math.round(kit.stats.atk * lv), maxHp: Math.round(kit.stats.maxHp * lv) } };
    // Relics: their stat changes, and the relics themselves for startFight.
    for (const r of RELICS.filter((x) => s.relics.includes(x.id))) {
        const st = kit.stats;
        kit = { ...kit, stats: { ...st, atk: Math.round(st.atk * (1 + (r.stats?.atk ?? 0) / 100)), maxHp: Math.round(st.maxHp * (1 + (r.stats?.hp ?? 0) / 100)), critChance: st.critChance + (r.stats?.crit ?? 0) } };
    }
    kit = { ...kit, relics: s.relics };
    return s.blessed ? bless(kit, daily.shrine) : kit;
}

/** What fills a slot: gear bought for it, or forged for it (and not taken off). */
export function occupant(daily: Daily, s: MapState, slot: Slot): { bought: string } | { forged: string } | null {
    const bought = s.buys.find((id) => daily.shop.find((it) => it.id === id)?.slot === slot);
    if (bought) return { bought };
    const forged = s.crafted.find((id) => !s.unequipped.includes(id) && daily.map.recipes.find((r) => r.id === id)?.gives.slot === slot);
    return forged ? { forged } : null;
}

export function slotTaken(daily: Daily, s: MapState, slot: Slot): boolean {
    return occupant(daily, s, slot) != null;
}

/** A state with a slot emptied for new gear: what was there is discarded, never refunded. */
function emptied(daily: Daily, s: MapState, slot: Slot): MapState {
    const was = occupant(daily, s, slot);
    if (!was) return s;
    if ("bought" in was) return { ...s, buys: s.buys.filter((id) => id !== was.bought) };
    return { ...s, unequipped: [...s.unequipped, was.forged] };
}

/** The value of a material, from any gathering spot's finds. */
function matValue(daily: Daily, name: string): number {
    for (const n of daily.map.nodes) for (const t of n.gather?.tiles ?? []) if (t && t !== "hazard" && t.name === name) return t.value;
    return 0;
}

/** Plays a fight from its picks; the outcome, the HP left, and potions drunk. Null if a pick wasn't allowed or it never ended. */
export function playFight(daily: Daily, node: MapNode, kit: Prepared, hp: number, loadout: string[], potions: number, picks: string[], items: Record<string, number> = {}): { won: boolean; hp: number; drank: number; used: Record<string, number> } | null {
    const fight = startFight(daily, 100 + node.id, node.enemy!, kit, hp);
    const moves = fightMoves(loadout, kit);
    let drank = 0;
    const used: Record<string, number> = {};
    for (const pick of picks) {
        const me = fight.members[0]!;
        const item = pick.startsWith(USE) ? pick.slice(USE.length) : null;
        const allowed = pick === WAIT || (pick === DRINK ? potions - drank > 0 : item ? (items[item] ?? 0) - (used[item] ?? 0) > 0 : moves.includes(pick) && usable(me.state, moveById(daily.config, pick)));
        if (!allowed) return null;
        if (pick === DRINK) drank += 1;
        if (item) used[item] = (used[item] ?? 0) + 1;
        const outcome = playTurn(fight, { you: choiceFor(daily, pick) }, daily.config).outcome;
        fight.round += 1;
        if (outcome !== "continue") return { won: outcome === "win", hp: fight.members[0]!.hp, drank, used };
    }
    return null;
}

/** Effect items in the bag: bought, less used. */
export function itemsLeft(daily: Daily, s: MapState): Record<string, number> {
    const left: Record<string, number> = {};
    for (const it of daily.shop) if (it.use) left[it.id] = s.buys.filter((id) => id === it.id).length - (s.itemsUsed[it.id] ?? 0);
    return left;
}

/**
 * One action on the map. Returns the state after it, or null when the game
 * wouldn't have allowed it (a road that isn't there, a place used up, no time
 * left, not enough gold or materials). The page plays by this and the server
 * replays a run through it, so they always agree.
 */
export function act(daily: Daily, s: MapState, a: MapAction): MapState | null {
    if (s.over) return null;
    if (s.pendingRelic != null && a.type !== "relic") return null;
    const node = daily.map.nodes[s.at]!;
    const used = s.done.includes(s.at);
    const hourly = (next: Partial<MapState>, hours = 1): MapState | null => {
        if (s.hour >= HOURS) return null;
        const after = { ...s, ...next, hour: s.hour + hours };
        if (!after.over && after.hour >= HOURS) after.over = "timeout";
        return after;
    };
    switch (a.type) {
        case "move":
            return neighbours(daily.map, s.at).includes(a.to) ? hourly({ at: a.to }, WALK_HOURS) : null;
        case "gather": {
            if (node.kind !== "gather" || used) return null;
            const dug = gather(node.gather!, a.opened, true);
            if (!dug) return null;
            let finds = dug.opened.map((i) => node.gather!.tiles[i]).filter((t): t is Find => !!t && t !== "hazard");
            if (dug.end === "hazard") finds = finds.slice(0, Math.ceil(finds.length / 2));
            const mats = { ...s.mats };
            for (const f of finds) mats[f.name] = (mats[f.name] ?? 0) + 1;
            return hourly({ mats, done: [...s.done, s.at] });
        }
        case "sell": {
            if (node.kind !== "town" || !Number.isInteger(a.count) || a.count < 1 || (s.mats[a.name] ?? 0) < a.count) return null;
            return { ...s, mats: { ...s.mats, [a.name]: s.mats[a.name]! - a.count }, gold: s.gold + a.count * matValue(daily, a.name) };
        }
        case "buy": {
            const item = daily.shop.find((it) => it.id === a.id);
            if (node.kind !== "town" || !item || s.gold < item.price || !prepare(daily, Infinity, [...s.buys, a.id])) return null;
            // Gear for a filled slot swaps in: the old piece is discarded, not refunded.
            const room = item.slot ? emptied(daily, s, item.slot) : s;
            const next = { ...room, gold: s.gold - item.price, buys: [...room.buys, a.id] };
            return { ...next, hp: Math.min(next.hp, kitOf(daily, next).stats.maxHp) };
        }
        case "unbuy": {
            const item = daily.shop.find((it) => it.id === a.id);
            const i = s.buys.lastIndexOf(a.id);
            // Only potions and effect items go back; gear, once bought, is yours.
            if (node.kind !== "town" || !item || i < 0 || item.slot) return null;
            // A potion already drunk can't go back.
            if (item.heal && s.buys.filter((id) => id === a.id).length <= s.potionsUsed) return null;
            if (item.use && s.buys.filter((id) => id === a.id).length <= (s.itemsUsed[a.id] ?? 0)) return null;
            return { ...s, gold: s.gold + item.price, buys: s.buys.filter((_, k) => k !== i) };
        }
        case "loadout":
            // Your first four can be picked anywhere; changing them needs town (or the start).
            return (node.kind === "town" || node.kind === "start" || s.loadout.length === 0) && validLoadout(daily, a.moves) && a.moves.length === LOADOUT_SIZE ? { ...s, loadout: a.moves } : null;
        case "craft": {
            const r = daily.map.recipes.find((x) => x.id === a.recipe);
            if (node.kind !== "forge" || !r || s.crafted.includes(r.id) || r.needs.some((n) => (s.mats[n.name] ?? 0) < n.count)) return null;
            const room = r.gives.slot ? emptied(daily, s, r.gives.slot) : s;
            const mats = { ...s.mats };
            for (const n of r.needs) mats[n.name] = mats[n.name]! - n.count;
            const before = kitOf(daily, s).stats.maxHp;
            const crafted = [...s.crafted, r.id];
            const next = { ...room, mats, crafted };
            return hourly({ mats, crafted, buys: room.buys, unequipped: room.unequipped, hp: Math.max(1, s.hp + kitOf(daily, next).stats.maxHp - before) });
        }
        case "pray": {
            if (node.kind !== "shrine" || s.blessed) return null;
            return hourly({ blessed: true, hp: blessedHp(daily, s.hp) });
        }
        case "rest": {
            if (node.kind !== "camp") return null;
            const max = kitOf(daily, s).stats.maxHp;
            return hourly({ hp: Math.min(max, s.hp + Math.round(max * REST_HEAL)) });
        }
        case "fight": {
            if (!(node.kind === "enemy" || node.kind === "elite" || node.kind === "lair") || used || s.loadout.length !== LOADOUT_SIZE) return null;
            const kit = kitOf(daily, s);
            const r = playFight(daily, node, kit, s.hp, s.loadout, kit.potions - s.potionsUsed, a.picks, itemsLeft(daily, s));
            if (!r) return null;
            const itemsUsed = { ...s.itemsUsed };
            for (const [id, n] of Object.entries(r.used)) itemsUsed[id] = (itemsUsed[id] ?? 0) + n;
            const loot = node.kind === "elite" ? LOOT.elite : node.kind === "enemy" ? LOOT.normal : 0;
            if (!r.won) return hourly({ hp: r.hp, potionsUsed: s.potionsUsed + r.drank, itemsUsed, over: "lost" });
            // A win: loot, XP (a level up raises max HP, and HP with it), and an elite's trophy.
            const xp = s.xp + (node.kind === "elite" ? XP.elite : node.kind === "enemy" ? XP.enemy : 0);
            const grown = kitOf(daily, { ...s, xp }).stats.maxHp - kit.stats.maxHp;
            const mats = node.trophy ? { ...s.mats, [node.trophy.name]: (s.mats[node.trophy.name] ?? 0) + 1 } : s.mats;
            const after = Math.min(kit.stats.maxHp + grown, r.hp + grown + Math.round((kit.stats.maxHp + grown) * RELICS.filter((x) => s.relics.includes(x.id)).reduce((sum, x) => sum + (x.afterWin ?? 0), 0) / 100));
            return hourly({
                hp: after, xp, mats, potionsUsed: s.potionsUsed + r.drank, itemsUsed, done: [...s.done, s.at],
                gold: s.gold + loot, over: node.kind === "lair" ? "won" : null,
                pendingRelic: node.kind === "elite" && node.relics?.length ? node.id : null,
            });
        }
        case "relic": {
            const offered = daily.map.nodes[s.pendingRelic ?? -1]?.relics ?? [];
            if (!offered.includes(a.id)) return null;
            const before = kitOf(daily, s).stats.maxHp;
            const relics = [...s.relics, a.id];
            const max = kitOf(daily, { ...s, relics }).stats.maxHp;
            return { ...s, relics, pendingRelic: null, hp: Math.max(1, Math.min(max, s.hp + max - before)) };
        }
    }
}

/**
 * The score: beating the quest sooner is better, HP left breaks ties
 * (hours to spare x 1000, plus HP). A run that didn't finish scores below
 * every one that did, closer to zero the more of the boss it took down.
 */
export function mapScore(daily: Daily, s: MapState, bossHpLeft = daily.boss.hp): number {
    return s.over === "won" ? (HOURS - s.hour) * 1000 + s.hp : -bossHpLeft;
}
