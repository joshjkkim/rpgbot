import type { GuildConfig } from "../types/guild.js";
import type { GatheringActivity, GatheringLocation, GatheringLoot } from "../types/gathering.js";
import type { item } from "../types/userprofile.js";
import type { shopItemConfig } from "../types/economy.js";
import type { PendingProfileChanges } from "../types/cache.js";
import { calculateLevelFromXp } from "../leveling/levels.js";
import { getOrCreateProfile, commitProfileChanges } from "../cache/profileService.js";

/**
 * The parts every gathering game shares: skill levels, which locations a player
 * can reach, the loot roll, cooldowns, and paying out a finished run. The games
 * themselves (commands/user/gather.ts) only decide how many finds a run makes.
 */

/** A gathering skill level from its XP, on the server's gathering curve. */
export function skillLevel(xp: number, config: GuildConfig): number {
    const { maxLevel, curveType, curveParams } = config.gathering.skill;
    // The chat level code already handles every curve type; it only reads `levels`.
    return calculateLevelFromXp(xp, { levels: { maxLevel, curveType, curveParams, xpOverrides: {} } } as unknown as GuildConfig);
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

/** Seconds left on this activity's cooldown, 0 when ready. */
export function cooldownLeft(lastAt: string | null | undefined, activity: GatheringActivity, now = Date.now()): number {
    if (!lastAt) return 0;
    const readyAt = Date.parse(lastAt) + (activity.cooldownSeconds ?? 300) * 1000;
    return readyAt <= now ? 0 : Math.ceil((readyAt - now) / 1000);
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

/** Marks the activity's cooldown as started. Called when a run begins, so quitting early doesn't skip it. */
export async function startCooldown(userId: number, guildId: number, activityId: string) {
    const cached = await getOrCreateProfile({ userId, guildId });
    const p = cached.profile;
    const stats = { ...(p.user_stats ?? {}) } as NonNullable<typeof p.user_stats>;
    const progress = { ...(stats.gathering ?? {}) };
    const mine = progress[activityId] ?? { xp: 0, lastAt: null, runs: 0 };
    progress[activityId] = { ...mine, lastAt: new Date().toISOString() };
    stats.gathering = progress;
    p.user_stats = stats;
    commitProfileChanges({
        userId, guildId, profile: p,
        changes: { ...(cached.pendingChanges ?? {}), user_stats: stats } as PendingProfileChanges,
        baseline: { xp: p.xp, gold: p.gold },
    });
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
        const def = config.shop?.items?.[itemId];
        if (!def || qty <= 0) continue;
        const have = inv[itemId]?.quantity ?? 0;
        const add = def.maxPerUser != null ? Math.min(qty, def.maxPerUser - have) : qty;
        if (add <= 0) continue;
        inv[itemId] = {
            id: itemId,
            name: def.name,
            ...(def.emoji && { emoji: def.emoji }),
            ...(def.description && { description: def.description }),
            quantity: have + add,
        };
        kept[itemId] = add;
    }

    const stats = { ...(p.user_stats ?? {}) } as NonNullable<typeof p.user_stats>;
    const progress = { ...(stats.gathering ?? {}) };
    const mine = progress[activity.id] ?? { xp: 0, lastAt: null, runs: 0 };
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
