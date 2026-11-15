import type { EnemyMove } from "../content/fight.js";

/**
 * Pets: owner-made species a member hatches or is given, levels up and brings
 * into fights. Nothing here is specific to one theme: a drake, a drone and a
 * robot crab are all species.
 */

export type PetStats = { hp: number; atk: number; def: number; spd: number };

/** A look and, optionally, new moves from a level on. Stages after the first change how the pet looks. */
export interface PetStage {
    atLevel: number;
    /** What this stage is called: "Hatchling", "Young", "Grown". */
    name?: string;
    emoji?: string;
    /** A managed /api/images/<uuid> path. */
    image?: string;
    /** Moves added from this stage on. */
    moves?: EnemyMove[];
}

export interface PetSpecies {
    id: string;
    name: string;
    emoji: string;
    image?: string;
    enabled?: boolean;
    /** Stats at level 1, and what each level adds. */
    base: PetStats;
    growth: PetStats;
    /** Default 30, at most the gathering skill cap. */
    maxLevel?: number;
    /** Picked by weight and condition each turn, like an enemy's. "self" effects land on the pet's owner. */
    moves: EnemyMove[];
    stages?: PetStage[];
    /** Every player-visible word, overridable. */
    words?: Record<string, string>;
}

export interface PetsConfig {
    enabled: boolean;
    species: Record<string, PetSpecies>;
    /** How many a member can keep (default 10). */
    maxOwned?: number;
    /** Percent of its owner's fight XP a pet earns on a win (default 50). */
    xpShare?: number;
    /** Whether enemies can target pets (default false). A pet at 0 HP sits out the rest of that fight. */
    canBeHit?: boolean;
    /** Item id -> pet XP for feeding it. */
    foods?: Record<string, number>;
}

/** One pet a member owns, kept in user_stats.pets. */
export interface OwnedPet {
    /** Unique per member, so two of one species are told apart. */
    uid: string;
    speciesId: string;
    name: string;
    xp: number;
}

export interface PetsProgress {
    owned: OwnedPet[];
    active?: string;
}
