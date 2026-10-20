import type { GuildConfig } from "../types/guild.js";
import type { CraftingStation, Recipe } from "../types/crafting.js";
import type { DbUserGuildProfile, item } from "../types/userprofile.js";
import type { PendingProfileChanges } from "../types/cache.js";
import { getOrCreateProfile, commitProfileChanges } from "../cache/profileService.js";
import { addToBag, rollLoot, skillLevel } from "./gathering.js";

/**
 * Crafting's rules: which recipes a member can see and make, and making one.
 * Crafting skills share gathering's skill curve. Commands draw the result;
 * this file never touches Discord.
 */

export function enabledStations(config: GuildConfig): CraftingStation[] {
    if (!config.crafting?.enabled) return [];
    return Object.values(config.crafting.stations ?? {}).filter((s) => s.enabled !== false);
}

export function stationProgress(profile: DbUserGuildProfile, stationId: string) {
    return profile.user_stats?.crafting?.[stationId] ?? { xp: 0, crafts: 0, known: [] as string[] };
}

export type RecipeState = {
    /** Why it can't be crafted at all right now, or null. */
    locked: "skill" | "hidden" | "broken" | null;
    /** Per input: what's needed and what the member has. */
    inputs: { itemId: string; need: number; have: number }[];
    gold: { need: number; have: number };
    /** Enough of everything for one craft. */
    affordable: boolean;
};

/** What a member sees for a recipe: whether it's locked, and what they have of each input. */
export function recipeState(recipe: Recipe, profile: DbUserGuildProfile, config: GuildConfig, skill: number, known: string[]): RecipeState {
    const items = config.shop?.items ?? {};
    const inv = profile.inventory ?? {};
    const inputs = (recipe.inputs ?? []).map((i) => ({ itemId: i.itemId, need: Math.max(1, i.quantity ?? 1), have: inv[i.itemId]?.quantity ?? 0 }));
    const gold = { need: Math.max(0, recipe.gold ?? 0), have: Number(profile.gold ?? 0) };
    const broken = !items[recipe.output?.itemId] || inputs.some((i) => !items[i.itemId]);
    const locked = broken ? "broken" : recipe.hidden && !known.includes(recipe.id) ? "hidden" : skill < (recipe.minSkill ?? 1) ? "skill" : null;
    const affordable = inputs.every((i) => i.have >= i.need) && gold.have >= gold.need;
    return { locked, inputs, gold, affordable };
}

export type CraftResult =
    | { ok: false; message: string }
    | { ok: true; gave: { itemId: string; quantity: number }; masterwork: boolean; xp: number; skillBefore: number; skillAfter: number };

/**
 * Makes one craft: takes the inputs and gold, gives the output (or, on a
 * masterwork roll, a pick from the recipe's masterwork table, or a bonus copy
 * without one), and adds skill XP. Everything is checked and changed with no
 * await in between, so two quick clicks can't spend the same ore twice.
 */
export async function craftOnce(opts: {
    userId: number;
    guildId: number;
    config: GuildConfig;
    station: CraftingStation;
    recipe: Recipe;
    roll?: () => number;
}): Promise<CraftResult> {
    const { userId, guildId, config, station, recipe, roll = Math.random } = opts;
    const cached = await getOrCreateProfile({ userId, guildId });
    const p = cached.profile;

    const mine = stationProgress(p, station.id);
    const skillBefore = skillLevel(mine.xp, config);
    const state = recipeState(recipe, p, config, skillBefore, mine.known ?? []);
    if (state.locked === "broken") return { ok: false, message: "This recipe uses or makes an item that no longer exists." };
    if (state.locked === "hidden") return { ok: false, message: "You haven't learned this recipe yet." };
    if (state.locked === "skill") return { ok: false, message: `This needs ${station.skillName} ${recipe.minSkill}.` };
    if (!state.affordable) return { ok: false, message: "You don't have everything this needs." };

    const inv: Record<string, item> = { ...(p.inventory ?? {}) };
    for (const i of state.inputs) {
        const left = (inv[i.itemId]?.quantity ?? 0) - i.need;
        if (left > 0) inv[i.itemId] = { ...inv[i.itemId]!, quantity: left };
        else delete inv[i.itemId];
    }

    let gave = { itemId: recipe.output.itemId, quantity: Math.max(1, recipe.output.quantity ?? 1) };
    const masterwork = station.style === "simple" && roll() * 100 < (station.masterworkChance ?? 0);
    if (masterwork) {
        const table = (recipe.masterwork ?? []).map((m) => ({ itemId: m.itemId, chance: m.chance, min: m.quantity ?? 1, max: m.quantity ?? 1 }));
        gave = rollLoot(table, config, roll) ?? { ...gave, quantity: gave.quantity * 2 };
    }
    addToBag(inv, config, gave.itemId, gave.quantity);

    const xp = Math.max(0, recipe.skillXp ?? 0);
    const stats = { ...(p.user_stats ?? {}) } as NonNullable<typeof p.user_stats>;
    stats.crafting = { ...(stats.crafting ?? {}), [station.id]: { ...mine, xp: mine.xp + xp, crafts: mine.crafts + 1 } };

    const baseline = { xp: p.xp, gold: p.gold };
    if (state.gold.need > 0) p.gold = (BigInt(p.gold) - BigInt(state.gold.need)).toString();
    p.inventory = inv;
    p.user_stats = stats;
    commitProfileChanges({
        userId, guildId, profile: p,
        changes: { ...(cached.pendingChanges ?? {}), inventory: inv, user_stats: stats, ...(state.gold.need > 0 && { gold: p.gold }) } as PendingProfileChanges,
        baseline,
    });

    return { ok: true, gave, masterwork, xp, skillBefore, skillAfter: skillLevel(mine.xp + xp, config) };
}
