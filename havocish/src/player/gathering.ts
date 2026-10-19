import type { GuildConfig } from "../types/guild.js";
import type { GatheringActivity, GatheringLocation, GatheringLoot } from "../types/gathering.js";
import type { item } from "../types/userprofile.js";
import type { shopItemConfig } from "../types/economy.js";
import type { PendingProfileChanges } from "../types/cache.js";
import { calculateLevelFromXp, calculateTotalXpForLevel } from "../leveling/levels.js";
import { getOrCreateProfile, commitProfileChanges } from "../cache/profileService.js";

/**
 * The parts every gathering game shares: skill levels, which locations a player
 * can reach, the loot roll, cooldowns, and paying out a finished run. The games
 * themselves (commands/user/gather.ts) only decide how many finds a run makes.
 */

// The chat level code already handles every curve type; it only reads `levels`.
const asLevels = (config: GuildConfig) => {
    const { maxLevel, curveType, curveParams } = config.gathering.skill;
    return { levels: { maxLevel, curveType, curveParams, xpOverrides: {} } } as unknown as GuildConfig;
};

/** A gathering skill level from its XP, on the server's gathering curve. */
export function skillLevel(xp: number, config: GuildConfig): number {
    return calculateLevelFromXp(xp, asLevels(config));
}

/** Level, and XP into it out of what it takes, for progress bars. `span` is 0 at the cap. */
export function skillProgress(xp: number, config: GuildConfig) {
    const level = skillLevel(xp, config);
    if (level >= config.gathering.skill.maxLevel) return { level, into: 0, span: 0 };
    const from = calculateTotalXpForLevel(level, asLevels(config));
    const to = calculateTotalXpForLevel(level + 1, asLevels(config));
    return { level, into: Math.max(0, xp - from), span: Math.max(1, to - from) };
}

export function enabledActivities(config: GuildConfig): GatheringActivity[] {
    if (!config.gathering.enabled) return [];
    return Object.values(config.gathering.activities).filter((a) => a.enabled !== false);
}

/** Locations open at this skill, easiest first. */
export function unlockedLocations(activity: GatheringActivity, skill: number): GatheringLocation[] {
    return Object.values(activity.locations)
        .filter((l) => (l.minSkill ?? 1) <= skill)
        .sort((a, b) => (a.minSkill ?? 1) - (b.minSkill ?? 1));
}

export type Tool = { itemId: string; tier: number; bonus: number };

/** The best tool for an activity in a bag: highest tier, then biggest bonus. Null when there is none. */
export function bestTool(inventory: Record<string, item> | null | undefined, config: GuildConfig, activityId: string): Tool | null {
    let best: Tool | null = null;
    for (const [itemId, owned] of Object.entries(inventory ?? {})) {
        const t = (config.shop?.items?.[itemId] as shopItemConfig | undefined)?.tool;
        if (!t || t.activityId !== activityId || owned.quantity <= 0) continue;
        const tier = t.tier ?? 1, bonus = t.bonus ?? 0;
        if (!best || tier > best.tier || (tier === best.tier && bonus > best.bonus)) best = { itemId, tier, bonus };
    }
    return best;
}

/** Shop items that are tools for this activity at this tier or better, for "you need a …" messages. */
export function toolsAtTier(config: GuildConfig, activityId: string, tier: number): shopItemConfig[] {
    return Object.values(config.shop?.items ?? {}).filter((i) => i.tool?.activityId === activityId && (i.tool.tier ?? 1) >= tier);
}

/** One weighted pick from a loot table, or null when it has nothing to give. */
export function rollLoot(loot: GatheringLoot[], config: GuildConfig, roll = Math.random): { itemId: string; quantity: number } | null {
    // An entry for a deleted item would hand out nothing, so it never takes a share.
    const live = loot.filter((l) => l.chance > 0 && config.shop?.items?.[l.itemId]);
    const total = live.reduce((sum, l) => sum + l.chance, 0);
    if (total <= 0) return null;

    let r = roll() * total;
    for (const l of live) {
        r -= l.chance;
        if (r < 0) {
            const min = Math.max(1, l.min ?? 1);
            const max = Math.max(min, l.max ?? min);
            return { itemId: l.itemId, quantity: min + Math.floor(roll() * (max - min + 1)) };
        }
    }
    const last = live.at(-1)!;
    return { itemId: last.itemId, quantity: Math.max(1, last.min ?? 1) };
}

type Progress = { energy?: number; energyAt?: string | null } | undefined;

export function energyRules(activity: GatheringActivity) {
    return {
        max: Math.max(1, activity.energyMax ?? 10),
        refillMs: Math.max(1, activity.energyRefillSeconds ?? 360) * 1000,
    };
}

/**
 * Energy right now, from what was stored and when, plus when the next point
 * and a full bar arrive (null when already full). Pure arithmetic on read:
 * there are no timers, however many players there are.
 */
export function energyNow(p: Progress, activity: GatheringActivity, now = Date.now()) {
    const { max, refillMs } = energyRules(activity);
    if (p?.energy == null || !p.energyAt) return { energy: max, max, nextAt: null, fullAt: null };
    const since = Math.max(0, now - Date.parse(p.energyAt));
    const gained = Math.floor(since / refillMs);
    const energy = Math.min(max, Math.max(0, p.energy) + gained);
    if (energy >= max) return { energy: max, max, nextAt: null, fullAt: null };
    const nextAt = Date.parse(p.energyAt) + (gained + 1) * refillMs;
    return { energy, max, nextAt, fullAt: nextAt + (max - energy - 1) * refillMs };
}

/** The stored pair after spending one point. Progress toward the next point carries over. */
export function spentEnergy(p: Progress, activity: GatheringActivity, now = Date.now()) {
    const { max, refillMs } = energyRules(activity);
    const { energy } = energyNow(p, activity, now);
    // A full bar starts its refill clock now; otherwise the clock keeps its phase.
    const at = energy >= max || !p?.energyAt
        ? now
        : Date.parse(p.energyAt) + Math.floor((now - Date.parse(p.energyAt)) / refillMs) * refillMs;
    return { energy: energy - 1, energyAt: new Date(at).toISOString() };
}

export type GridCell = "find" | "hazard" | "empty";

/**
 * The grid game's difficulty after skill eases it: one extra try per 12 skill
 * levels, one fewer hazard per 15 (never below 1 while the location has any).
 */
export function gridRules(location: GatheringLocation, skill: number, toolBonus = 0) {
    const d = location.difficulty ?? {};
    const hazards = d.hazards ?? 2;
    return {
        size: 16,
        finds: Math.min(d.finds ?? 5, 15),
        hazards: hazards > 0 ? Math.max(1, hazards - Math.floor(skill / 15)) : 0,
        tries: (d.tries ?? 5) + Math.floor((skill - 1) / 12) + toolBonus,
    };
}

/** A shuffled grid with the given number of finds and hazards. */
export function makeGrid(rules: { size: number; finds: number; hazards: number }, roll = Math.random): GridCell[] {
    const hazards = Math.min(rules.hazards, rules.size - rules.finds);
    const cells: GridCell[] = [
        ...Array<GridCell>(rules.finds).fill("find"),
        ...Array<GridCell>(hazards).fill("hazard"),
        ...Array<GridCell>(rules.size - rules.finds - hazards).fill("empty"),
    ];
    for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(roll() * (i + 1));
        [cells[i], cells[j]] = [cells[j]!, cells[i]!];
    }
    return cells;
}

/** Spends a point of energy. Called when a run begins, so quitting early still costs it. Returns energy left. */
export async function spendEnergy(userId: number, guildId: number, activity: GatheringActivity): Promise<number> {
    const cached = await getOrCreateProfile({ userId, guildId });
    const p = cached.profile;
    const stats = { ...(p.user_stats ?? {}) } as NonNullable<typeof p.user_stats>;
    const progress = { ...(stats.gathering ?? {}) };
    const mine = progress[activity.id] ?? { xp: 0, runs: 0 };
    progress[activity.id] = { ...mine, ...spentEnergy(mine, activity) };
    stats.gathering = progress;
    p.user_stats = stats;
    commitProfileChanges({
        userId, guildId, profile: p,
        changes: { ...(cached.pendingChanges ?? {}), user_stats: stats } as PendingProfileChanges,
        baseline: { xp: p.xp, gold: p.gold },
    });
    return progress[activity.id]!.energy!;
}

/**
 * Puts items in a bag, respecting the item's max per member. Returns how many
 * went in (0 for a deleted item or a full cap). Mutates `inv`.
 */
export function addToBag(inv: Record<string, item>, config: GuildConfig, itemId: string, qty: number): number {
    const def = config.shop?.items?.[itemId];
    if (!def || qty <= 0) return 0;
    const have = inv[itemId]?.quantity ?? 0;
    const add = def.maxPerUser != null ? Math.min(qty, def.maxPerUser - have) : qty;
    if (add <= 0) return 0;
    inv[itemId] = {
        id: itemId,
        name: def.name,
        ...(def.emoji && { emoji: def.emoji }),
        ...(def.description && { description: def.description }),
        quantity: have + add,
    };
    return add;
}

/**
 * Pays out a finished run: items into the bag (respecting maxPerUser), skill XP,
 * and the run count. Returns the skill before and after, for the result line.
 */
export async function finishRun(opts: {
    userId: number;
    guildId: number;
    config: GuildConfig;
    activity: GatheringActivity;
    location: GatheringLocation;
    found: Record<string, number>;
}) {
    const { userId, guildId, config, activity, location, found } = opts;
    const cached = await getOrCreateProfile({ userId, guildId });
    const p = cached.profile;

    const inv: Record<string, item> = { ...(p.inventory ?? {}) };
    const kept: Record<string, number> = {};
    for (const [itemId, qty] of Object.entries(found)) {
        const add = addToBag(inv, config, itemId, qty);
        if (add > 0) kept[itemId] = add;
    }

    const stats = { ...(p.user_stats ?? {}) } as NonNullable<typeof p.user_stats>;
    const progress = { ...(stats.gathering ?? {}) };
    const mine = progress[activity.id] ?? { xp: 0, runs: 0 };
    const before = skillLevel(mine.xp, config);
    const xp = mine.xp + Math.max(0, location.skillXp ?? 0);
    progress[activity.id] = { ...mine, xp, runs: mine.runs + 1 };
    stats.gathering = progress;

    p.inventory = inv;
    p.user_stats = stats;
    commitProfileChanges({
        userId, guildId, profile: p,
        changes: { ...(cached.pendingChanges ?? {}), inventory: inv, user_stats: stats } as PendingProfileChanges,
        baseline: { xp: p.xp, gold: p.gold },
    });

    return { kept, skillBefore: before, skillAfter: skillLevel(xp, config), skillXp: location.skillXp ?? 0 };
}
