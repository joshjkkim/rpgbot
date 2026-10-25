/**
 * Balanced numbers for new content, from a level and a role, so owners pick
 * "a tough enemy for level 12" instead of typing nine stats. The tables are
 * fitted to Classic Fantasy, which is playtested: a Normal enemy at a level
 * is what that pack puts there, and elites, bosses and gear scale the way its
 * own do. Everything stays editable afterwards.
 */

export const ENEMY_ROLES = ["weak", "normal", "tough", "elite", "boss"] as const;
export type EnemyRole = (typeof ENEMY_ROLES)[number];

export const ROLE_LABELS: Record<EnemyRole, string> = {
    weak: "Weak", normal: "Normal", tough: "Tough", elite: "Elite (rare)", boss: "World boss",
};

/** A normal enemy at each anchor level: [level, hp, atk, def, spd, crit %, xp, gold]. In between is interpolated. */
const NORMAL: Array<[number, number, number, number, number, number, number, number]> = [
    // Level 1-3 enemies take a few hits even from a Heavy Strike: a first fight has turns to read.
    [1, 48, 7, 2, 5, 1, 42, 7],
    [3, 65, 14, 4, 10, 4, 50, 14],
    [5, 85, 25, 7, 15, 5, 100, 21],
    [9, 120, 30, 12, 12, 5, 135, 30],
    [13, 215, 44, 17, 16, 6, 150, 58],
    [17, 260, 50, 16, 16, 6, 185, 70],
    [23, 450, 66, 30, 12, 6, 245, 155],
    [28, 470, 75, 28, 18, 8, 275, 175],
    [35, 1000, 90, 52, 19, 8, 340, 410],
    [40, 1050, 110, 50, 25, 12, 390, 500],
];

function normalAt(level: number) {
    const L = Math.max(1, level);
    let i = NORMAL.findIndex((a) => a[0] >= L);
    if (i === -1) i = NORMAL.length - 1; // past the table: carry on along its last stretch
    if (i === 0) i = 1;
    const [a, b] = [NORMAL[i - 1]!, NORMAL[i]!];
    const t = (L - a[0]) / (b[0] - a[0]);
    const at = (k: number) => a[k]! + (b[k]! - a[k]!) * t;
    return { hp: at(1), atk: at(2), def: at(3), spd: at(4), crit: at(5), xp: at(6), gold: at(7) };
}

/** How each role differs from Normal, measured off Classic Fantasy's elites, trolls and golems. */
const ROLE: Record<Exclude<EnemyRole, "boss">, { hp: number; atk: number; def: number; spd: number; xp: number; gold: number }> = {
    weak: { hp: 0.6, atk: 0.75, def: 0.6, spd: 1, xp: 0.6, gold: 0.6 },
    normal: { hp: 1, atk: 1, def: 1, spd: 1, xp: 1, gold: 1 },
    tough: { hp: 1.2, atk: 1, def: 1.25, spd: 0.6, xp: 1.1, gold: 1.1 },
    elite: { hp: 1.9, atk: 1.25, def: 1.3, spd: 1.5, xp: 3.2, gold: 2 },
};

/** Rounds to something a person would have typed: 5s and 10s once numbers get big. */
function nice(n: number): number {
    if (n >= 1000) return Math.round(n / 50) * 50;
    if (n >= 200) return Math.round(n / 10) * 10;
    if (n >= 50) return Math.round(n / 5) * 5;
    return Math.max(1, Math.round(n));
}

export type EnemyNumbers = {
    hp: number; atk: number; def: number; spd: number; critChance: number; critMultiplier: number;
    minLevel: number; maxLevel: number | null; xpReward: number; goldReward: number;
    boss?: true; spawnWeight?: number;
};

/** Every number an enemy needs, for a Combat level and a role. */
export function enemyPreset(level: number, role: EnemyRole): EnemyNumbers {
    const L = Math.max(1, Math.round(level));
    if (role === "boss") {
        // Fought by the whole server at once: HP for a crowd, hits like something well above the level.
        const above = normalAt(L + 20);
        return {
            hp: nice(6000 * (1 + L / 25)), atk: nice(above.atk * 0.9), def: nice(above.def * 0.8), spd: 15,
            critChance: 10, critMultiplier: 2, minLevel: 1, maxLevel: null,
            xpReward: nice(3000 + 60 * L), goldReward: nice(1500 + 30 * L), boss: true,
        };
    }
    const n = normalAt(L);
    const r = ROLE[role];
    return {
        hp: nice(n.hp * r.hp), atk: nice(n.atk * r.atk), def: Math.round(n.def * r.def), spd: Math.max(1, Math.round(n.spd * r.spd)),
        critChance: Math.round(n.crit + (role === "elite" ? 2 : 0)),
        critMultiplier: L < 15 ? 1.5 : L < 25 ? 1.6 : L < 30 ? 1.75 : 2,
        minLevel: L,
        // A level range that widens as levels spread out; the strongest have no ceiling.
        maxLevel: L >= 35 ? null : L + Math.min(15, Math.max(5, Math.round(L * 0.6))),
        xpReward: nice(n.xp * r.xp), goldReward: nice(n.gold * r.gold),
        ...(role === "elite" && { spawnWeight: 0.2 }),
    };
}

// ─── Gear ─────────────────────────────────────────────────────────────────────

export const RARITY_ORDER = ["poor", "common", "uncommon", "rare", "epic", "legendary"] as const;
export type Rarity = (typeof RARITY_ORDER)[number];
const RARITY_STATS: Record<Rarity, number> = { poor: 0.6, common: 0.8, uncommon: 1, rare: 1.25, epic: 1.45, legendary: 1.7 };
const RARITY_PRICE: Record<Rarity, number> = { poor: 0.3, common: 0.5, uncommon: 1, rare: 1.1, epic: 1.6, legendary: 2.5 };

export type GearSlot = "weapon" | "head" | "body" | "legs" | "hands" | "feet" | "shield" | "accessory" | "aura";
type Stat = "atk" | "def" | "hp" | "spd";

/** Each slot's stats for uncommon gear at a level: [base, per level]. Fitted to Classic Fantasy's shop and crafted gear. */
const SLOT: Record<GearSlot, Partial<Record<Stat, [number, number]>>> = {
    weapon: { atk: [4, 0.5] },
    head: { def: [2, 0.25], hp: [10, 1.25] },
    body: { def: [3, 0.45], hp: [15, 1.6] },
    legs: { def: [1.5, 0.3], hp: [8, 1.4] },
    hands: { atk: [0.5, 0.17], def: [1, 0.18] },
    feet: { spd: [3, 0.22], def: [0, 0.15] },
    shield: { def: [4, 0.45], hp: [12, 1.6] },
    accessory: { hp: [0, 1.9] },
    aura: { atk: [0, 0.12], def: [0, 0.12], hp: [0, 1.1] },
};

export type GearNumbers = { stats: Partial<Record<Stat, number>>; price: number; sellPrice: number; minLevel?: number };

/** Stats and price for a piece of gear: a slot, the level it's for, and how rare it is. */
export function gearPreset(slot: GearSlot, level: number, rarity: Rarity): GearNumbers {
    const L = Math.max(0, Math.round(level));
    const stats: Partial<Record<Stat, number>> = {};
    for (const [stat, [base, per]] of Object.entries(SLOT[slot]) as Array<[Stat, [number, number]]>) {
        const v = Math.round((base + per * L) * RARITY_STATS[rarity]);
        if (v > 0) stats[stat] = v;
    }
    // The cubic term makes late gear the coin grind: about 1.4x at Combat 20, 1.8x at 30, 2x at 40.
    const price = nice((120 + 1.8 * L * L + 0.05 * L ** 3) * RARITY_PRICE[rarity] * (slot === "hands" || slot === "feet" ? 0.8 : 1));
    return { stats, price, sellPrice: Math.round(price * 0.35), ...(L > 0 && { minLevel: L }) };
}

/** A healing item for a level: how much it heals, what it costs, and how many a day the shop sells. */
export function potionPreset(level: number) {
    const L = Math.max(1, Math.round(level));
    const heal = nice(40 + 5 * L + 0.45 * L * L);
    const price = nice(heal * 0.8);
    return { heal, price, sellPrice: Math.round(price * 0.25), dailyLimit: L < 10 ? 3 : L < 25 ? 2 : 1 };
}
