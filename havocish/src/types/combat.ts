import type { Requirements } from "./requirements.js";
import type { CombatStats } from "../player/combat.js";
import type { DbUserGuildProfile } from "./userprofile.js";
import type { GuildConfig } from "./guild.js";
import type { DbGuild } from "./guild.js";

export interface EnemyDrop {
    itemId: string;
    chance: number; // 0-1
    quantity: number;
}

export interface EnemyConfig {
    id: string;
    name: string;
    emoji: string;

    hp: number;
    atk: number;
    def: number;
    spd: number;
    critChance: number;
    critMultiplier: number;

    // Who can encounter this enemy
    minLevel: number;
    maxLevel: number | null; // null = no upper limit
    // reqRoleIds: string[]; // Discord role IDs required to encounter will do later

    // Rewards on kill
    xpReward: number;
    goldReward: number;
    drops: EnemyDrop[];

    /**
     * A world boss: fought by the whole server at once (player/bosses.ts), never
     * by /fight or random encounters. Its XP and gold are the pool split by damage.
     */
    boss?: boolean;
    /** Who may fight it, beyond its level range: roles, skills, membership age... */
    requirements?: Requirements;
    /** What it does in a fight, picked by weight each turn. Without any it uses the default moves. */
    moves?: EnemyMove[];
    /** false: fought alone only, no joining. */
    party?: boolean;
    /** How often it turns up outside places, against others' 1 (default 1): 0.2 for a rare elite. Places use their own weights. */
    spawnWeight?: number;
    /** An image URL for the battle scene, in place of its emoji. */
    image?: string;
}

// ─── Moves ────────────────────────────────────────────────────────────────────
// Every fight move, a player's or an enemy's, is up to three effects built from
// the same blocks (player/moves.ts). Owners combine them; nothing is themed.

export type MoveStat = "atk" | "def" | "spd" | "crit";

/** When an effect applies. "target" is the other fighter, "self" the one moving. */
export type MoveCondition =
    | { type: "targetHasStatus"; statusId: string }
    | { type: "selfHpBelow"; percent: number }
    | { type: "targetHpBelow"; percent: number }
    | { type: "targetCharging" }
    | { type: "targetGuarding" };

export type MoveEffect = {
    /** Who it lands on. Each block has its own default; "self" with a bad value is a drawback. */
    target?: "self" | "target";
    /** Percent chance it happens at all (default 100). */
    chance?: number;
    when?: MoveCondition;
} & (
    /** Damage: power x the normal hit; pierce ignores that % of defense; lifesteal heals that % of the damage. */
    | { type: "hit"; power: number; hits?: number; pierce?: number; lifesteal?: number }
    /** Takes that % less damage this turn. */
    | { type: "guard"; percent: number }
    /** When hit this turn: deals that % of the damage back, and/or stuns the attacker. */
    | { type: "counter"; percent?: number; stun?: boolean }
    /** Heals that % of max HP; negative loses it (never below 1 HP). */
    | { type: "heal"; percent: number }
    /** Changes a stat by that % for some turns, counting this one. */
    | { type: "boost"; stat: MoveStat; percent: number; turns: number }
    /** Puts an owner-made status on for some turns. */
    | { type: "status"; statusId: string; turns: number }
    /** The next action is lost; a wind-up is cancelled. */
    | { type: "stun" }
    | { type: "cleanse"; harmfulOnly?: boolean }
);

export interface MoveConfig {
    id: string;
    name: string;
    emoji: string;
    /** Shown before an enemy uses it, or while it winds up: "raises its club high…" */
    telegraph?: string;
    /** Turns it can't be used again after. */
    cooldown?: number;
    usesPerFight?: number;
    /** Goes before the other side's move. */
    firstStrike?: boolean;
    /** Turns spent winding up before it goes off. */
    charge?: number;
    effects: MoveEffect[];
    /** Set for moves players can have; without it the move is enemies-only. */
    players?: {
        requirements?: Requirements;
        /** Only by learning it (a move scroll) or from gear, not by meeting the requirements. */
        learned?: boolean;
    };
}

/** An owner-made lasting effect: Bleeding, Poisoned, Blessed... */
export interface StatusConfig {
    id: string;
    name: string;
    emoji: string;
    /** % of max HP each turn: negative hurts, positive heals. */
    hpPercentPerTurn: number;
    /** Stat changes while it's on, in %, per stack: { atk: -20 } is Weakened. */
    stats?: Partial<Record<MoveStat, number>>;
    /** Putting it on again adds a stack, up to this many (default 1: it just refreshes). */
    maxStacks?: number;
}

/**
 * A place in the server: the channels (or whole categories) it covers, the
 * enemies met there, and how loudly fights show. The server's channel list
 * becomes its map.
 */
export interface PlaceConfig {
    id: string;
    name: string;
    emoji: string;
    /** How an enemy turns up here, after its name: "prowls out of the treeline". */
    arrival?: string;
    /** Channel or category ids. A thread counts as the channel it's in. */
    channelIds: string[];
    /** Who is met here, picked by weight among those suiting the player's level. */
    enemies: { enemyId: string; weight?: number }[];
    /** "thread" (default): a fight opens in a thread off one short line, for chat channels. "channel": it plays out in the channel. */
    fights?: "thread" | "channel";
    /** The battle scene's sky colour, or a background image (URL) for it. */
    colour?: string;
    image?: string;
}

export interface EnemyMove {
    moveId: string;
    weight?: number;
    when?: MoveCondition;
}

/** One side's fight state beyond HP: what is on it and what it's doing. */
export interface FighterState {
    statuses: Record<string, number>;               // status id -> turns left
    /** Stacks of each status on, when above 1. */
    stacks?: Record<string, number>;
    boosts: { stat: MoveStat; percent: number; turns: number }[];
    cooldowns: Record<string, number>;              // move id -> turns left
    uses: Record<string, number>;
    stunned?: boolean;
    charging?: { moveId: string; turnsLeft: number };
}

// ─── In-memory fight state ────────────────────────────────────────────────────
// One of these lives in the activeFights Map for the duration of a fight.
// Never written to the DB until the fight ends.

/** One player in a fight. A solo fight has one; a party up to the server's cap. */
export interface FightMember {
    userId: string;             // Discord user ID
    dbUserId: number;           // profile id, so a fight nobody finishes can still be saved
    name: string;
    /** For the battle scene. */
    avatarUrl?: string;
    stats: CombatStats;         // computed when they joined, does not change mid-fight
    /** Their Combat level when they joined, for easy-enemy XP. */
    level?: number;
    hp: number;
    state: FighterState;
    /** The moves they brought: up to four ids. */
    loadout: string[];
    /** This round's pick (a button's action id), until the round plays. */
    pick?: string;
    /** Out of the fight: knocked out (still paid, half, on a win) or fled (settled when they left). */
    out?: "down" | "fled";
    dealt: number;
    taken: number;
}

export interface ActiveFight {
    // Identity
    /** Who started it: the fight's owner for /fight and its result line. */
    userId: string;
    guildId: string;         // Discord guild ID
    messageId: string;       // the fight embed message (for button routing)
    channelId: string;
    dbGuildId: number;
    combatType: "pve" | "pvp";  // determines which death penalty block to apply

    // Combatants
    members: FightMember[];
    enemy: EnemyConfig;
    /** The enemy's HP, raised for each player who joins. */
    enemyMaxHp: number;
    enemyCurrentHp: number;     // mutated each round
    foe: FighterState;
    /** In a thread: the short line in chat it hangs off, which gets the result when it ends. */
    origin?: { channelId: string; messageId: string };
    /** The place it's in, for that result line and the scene's backdrop. */
    placeName?: string;
    placeId?: string;
    /** What the enemy does next turn, shown before the players pick. */
    enemyIntent: string;
    /** Who that's aimed at: a member's userId. */
    enemyTarget: string;
    /** HP lost last turn, for the battle scene's damage numbers. */
    lastHits?: { enemy: number; members: Record<string, number> };

    // Bookkeeping
    round: number;
    startedAt: number;          // Date.now() — for timeout cleanup
    expiresAt: number;          // fight auto-expires if player never responds
    /** In a party, when this round plays whether or not everyone has picked. */
    roundEndsAt?: number;
    roundTimer?: NodeJS.Timeout;
    /** Set while a round is being played, so the timer and a last pick can't both play it. */
    playing?: boolean;

    /**
     * Set once the fight has ended and its rewards have been handed out.
     *
     * Button handlers capture this object before awaiting, so two clicks can
     * both reach the fight holding the same object. Removing it from the
     * active map is not enough to stop the second one -- this flag is.
     */
    resolved?: boolean;
}

// ─── Fight context ────────────────────────────────────────────────────────────
// Passed into every CombatAction.execute(). Actions are read-only consumers;
// the fight loop applies the returned result and mutates ActiveFight itself.

export interface FightContext {
    fight: ActiveFight;
    profile: DbUserGuildProfile;
    guild: DbGuild;
    config: GuildConfig;
}

// ─── Combat action result ─────────────────────────────────────────────────────
// Returned by every CombatAction.execute(). The fight loop applies this.

export type FightOutcome = "continue" | "win" | "loss" | "flee";

export interface CombatActionResult {
    outcome: FightOutcome;
    playerHpDelta: number;   // negative = damage taken, positive = healing
    enemyHpDelta: number;    // negative = damage dealt
    log: string[];           // lines appended to the round's combat log embed
}

// ─── Combat action definition ─────────────────────────────────────────────────
// The registry (player/combat.ts or a dedicated actions file) exports
// CombatAction objects. The fight button handler looks them up by id.

export interface CombatAction {
    id: string;
    label: string;
    emoji: string;
    style: "primary" | "danger" | "secondary";  // maps to ButtonStyle
    // Whether this action should appear as a button in the current fight state
    available?: (ctx: FightContext) => boolean;
    execute: (ctx: FightContext) => CombatActionResult;
}

// ─── Fight end summary ────────────────────────────────────────────────────────
// Produced at fight end, consumed by the reward-apply function.

export interface FightEndSummary {
    outcome: Exclude<FightOutcome, "continue">;
    xpGained: number;
    goldGained: number;
    goldLost: number;          // gold deducted on death (0 if won/fled)
    itemsDropped: { itemId: string; quantity: number }[];
    rounds: number;
    totalDamageDealt: number;
    totalDamageTaken: number;
    questsCompleted?: string[]; // quest names this fight finished, set in applyFightRewards
    combatLevelUp?: number;     // the new Combat level, when this fight raised it
    /** Knocked out in a party that won: half rewards. */
    knockedOut?: boolean;
    /** Share of XP paid because the enemy was below their level (1 = full). */
    easyShare?: number;
}

// ─── Skill config (future — add to GuildConfig.combat.skills later) ───────────
// Defined here now so the CombatAction registry can reference it
// without requiring a GuildConfig schema change to use basic combat today.

export interface SkillConfig {
    id: string;
    label: string;
    emoji: string;
    style: "primary" | "danger" | "secondary";

    // Damage modifier relative to basic attack
    damageMultiplier: number;   // e.g. 1.8 = 180% of normal hit

    // Cost & cooldown
    cooldownRounds: number;     // 0 = no cooldown
    // mpCost: number;          // reserved for later if mana is added

    // Optional: this skill always crits, or never crits
    forceCrit?: boolean;
    noCrit?: boolean;

    // Which equip slots / item IDs unlock this skill (empty = always available)
    // e.g. a weapon item grants "power_slash" via ItemEffects.skills = ["power_slash"]
    unlockedBy: string[];  // item IDs
}

// ─── Duels (auto-resolved PvP) ────────────────────────────────────────────────
// A duel is not an ActiveFight: there are no buttons and no turns to wait on.
// Both stat blocks are simulated to a conclusion the moment a challenge is
// accepted, so nothing needs to be held in memory mid-fight.

export interface DuelSide {
    /** users.id, not a profile id. */
    userId: number;
    discordUserId: string;
    displayName: string;
    stats: CombatStats;
    startingHp: number;
}

export interface DuelRound {
    round: number;
    attacker: string;   // discordUserId of whoever struck
    damage: number;
    isCrit: boolean;
    attackerHpAfter: number;
    defenderHpAfter: number;
}

export interface DuelResult {
    /** null when neither side dropped before the round cap. */
    winnerDiscordId: string | null;
    loserDiscordId: string | null;
    rounds: DuelRound[];
    challengerHp: number;
    opponentHp: number;
    /** True when the round cap was hit rather than someone falling. */
    draw: boolean;
}

/** A challenge waiting on its opponent, held in memory until accepted or expired. */
export interface PendingDuel {
    challengerDiscordId: string;
    opponentDiscordId: string;
    discordGuildId: string;
    channelId: string;
    messageId: string;
    wager: number;
    createdAt: number;
    expiresAt: number;
}
