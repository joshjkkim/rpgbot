/**
 * Conditions that gate RPG content (an item, a location, a recipe, an enemy, a
 * quest). All set conditions must hold. Roles are "any one of", which is how
 * havocish works alongside other leveling bots: they hand out roles at levels.
 */
export interface Requirements {
    /** Combat level, the RPG's own level. */
    combatLevel?: number;
    /** havocish chat level. Ignored while havocish's leveling is off. */
    chatLevel?: number;
    /** Gathering activity or crafting station id -> minimum skill level. */
    skills?: Record<string, number>;
    /** Any one of these roles. */
    roles?: string[];
    /** At least this many days in the server. */
    memberDays?: number;
    /** Must be boosting the server. */
    booster?: boolean;
}
