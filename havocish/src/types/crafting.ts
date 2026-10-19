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
    output: RecipeItem;
    minSkill: number;
    /** Crafting-skill XP for a successful craft. */
    skillXp: number;
    /** Not known until learned from a recipe scroll (coming with the scroll action). */
    hidden?: boolean;
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
    /** "simple" is a Craft button; "forge" adds the timing minigame. */
    style: "simple" | "forge";
    /** Simple style: percent chance a craft rolls the masterwork table (or a bonus copy without one). */
    masterworkChance?: number;
    /** Every player-visible word, overridable. */
    words?: Record<string, string>;
    recipes: Record<string, Recipe>;
}

export interface CraftingConfig {
    enabled: boolean;
    stations: Record<string, CraftingStation>;
}

/** Per station id, stored in user_stats.crafting. `known` lists hidden recipes learned. */
export type CraftingProgress = Record<string, { xp: number; crafts: number; known?: string[] }>;
