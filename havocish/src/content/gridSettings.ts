/** Grid's supported rules. Shared with the editor; old activities keep these defaults. */
export const GRID_SETTINGS = {
    swings: { label: "Actions per run", fallback: 12, min: 1, max: 200, hint: "Before skill bonuses and location conditions." },
    ores: { label: "Hidden finds", fallback: 4, min: 0, max: 10, hint: "Out of 20 spaces." },
    hard: { label: "Tough obstacles", fallback: 2, min: 0, max: 10 },
    loose: { label: "Unstable obstacles", fallback: 1, min: 0, max: 6 },
    rockHp: { label: "Normal obstacle durability", fallback: 1, min: 1, max: 20 },
    hardHp: { label: "Tough obstacle durability", fallback: 3, min: 1, max: 20 },
    looseHp: { label: "Unstable obstacle durability", fallback: 1, min: 1, max: 20 },
    oreHp: { label: "Find durability", fallback: 2, min: 1, max: 20 },
    rarityHp: { label: "Extra durability per rarity", fallback: 1, min: 0, max: 5, hint: "0 makes every find equally easy to uncover." },
    light: { label: "Visibility range", fallback: 2, min: 1, max: 9, hint: "Spaces from cleared ground. 9 reveals the whole board; darkness conditions shorten this." },
    power: { label: "Base damage per action", fallback: 1, min: 1, max: 20 },
    cleanChance: { label: "Critical hit chance (%)", fallback: 10, min: 0, max: 100 },
    skillCleanBonus: { label: "Critical chance per skill level", fallback: 1, min: 0, max: 5, hint: "0 disables the skill bonus. The bonus adds at most 30 percentage points." },
    skillSwingsEvery: { label: "Skill levels per extra action", fallback: 8, min: 0, max: 100, hint: "0 disables extra actions from skill." },
    fallCost: { label: "Actions lost when hit by a fall", fallback: 2, min: 0, max: 20 },
    falling: { label: "Falling hazards", fallback: 1, min: 0, max: 1, toggle: true, hint: "Off keeps unstable obstacles in place, for settings without gravity." },
    toolPower: { label: "Tools increase damage", fallback: 1, min: 0, max: 1, toggle: true },
    adjacent: { label: "Work from cleared spaces", fallback: 1, min: 0, max: 1, toggle: true, hint: "Off lets players work on any visible space." },
    rareDepth: { label: "Rarer finds sit further in", fallback: 1, min: 0, max: 1, toggle: true },
} satisfies Record<string, { label: string; fallback: number; min: number; max: number; hint?: string; toggle?: boolean }>;

/** Each setting from `d`, rounded and clamped to its range, or its fallback. */
export function clampSettings<K extends string>(settings: Record<K, { fallback: number; min: number; max: number }>, d: Record<string, number> = {}) {
    return Object.fromEntries(Object.entries<{ fallback: number; min: number; max: number }>(settings).map(([key, rule]) => {
        const n = d[key];
        return [key, typeof n === "number" && Number.isFinite(n) ? Math.max(rule.min, Math.min(rule.max, Math.round(n))) : rule.fallback];
    })) as Record<K, number>;
}

export const gridSettings = (d: Record<string, number> = {}) => clampSettings(GRID_SETTINGS, d);
