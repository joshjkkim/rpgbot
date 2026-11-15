import type { GridColours, GridLook } from "../content/gridLooks.js";
import type { StationScene } from "../content/stationScene.js";
import type { Requirements } from "./requirements.js";

/**
 * Crafting: owner-made stations (Smithing, Alchemy, Engineering...), each a
 * skill with recipes that turn items into other items. Like gathering, nothing
 * here is specific to one theme.
 */

export interface RecipeItem {
    itemId: string;
    quantity: number;
}

export interface Recipe {
    id: string;
    inputs: RecipeItem[];
    /** Gold the craft also costs. */
    gold?: number;
    /** Timed style: minutes until it's ready to collect (default 60). */
    minutes?: number;
    output: RecipeItem;
    minSkill: number;
    /** Crafting-skill XP for a successful craft. */
    skillXp: number;
    /** Not known until learned from a recipe scroll (coming with the scroll action). */
    hidden?: boolean;
    /** Gates beyond the station's own skill. */
    requirements?: Requirements;
    /** What a masterwork roll can give instead of the plain output, weighted like gathering loot. */
    masterwork?: { itemId: string; chance: number; quantity: number }[];
}

export interface CraftingStation {
    id: string;
    name: string;
    emoji: string;
    /** What the skill is called on /me and in result lines: "Smithing". */
    skillName: string;
    enabled: boolean;
    /** "simple" is a Craft button; "forge" adds the timing minigame; "timed" is put in, wait, collect. */
    style: "simple" | "forge" | "timed";
    /** Simple style: percent chance a craft rolls the masterwork table (or a bonus copy without one). */
    masterworkChance?: number;
    /**
     * Forge style. Shares of the bar at skill 1 and at the top skill (eased in
     * between), and the share of each ingredient a ruined craft loses.
     */
    forge?: { zone?: [number, number]; centre?: [number, number]; ruinLoss?: number };
    /** Timed style: how many can wait at once, and how the station is drawn. */
    timed?: { slots?: number; scene?: StationScene; look?: GridLook; colours?: Partial<GridColours>; art?: Record<string, string> };
    /** Every player-visible word, overridable. */
    words?: Record<string, string>;
    recipes: Record<string, Recipe>;
}

export interface CraftingConfig {
    enabled: boolean;
    stations: Record<string, CraftingStation>;
}

/** Per station id, stored in user_stats.crafting. `known` lists hidden recipes learned. */
/** One timed craft waiting to be collected. Keeps what it took, so it can be refunded if the recipe goes. */
export type TimedSlot = { recipeId: string; doneAt: string; inputs: RecipeItem[]; gold?: number };
export type CraftingProgress = Record<string, { xp: number; crafts: number; known?: string[]; slots?: TimedSlot[] }>;
