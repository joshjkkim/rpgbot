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
}

export interface EnemyMove {
    moveId: string;
    weight?: number;
    when?: MoveCondition;
}

/** One side's fight state beyond HP: what is on it and what it's doing. */
export interface FighterState {
    statuses: Record<string, number>;               // status id -> turns left
    boosts: { stat: MoveStat; percent: number; turns: number }[];
    cooldowns: Record<string, number>;              // move id -> turns left
    uses: Record<string, number>;
    stunned?: boolean;
    charging?: { moveId: string; turnsLeft: number };
}

// ─── In-memory fight state ────────────────────────────────────────────────────
// One of these lives in the activeFights Map for the duration of a fight.
// Never written to the DB until the fight ends.

export interface ActiveFight {
    // Identity
    userId: string;          // Discord user ID
    guildId: string;         // Discord guild ID
    messageId: string;       // the fight embed message (for button routing)
    channelId: string;
    /** The fighter's profile ids, so a fight nobody finishes can still be saved. */
    dbUserId: number;
    dbGuildId: number;
    combatType: "pve" | "pvp";  // determines which death penalty block to apply

    // Combatants
    playerStats: CombatStats;   // computed at fight start, does not change mid-fight
    playerCurrentHp: number;    // mutated each round
    enemy: EnemyConfig;
    enemyCurrentHp: number;     // mutated each round
    player: FighterState;
    foe: FighterState;
    /** The moves the player brought: up to four ids. */
    loadout: string[];
    /** What the enemy does next turn, shown before the player picks. */
    enemyIntent: string;

    // Bookkeeping
    round: number;
    startedAt: number;          // Date.now() — for timeout cleanup
    expiresAt: number;          // fight auto-expires if player never responds

    // Accumulated totals (written to UserStats at fight end)
    totalDamageDealt: number;
    totalDamageTaken: number;

    /**
     * Set once the fight has ended and its rewards have been handed out.
     *
     * Button handlers capture this object before awaiting, so two clicks can
     * both reach applyAction() holding the same fight. Removing it from the
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
