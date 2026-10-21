import type { Requirements } from "./requirements.js";
export interface shopCategoryConfig {
    id: string;
    name: string;
    icon?: string;
    description?: string;
    sortOrder?: number;

    hidden?: boolean;
    roleRequiredIds?: string[];
}

export interface shopItemAction {
    type: "assignRole" | "removeRole" | "sendMessage" | "giveStat" | "giveItem" | "learnRecipe";
    roleId?: string;
    message?: string;
    channelId?: string;
    itemId?: string;
    quantity?: number;
    statId?: string;
    amount?: number;
    /** learnRecipe: the station and its hidden recipe the item teaches. */
    stationId?: string;
    recipeId?: string;
}

export type EquipSlot = "head" | "body" | "legs" | "feet" | "hands" | "weapon" | "shield" | "accessory" | "aura";

// Only colours the item name; the bot does not treat rarities differently.
export type ItemRarity = "poor" | "common" | "uncommon" | "rare" | "epic" | "legendary";

export type ItemEffects = {
  cosmetic?: {
    accentHex?: string;     // aura / accent
    textHex?: string;
    title?: string;
    nameEmoji?: string;     // shown near username on card
    fontPreset?: "inter" | "sora" | "nunito";
  };
  boosts?: {
    xpMultiplier?: number;
    goldMultiplier?: number;
  };
  quest?: {
    canStartQuestIds?: string[];
  };
  stats?: {
    hp?: number;       // bonus max HP
    atk?: number;      // bonus attack
    def?: number;      // bonus defense
    spd?: number;      // bonus speed
    crit?: number;     // bonus crit chance (%)
  };
};
export interface shopItemConfig {
    id: string;
    name: string;
    emoji?: string;
    description?: string;
    rarity?: ItemRarity;

    categoryId: string;

    price: number;
    sellPrice?: number | null;
    equipable?: boolean;
    equipSlot?: EquipSlot;

    minLevel?: number;
    requiresRoleIds?: string[];
    maxPerUser?: number;
    stock?: number | null;
    hidden?: boolean;
    permanent?: boolean;
    tradeable?: boolean;

    effects?: ItemEffects;

    actions?: Record<number, shopItemAction>;

    /**
     * Makes the item a gathering tool. The best one in a player's bag counts,
     * no equipping. `bonus` is per game: Grid +1 try, Timing +0.3 s, Find it +1 s a point.
     */
    tool?: { activityId: string; tier: number; bonus: number };

    /** Who can buy, use or equip it. `minLevel` and `requiresRoleIds` are read into this too. */
    requirements?: Requirements;
}