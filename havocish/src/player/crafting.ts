import type { GuildConfig } from "../types/guild.js";
import type { CraftingStation, Recipe } from "../types/crafting.js";
import type { DbUserGuildProfile, item } from "../types/userprofile.js";
import type { PendingProfileChanges } from "../types/cache.js";
import { getOrCreateProfile, commitProfileChanges } from "../cache/profileService.js";
import { addToBag, rollLoot, skillLevel } from "./gathering.js";
import { checkRequirements, type MemberFacts } from "./requirements.js";

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
    locked: "skill" | "hidden" | "broken" | "requirements" | null;
    /** For a "requirements" lock: what's missing, worded for a message. */
    needs?: string;
    /** Per input: what's needed and what the member has. */
    inputs: { itemId: string; need: number; have: number }[];
    gold: { need: number; have: number };
    /** Enough of everything for one craft. */
    affordable: boolean;
};

/**
 * Whether a member can use a recipe scroll: "missing" when the station or
 * recipe no longer exists, "known" when there's nothing to learn (already
 * learned, or never hidden), "new" otherwise.
 */
export function recipeToLearn(profile: DbUserGuildProfile, config: GuildConfig, stationId: string, recipeId: string) {
    const station = config.crafting?.stations?.[stationId];
    const recipe = station?.recipes?.[recipeId];
    if (!station || !recipe) return { status: "missing" as const };
    const known = !recipe.hidden || (stationProgress(profile, stationId).known ?? []).includes(recipeId);
    return { status: known ? "known" as const : "new" as const, station, recipe };
}

/** Records a learned recipe on the profile (the caller commits it). */
export function learnRecipe(profile: DbUserGuildProfile, stationId: string, recipeId: string) {
    const mine = stationProgress(profile, stationId);
    const known = [...new Set([...(mine.known ?? []), recipeId])];
    profile.user_stats = {
        ...(profile.user_stats ?? {}),
        crafting: { ...(profile.user_stats?.crafting ?? {}), [stationId]: { ...mine, known } },
    } as typeof profile.user_stats;
}

/** What a member sees for a recipe: whether it's locked, and what they have of each input. */
export function recipeState(recipe: Recipe, profile: DbUserGuildProfile, config: GuildConfig, skill: number, known: string[], facts?: MemberFacts): RecipeState {
    const items = config.shop?.items ?? {};
    const inv = profile.inventory ?? {};
    const inputs = (recipe.inputs ?? []).map((i) => ({ itemId: i.itemId, need: Math.max(1, i.quantity ?? 1), have: inv[i.itemId]?.quantity ?? 0 }));
    const gold = { need: Math.max(0, recipe.gold ?? 0), have: Number(profile.gold ?? 0) };
    const broken = !items[recipe.output?.itemId] || inputs.some((i) => !items[i.itemId]);
    // Without facts (no Discord member to hand), requirements aren't checked; every craft path passes them.
    const gate = facts ? checkRequirements(recipe.requirements, { profile, config, facts }) : { ok: true, message: "" };
    const locked = broken ? "broken"
        : recipe.hidden && !known.includes(recipe.id) ? "hidden"
        : skill < (recipe.minSkill ?? 1) ? "skill"
        : !gate.ok ? "requirements"
        : null;
    const affordable = inputs.every((i) => i.have >= i.need) && gold.have >= gold.need;
    return { locked, inputs, gold, affordable, ...(locked === "requirements" && { needs: gate.message }) };
}

export type CraftResult =
    | { ok: false; message: string }
    | { ok: true; ruined: false; gave: { itemId: string; quantity: number }; masterwork: boolean; xp: number; skillBefore: number; skillAfter: number }
    | { ok: true; ruined: true; lost: { itemId: string; quantity: number }[]; xp: 0; skillBefore: number; skillAfter: number };

/** The forge bar's length, in cells. */
export const FORGE_CELLS = 15;

/** Zone and centre sizes in cells at this skill, easing from skill 1 to the top skill. */
export function forgeRules(station: CraftingStation, skill: number, maxSkill: number) {
    const f = station.forge ?? {};
    const [z1, z2] = f.zone ?? [0.3, 0.5];
    const [c1, c2] = f.centre ?? [0.06, 0.1];
    const t = Math.min(1, Math.max(0, (skill - 1) / Math.max(1, maxSkill - 1)));
    const zone = Math.max(1, Math.min(FORGE_CELLS, Math.round(FORGE_CELLS * (z1 + (z2 - z1) * t))));
    const centre = Math.max(1, Math.min(zone, Math.round(FORGE_CELLS * (c1 + (c2 - c1) * t))));
    return { zone, centre, ruinLoss: Math.min(1, Math.max(0, f.ruinLoss ?? 0.5)) };
}

/** Where this craft's zone sits: a random spot each time, so the timing can't be memorised. */
export function placeForge(rules: { zone: number; centre: number }, roll = Math.random) {
    const zoneStart = Math.floor(roll() * (FORGE_CELLS - rules.zone + 1));
    const centreStart = zoneStart + Math.floor((rules.zone - rules.centre) / 2);
    return { zoneStart, zoneEnd: zoneStart + rules.zone - 1, centreStart, centreEnd: centreStart + rules.centre - 1 };
}

export type ForgeOutcome = "ruin" | "made" | "perfect";

export function judgeForge(cell: number, place: ReturnType<typeof placeForge>): ForgeOutcome {
    if (cell >= place.centreStart && cell <= place.centreEnd) return "perfect";
    if (cell >= place.zoneStart && cell <= place.zoneEnd) return "made";
    return "ruin";
}

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
    /** Forge style: the strike's result. Simple style rolls the station's masterwork chance instead. */
    outcome?: ForgeOutcome;
    /** The member, for the recipe's requirements. */
    facts?: MemberFacts;
}): Promise<CraftResult> {
    const { userId, guildId, config, station, recipe, roll = Math.random, outcome, facts } = opts;
    const cached = await getOrCreateProfile({ userId, guildId });
    const p = cached.profile;

    const mine = stationProgress(p, station.id);
    const skillBefore = skillLevel(mine.xp, config);
    const state = recipeState(recipe, p, config, skillBefore, mine.known ?? [], facts);
    if (state.locked === "broken") return { ok: false, message: "This recipe uses or makes an item that no longer exists." };
    if (state.locked === "hidden") return { ok: false, message: "You haven't learned this recipe yet." };
    if (state.locked === "skill") return { ok: false, message: `This needs ${station.skillName} ${recipe.minSkill}.` };
    if (state.locked === "requirements") return { ok: false, message: state.needs ?? "You can't craft this yet." };
    if (!state.affordable) return { ok: false, message: "You don't have everything this needs." };

    const inv: Record<string, item> = { ...(p.inventory ?? {}) };
    const take = (itemId: string, n: number) => {
        const left = (inv[itemId]?.quantity ?? 0) - n;
        if (left > 0) inv[itemId] = { ...inv[itemId]!, quantity: left };
        else delete inv[itemId];
    };

    // A ruined craft loses part of each ingredient, costs no gold and gives no XP.
    if (outcome === "ruin") {
        const { ruinLoss } = forgeRules(station, skillBefore, config.gathering.skill.maxLevel);
        const lost = state.inputs.map((i) => ({ itemId: i.itemId, quantity: Math.floor(i.need * ruinLoss) })).filter((l) => l.quantity > 0);
        for (const l of lost) take(l.itemId, l.quantity);
        p.inventory = inv;
        commitProfileChanges({
            userId, guildId, profile: p,
            changes: { ...(cached.pendingChanges ?? {}), inventory: inv } as PendingProfileChanges,
            baseline: { xp: p.xp, gold: p.gold },
        });
        return { ok: true, ruined: true, lost, xp: 0, skillBefore, skillAfter: skillBefore };
    }
    for (const i of state.inputs) take(i.itemId, i.need);

    let gave = { itemId: recipe.output.itemId, quantity: Math.max(1, recipe.output.quantity ?? 1) };
    const masterwork = outcome ? outcome === "perfect" : roll() * 100 < (station.masterworkChance ?? 0);
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

    return { ok: true, ruined: false, gave, masterwork, xp, skillBefore, skillAfter: skillLevel(mine.xp + xp, config) };
}
