/**
 * Gathering: owner-made activities, each played as one of a set of button
 * minigames. Nothing here is specific to mining or fishing; those are just how
 * a starter pack names and words its activities.
 */

/** Wave 2 and 3 add more (codebreaker, trail, forge, memory, sequence). */
export type GameType = "grid" | "timing" | "find";

export interface GatheringLoot {
    itemId: string;
    /** A weight, not a probability: shown on the dashboard as a share of the spot's total. */
    chance: number;
    min: number;
    max: number;
}

export interface GatheringLocation {
    id: string;
    name: string;
    emoji: string;
    minSkill: number;
    /** A tool of at least this tier for the activity is needed. */
    minToolTier?: number;
    /** Skill XP for finishing a run here. */
    skillXp: number;
    loot: GatheringLoot[];
    /** Per game. Grid: finds, hazards, tries. */
    difficulty?: Record<string, number>;
}

export interface GatheringActivity {
    id: string;
    name: string;
    emoji: string;
    /** What the skill is called on /me and in result lines: "Mining", "Salvaging". */
    skillName: string;
    enabled: boolean;
    /** Runs a full bar holds (default 10). A run costs one. */
    energyMax?: number;
    /** Seconds for one point to refill (default 360, so a full bar in an hour). */
    energyRefillSeconds?: number;
    game: GameType;
    /** Per game, every player-visible word. Grid: tile, empty, hazard, hazardLine, leave, tries, verb. */
    words?: Record<string, string>;
    locations: Record<string, GatheringLocation>;
}

export interface GatheringConfig {
    enabled: boolean;
    /** Empty means any channel. */
    channelIds?: string[];
    skill: {
        maxLevel: number;
        curveType: "linear" | "exponential" | "polynomial" | "logarithmic";
        curveParams: Record<string, number>;
    };
    activities: Record<string, GatheringActivity>;
}

/** Per activity id, stored in user_stats.gathering. */
/**
 * Per activity id, stored in user_stats.gathering. Energy is stored as the
 * amount at a moment (`energy` at `energyAt`) and worked out when read, so
 * nothing ticks in the background. No `energy` yet means a full bar.
 */
export type GatheringProgress = Record<string, { xp: number; runs: number; energy?: number; energyAt?: string | null }>;
