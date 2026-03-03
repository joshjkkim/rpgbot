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
    combatType: "pve" | "pvp";  // determines which death penalty block to apply

    // Combatants
    playerStats: CombatStats;   // computed at fight start, does not change mid-fight
    playerCurrentHp: number;    // mutated each round
    enemy: EnemyConfig;
    enemyCurrentHp: number;     // mutated each round

    // Bookkeeping
    round: number;
    startedAt: number;          // Date.now() — for timeout cleanup
    expiresAt: number;          // fight auto-expires if player never responds

    // Accumulated totals (written to UserStats at fight end)
    totalDamageDealt: number;
    totalDamageTaken: number;
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
