import type { Requirements } from "./requirements.js";

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

/** Rules that change how one game plays (player/twists.ts RULES says what each does). */
export type TwistRule =
    | "grid.adjacent" | "grid.clustered" | "grid.unstable"
    | "timing.falseAlarm" | "timing.twice" | "timing.fragile"
    | "find.glimpse" | "find.reshuffle" | "find.twin";

/** What a trait or condition does. General effects work in any game; rules only in theirs. */
export interface TwistEffects {
    /** Steps harder (+) or easier (−). */
    difficulty?: number;
    /** Rare-and-up items' share of the loot, in % (200 doubles it). */
    rareLoot?: number;
    /** Extra items per find. */
    yield?: number;
    /** Skill XP, in % (150 is half again). */
    xp?: number;
    /** Extra energy a run costs. */
    energy?: number;
    rules?: TwistRule[];
}

/** A location's fixed character: "Pitch dark", "Fast water". */
export interface LocationTrait {
    name: string;
    emoji: string;
    /** Shown when a run starts; without one, the rules describe themselves. */
    line?: string;
    effects: TwistEffects;
}

/** A server-wide condition locations can have on a given day: "Storm", "Fog". */
export interface GatheringCondition {
    id: string;
    name: string;
    emoji: string;
    line?: string;
    effects: TwistEffects;
}

export interface GatheringLocation {
    id: string;
    name: string;
    emoji: string;
    minSkill: number;
    /** A tool of at least this tier for the activity is needed. */
    minToolTier?: number;
    /** Gates beyond the activity's own skill: other skills, roles, membership age... */
    requirements?: Requirements;
    /** Skill XP for finishing a run here. */
    skillXp: number;
    loot: GatheringLoot[];
    /** Per game. Grid: finds, hazards, tries. */
    difficulty?: Record<string, number>;
    /** Its fixed character. */
    traits?: LocationTrait[];
    /** Conditions it can have on a day, by weight, against `calmWeight` (default 2) for none. */
    conditions?: { conditionId: string; weight?: number }[];
    calmWeight?: number;
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
    /** Conditions locations can roll, a new roll every `conditionHours` (default 6). */
    conditions?: Record<string, GatheringCondition>;
    conditionHours?: number;
}

/** Per activity id, stored in user_stats.gathering. */
/**
 * Per activity id, stored in user_stats.gathering. Energy is stored as the
 * amount at a moment (`energy` at `energyAt`) and worked out when read, so
 * nothing ticks in the background. No `energy` yet means a full bar.
 */
export type GatheringProgress = Record<string, { xp: number; runs: number; energy?: number; energyAt?: string | null }>;
