import type { Requirements } from "./requirements.ts";

/**
 * The fight engine: players' and enemies' moves are built from the same effect
 * blocks (MoveEffect) and played by one turn function, playTurn. The enemy's
 * next move is picked a turn ahead and shown, so each turn is a read of what's
 * coming rather than another click on Attack. Shared by the bot
 * (player/moves.ts) and the website's demo fight.
 */

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
    /**
     * Energy it spends (or, negative, builds), where a fight uses energy: the
     * website's Daily. Unset, a move neither needs nor builds any.
     */
    energy?: number;
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
    /** Energy banked. Only a fighter that has this keeps energy: unset, moves cost none. */
    energy?: number;
    /** Where an enemy with a pattern is in it. */
    patternAt?: number;
    /** Relics a fighter carries into a fight (the Daily's): % of damage dealt healed, % more damage to an afflicted target, % of damage taken sent back. */
    lifesteal?: number;
    mark?: number;
    thorns?: number;
}

/** The most energy a fighter can bank. */
export const ENERGY_MAX = 5;

export type FightOutcome = "continue" | "win" | "loss" | "flee";

// ─── A fight, as the engine sees it ──────────────────────────────────────────
// The bot's ActiveFight (types/combat.ts) has more on it; these are the parts a turn reads and writes.

export interface FightStats { maxHp: number; atk: number; def: number; spd: number; critChance: number; critMultiplier: number }

export interface FightEnemy {
    name: string; emoji: string; atk: number; def: number; spd: number; critChance: number; critMultiplier: number; moves?: EnemyMove[];
    /** Move ids it uses in this order, round and round, instead of picking by weight: a habit to learn. */
    pattern?: string[];
    /** Thick hide: this much less damage from every hit taken (never below 1). */
    armor?: number;
    /** Thorns: this % of the damage it takes goes back to whoever dealt it. */
    thorns?: number;
    /** Enrage: at this % of its HP it gains this status for the rest of the fight. */
    enrage?: { at: number; statusId: string };
}

export interface Fighter {
    userId: string;
    name: string;
    stats: FightStats;
    hp: number;
    state: FighterState;
    out?: "down" | "fled";
    dealt: number;
    taken: number;
}

export interface Fight {
    members: Fighter[];
    enemy: FightEnemy;
    enemyMaxHp: number;
    enemyCurrentHp: number;
    foe: FighterState;
    enemyIntent: string;
    enemyTarget: string;
    lastHits?: { enemy: number; members: Record<string, number> };
    round: number;
    /** Set for a fight that must roll the same way each time it's played the same way (the website's Daily). */
    seed?: number;
}

/** The part of a server's config fights read: its own moves and statuses. */
export type FightConfig = { combat?: { moves?: Record<string, MoveConfig>; statuses?: Record<string, StatusConfig> } };

/** Stops a fight that never ends (two guards forever, bad stat configs). */
export const MAX_ROUNDS = 30;

/** What servers get until they make their own. */
export const DEFAULT_MOVES: Record<string, MoveConfig> = {
    attack: {
        id: "attack", name: "Attack", emoji: "⚔️", telegraph: "gets ready to strike.",
        effects: [{ type: "hit", power: 1 }], players: {},
    },
    heavy: {
        id: "heavy", name: "Heavy Strike", emoji: "🪓", telegraph: "winds up a heavy blow…", cooldown: 2,
        effects: [{ type: "hit", power: 2.2 }, { type: "boost", stat: "def", percent: -30, turns: 1, target: "self" }],
        players: {},
    },
    guard: {
        // The cooldown stops guarding every turn: it's the answer to a heavy hit, not a stance.
        id: "guard", name: "Guard", emoji: "🛡️", telegraph: "raises its guard.", cooldown: 1,
        effects: [{ type: "guard", percent: 60 }, { type: "counter", percent: 30 }], players: {},
    },
};

export const DEFAULT_STATUSES: Record<string, StatusConfig> = {
    bleed: { id: "bleed", name: "Bleeding", emoji: "🩸", hpPercentPerTurn: -5 },
    poison: { id: "poison", name: "Poisoned", emoji: "🧪", hpPercentPerTurn: -4 },
    burn: { id: "burn", name: "Burning", emoji: "🔥", hpPercentPerTurn: -6 },
    regen: { id: "regen", name: "Regenerating", emoji: "💚", hpPercentPerTurn: 5 },
    // Left on you for a while after a loss (combat.hp.woundedMinutes); its stats apply outside fights too.
    wounded: { id: "wounded", name: "Wounded", emoji: "🩹", hpPercentPerTurn: 0, stats: { atk: -20, def: -20 } },
};

/** Enemies with no moves of their own: mostly attacks, sometimes a telegraphed heavy hit or a guard. */
const DEFAULT_ENEMY_MOVES: EnemyMove[] = [
    { moveId: "attack", weight: 3 },
    { moveId: "heavy", weight: 1 },
    { moveId: "guard", weight: 1 },
];

export function movesOf(config: FightConfig): Record<string, MoveConfig> {
    return config.combat?.moves ?? DEFAULT_MOVES;
}

export function statusesOf(config: FightConfig): Record<string, StatusConfig> {
    return config.combat?.statuses ?? DEFAULT_STATUSES;
}

/** A move by id. The built-ins stay reachable, so a deleted move never breaks a fight. */
export function moveById(config: FightConfig, id: string): MoveConfig {
    return movesOf(config)[id] ?? DEFAULT_MOVES[id] ?? DEFAULT_MOVES.attack!;
}

export function newFighterState(): FighterState {
    return { statuses: {}, boosts: [], cooldowns: {}, uses: {} };
}

// ─── Dice ─────────────────────────────────────────────────────────────────────

let rand: () => number = Math.random;

/** Runs a turn on the fight's own dice when it has a seed (mulberry32, the seed moving on with each roll), else Math.random. */
function seeded<T>(fight: Fight, run: () => T): T {
    if (fight.seed == null || rand !== Math.random) return run();
    rand = () => {
        let t = (fight.seed = (fight.seed! + 0x6d2b79f5) | 0);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    try {
        return run();
    } finally {
        rand = Math.random;
    }
}

// ─── Turn state ───────────────────────────────────────────────────────────────

export function usable(state: FighterState, move: MoveConfig): boolean {
    return (state.cooldowns[move.id] ?? 0) <= 0 &&
        (move.usesPerFight == null || (state.uses[move.id] ?? 0) < move.usesPerFight) &&
        (state.energy == null || move.energy == null || move.energy <= 0 || state.energy >= move.energy);
}

/** Stacks of a status on a fighter (0 when it isn't on). */
function stacksOf(state: FighterState, id: string): number {
    return (state.statuses[id] ?? 0) > 0 ? state.stacks?.[id] ?? 1 : 0;
}

/** A status that works against whoever has it: HP loss or a lowered stat. */
export function harmful(s: StatusConfig | undefined): boolean {
    return !s || s.hpPercentPerTurn < 0 || Object.values(s.stats ?? {}).some((v) => (v ?? 0) < 0);
}

/** A stat with the boosts and statuses on it. */
function stat(base: FightStats, state: FighterState, s: MoveStat, statuses: Record<string, StatusConfig>): number {
    const fromStatuses = Object.keys(state.statuses).reduce((sum, id) => sum + (statuses[id]?.stats?.[s] ?? 0) * stacksOf(state, id), 0);
    const pct = fromStatuses + state.boosts.filter((b) => b.stat === s).reduce((sum, b) => sum + b.percent, 0);
    const value = s === "crit" ? base.critChance : base[s];
    return Math.max(0, value * (1 + pct / 100));
}

/** One side during a turn: the fight's state plus what only lasts the turn. */
interface Side {
    name: string;
    stats: FightStats;
    st: FighterState;
    hp: number;
    maxHp: number;
    guard: number;
    counter?: { percent: number; stun: boolean };
    /** Flat damage taken off each hit, and % of damage taken sent back. */
    armor?: number;
    thorns?: number;
    /** Damage this side dealt to others this turn. */
    dealt?: number;
}

function holds(c: MoveCondition | undefined, self: Side, other: Side): boolean {
    if (!c) return true;
    switch (c.type) {
        case "targetHasStatus": return (other.st.statuses[c.statusId] ?? 0) > 0;
        case "selfHpBelow": return self.hp < self.maxHp * c.percent / 100;
        case "targetHpBelow": return other.hp < other.maxHp * c.percent / 100;
        case "targetCharging": return !!other.st.charging;
        case "targetGuarding": return other.guard > 0;
    }
}

const SELF_BY_DEFAULT = new Set<MoveEffect["type"]>(["guard", "counter", "heal", "boost", "cleanse"]);

function targetOf(e: MoveEffect, self: Side, other: Side): Side {
    const t = e.target ?? (SELF_BY_DEFAULT.has(e.type) ? "self" : "target");
    return t === "self" ? self : other;
}

function rolls(e: MoveEffect): boolean {
    return e.chance == null || e.chance >= 100 || rand() * 100 < e.chance;
}

/** Whether a side's move goes off this turn (not stunned, not still winding up). */
function goesOff(side: Side, move: MoveConfig | null): boolean {
    if (!move || side.st.stunned) return false;
    if (side.st.charging) return side.st.charging.turnsLeft <= 1;
    return !(move.charge && move.charge > 0);
}

const STAT_LABEL: Record<MoveStat, string> = { atk: "ATK", def: "DEF", spd: "SPD", crit: "crit" };

function signed(n: number): string {
    return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}

/** Plays a move's effects (guard and counter were set up before the turn). */
function fire(actor: Side, other: Side, move: MoveConfig, statuses: Record<string, StatusConfig>): string {
    if (move.cooldown) actor.st.cooldowns[move.id] = move.cooldown + 1; // the end of this turn takes one off
    // Only a fighter keeping energy (the Daily's player) spends or builds it.
    if (move.energy && actor.st.energy != null) actor.st.energy = Math.max(0, Math.min(ENERGY_MAX, actor.st.energy - move.energy));
    actor.st.uses[move.id] = (actor.st.uses[move.id] ?? 0) + 1;

    const parts: string[] = [];
    for (const e of move.effects ?? []) {
        if (e.type === "guard" || e.type === "counter") continue;
        if (actor.hp <= 0 && e.target !== "self") break;
        if (!holds(e.when, actor, other) || !rolls(e)) continue;
        const t = targetOf(e, actor, other);
        switch (e.type) {
            case "hit": {
                for (let i = 0; i < Math.max(1, e.hits ?? 1); i++) {
                    if (t.hp <= 0) break;
                    const def = stat(t.stats, t.st, "def", statuses) * (1 - Math.min(100, e.pierce ?? 0) / 100);
                    const crit = rand() * 100 < stat(actor.stats, actor.st, "crit", statuses);
                    let dmg = Math.max(1, stat(actor.stats, actor.st, "atk", statuses) - def * 0.6) * e.power;
                    if (crit) dmg *= actor.stats.critMultiplier;
                    if (t !== actor) dmg *= 1 - Math.min(100, t.guard) / 100;
                    if (t !== actor && actor.st.mark && Object.keys(t.st.statuses).some((id) => harmful(statuses[id]))) dmg *= 1 + actor.st.mark / 100;
                    if (t !== actor && t.armor) dmg = Math.max(1, dmg - t.armor);
                    const n = Math.max(0, Math.round(dmg));
                    t.hp = Math.max(0, t.hp - n);
                    if (t !== actor) actor.dealt = (actor.dealt ?? 0) + n;
                    parts.push(t.guard > 0 && t !== actor ? `**${n}** damage (blocked some)` : `**${n}** damage${crit ? " 💥 critical!" : ""}`);
                    const steal = (e.lifesteal ?? 0) + (actor.st.lifesteal ?? 0);
                    if (steal && t !== actor) {
                        const healed = Math.min(actor.maxHp - actor.hp, Math.round(n * steal / 100));
                        if (healed > 0) { actor.hp += healed; parts.push(`healed **${healed}**`); }
                    }
                    if (t.thorns && t !== actor && n > 0) {
                        // Thorns hurt but never finish anyone: dying to your own winning blow isn't a fight lost fairly.
                        const back = Math.max(1, Math.round(n * t.thorns / 100));
                        actor.hp = Math.max(Math.min(1, actor.hp), actor.hp - back);
                        t.dealt = (t.dealt ?? 0) + back;
                        parts.push(`thorns: **${back}** back`);
                    }
                    if (t.counter && t !== actor && n > 0 && t.hp > 0) {
                        const back = Math.round(n * t.counter.percent / 100);
                        if (back > 0) {
                            actor.hp = Math.max(0, actor.hp - back);
                            t.dealt = (t.dealt ?? 0) + back;
                            parts.push(`countered for **${back}**`);
                        }
                        if (t.counter.stun) { actor.st.stunned = true; delete actor.st.charging; parts.push(`${actor.name} stunned 💫`); }
                    }
                }
                break;
            }
            case "heal": {
                const amount = Math.round(t.maxHp * e.percent / 100);
                const before = t.hp;
                t.hp = amount >= 0 ? Math.min(t.maxHp, t.hp + amount) : Math.max(Math.min(1, t.hp), t.hp + amount);
                if (t.hp !== before) parts.push(`${t.name} ${t.hp > before ? "+" : "−"}${Math.abs(t.hp - before)} HP`);
                break;
            }
            case "boost":
                t.st.boosts.push({ stat: e.stat, percent: e.percent, turns: e.turns });
                parts.push(`${t.name}: ${STAT_LABEL[e.stat]} ${signed(e.percent)}%`);
                break;
            case "status": {
                const s = statuses[e.statusId];
                if (!s) break;
                const stacks = Math.min(Math.max(1, s.maxStacks ?? 1), stacksOf(t.st, s.id) + 1);
                t.st.statuses[s.id] = Math.max(t.st.statuses[s.id] ?? 0, e.turns);
                if (stacks > 1) t.st.stacks = { ...t.st.stacks, [s.id]: stacks };
                parts.push(`${s.emoji} ${t.name} ${s.name}${stacks > 1 ? ` ×${stacks}` : ""}`);
                break;
            }
            case "stun":
                parts.push(t.st.charging ? `${t.name} interrupted 💫` : `${t.name} stunned 💫`);
                t.st.stunned = true;
                delete t.st.charging;
                break;
            case "cleanse":
                for (const id of Object.keys(t.st.statuses)) {
                    if (!e.harmfulOnly || harmful(statuses[id])) {
                        delete t.st.statuses[id];
                        delete t.st.stacks?.[id];
                    }
                }
                t.st.boosts = t.st.boosts.filter((b) => b.percent > 0);
                parts.push(`${t.name} cleansed ✨`);
                break;
        }
    }
    return `${move.emoji} **${actor.name}** used **${move.name}**${parts.length ? `: ${parts.join(" · ")}` : "."}`;
}

/** Takes a side's turn: lost to a stun, spent winding up, or the move itself. */
function act(actor: Side, other: Side, move: MoveConfig | null, config: FightConfig, log: string[]): void {
    if (actor.st.stunned) {
        actor.st.stunned = false;
        log.push(`💫 **${actor.name}** is stunned and loses the turn.`);
        return;
    }
    if (actor.st.charging) {
        const c = actor.st.charging;
        c.turnsLeft -= 1;
        const charged = moveById(config, c.moveId);
        if (c.turnsLeft > 0) {
            log.push(`⏳ **${actor.name}** is still winding up **${charged.name}**…`);
            return;
        }
        delete actor.st.charging;
        log.push(fire(actor, other, charged, statusesOf(config)));
        return;
    }
    if (!move) return;
    if (move.charge && move.charge > 0) {
        actor.st.charging = { moveId: move.id, turnsLeft: move.charge };
        log.push(`⏳ **${actor.name}** starts winding up **${move.name}**${move.telegraph ? `: *${move.telegraph}*` : "…"}`);
        return;
    }
    log.push(fire(actor, other, move, statusesOf(config)));
}

/** Statuses, boosts and cooldowns count down at the end of each turn. */
function endOfTurn(side: Side, statuses: Record<string, StatusConfig>, log: string[]): void {
    for (const [id, turns] of Object.entries(side.st.statuses)) {
        const s = statuses[id];
        if (s && s.hpPercentPerTurn && side.hp > 0) {
            const raw = side.maxHp * s.hpPercentPerTurn * stacksOf(side.st, id) / 100;
            const amount = Math.sign(raw) * Math.max(1, Math.round(Math.abs(raw)));
            const before = side.hp;
            side.hp = Math.max(0, Math.min(side.maxHp, side.hp + amount));
            if (side.hp !== before) log.push(`${s.emoji} **${side.name}** ${s.name.toLowerCase()}: ${side.hp > before ? "+" : "−"}${Math.abs(side.hp - before)} HP`);
        }
        if (turns > 1) side.st.statuses[id] = turns - 1;
        else {
            delete side.st.statuses[id];
            delete side.st.stacks?.[id];
        }
    }
    side.st.boosts = side.st.boosts.map((b) => ({ ...b, turns: b.turns - 1 })).filter((b) => b.turns > 0);
    for (const [id, left] of Object.entries(side.st.cooldowns)) {
        if (left <= 1) delete side.st.cooldowns[id];
        else side.st.cooldowns[id] = left - 1;
    }
}

// ─── The enemy's choice ───────────────────────────────────────────────────────

export function enemyMoveList(enemy: FightEnemy): EnemyMove[] {
    return enemy.moves && enemy.moves.length > 0 ? enemy.moves : DEFAULT_ENEMY_MOVES;
}

/** The members still fighting. */
export function activeMembers(fight: Fight): Fighter[] {
    return fight.members.filter((m) => !m.out);
}

/** Who the enemy goes for next: one of the members still standing, at random. */
export function pickTarget(fight: Fight): string {
    const standing = activeMembers(fight);
    if (standing.some((m) => m.userId === fight.enemyTarget) && fight.foe.charging) return fight.enemyTarget;
    return standing[Math.floor(rand() * standing.length)]?.userId ?? fight.members[0]!.userId;
}

/** Picks what the enemy does next turn, by weight, among the moves it can use now, and at whom. */
export function pickIntent(fight: Fight, config: FightConfig): string {
    return seeded(fight, () => intent(fight, config));
}

function intent(fight: Fight, config: FightConfig): string {
    fight.enemyTarget = pickTarget(fight);
    if (fight.foe.charging) return fight.foe.charging.moveId;
    const foe = foeSide(fight);
    const target = memberSide(fight, fight.members.find((m) => m.userId === fight.enemyTarget)!);
    // An enemy with a pattern does the next thing in it that it can (comingNext shows the same).
    const pattern = fight.enemy.pattern;
    if (pattern?.length) {
        const next = patternNext(pattern, fight.foe.patternAt ?? 0, config, (m) => usable(fight.foe, m));
        if (next) {
            fight.foe.patternAt = next.at;
            return next.move.id;
        }
    }
    const options = enemyMoveList(fight.enemy).filter((m) =>
        usable(fight.foe, moveById(config, m.moveId)) && holds(m.when, foe, target));
    const total = options.reduce((sum, m) => sum + Math.max(0, m.weight ?? 1), 0);
    let roll = rand() * total;
    for (const m of options) {
        roll -= Math.max(0, m.weight ?? 1);
        if (roll < 0) return moveById(config, m.moveId).id;
    }
    return moveById(config, "attack").id;
}

/** The next move in a pattern from `at` that passes `ok`, skipping ones it can't use yet, and where it leaves off. */
function patternNext(pattern: string[], at: number, config: FightConfig, ok: (m: MoveConfig) => boolean): { move: MoveConfig; at: number } | null {
    for (let k = 0; k < pattern.length; k++) {
        const move = moveById(config, pattern[(at + k) % pattern.length]!);
        if (ok(move)) return { move, at: at + k + 1 };
    }
    return null;
}

/**
 * What an enemy with a pattern does on each of the `n` turns after this one: the habit, shown ahead. A wind-up
 * takes its turns before it lands, and moves cooling down are skipped, just as the enemy will.
 */
export function comingNext(fight: Fight, config: FightConfig, n: number): Array<{ move: MoveConfig; lands: boolean }> {
    const pattern = fight.enemy.pattern;
    if (!pattern?.length) return [];
    const cooldowns = { ...fight.foe.cooldowns };
    const endTurn = (fired: MoveConfig | null) => {
        for (const id of Object.keys(cooldowns)) cooldowns[id] = Math.max(0, cooldowns[id]! - 1);
        if (fired?.cooldown) cooldowns[fired.id] = fired.cooldown;
    };
    let at = fight.foe.patternAt ?? 0;
    let move = moveById(config, fight.foe.charging?.moveId ?? fight.enemyIntent);
    // Turns the current move still takes after this one.
    let left = fight.foe.charging ? fight.foe.charging.turnsLeft - 1 : move.charge ?? 0;
    endTurn(left > 0 ? null : move);
    const out: Array<{ move: MoveConfig; lands: boolean }> = [];
    while (out.length < n) {
        if (left <= 0) {
            const next = patternNext(pattern, at, config, (m) => (cooldowns[m.id] ?? 0) <= 0);
            if (!next) break;
            ({ move, at } = next);
            left = (move.charge ?? 0) + 1;
        }
        left--;
        out.push({ move, lands: left <= 0 });
        endTurn(left > 0 ? null : move);
    }
    return out;
}

/** The enemy's move that lands this turn: none while it's stunned or still winding up, or starting to. */
export function landsThisTurn(fight: Fight, config: FightConfig): MoveConfig | null {
    if (fight.foe.stunned) return null;
    if (fight.foe.charging) return fight.foe.charging.turnsLeft <= 1 ? moveById(config, fight.foe.charging.moveId) : null;
    const move = moveById(config, fight.enemyIntent);
    return move.charge ? null : move;
}

/** The line shown above the buttons: what's coming, and in a party at whom. */
export function intentLine(fight: Fight, config: FightConfig): string {
    const name = `${fight.enemy.emoji} ${fight.enemy.name}`;
    if (fight.foe.stunned) return `💫 **${name}** is stunned and will lose its turn.`;
    const move = moveById(config, fight.enemyIntent);
    const target = fight.members.length > 1 ? fight.members.find((m) => m.userId === fight.enemyTarget) : undefined;
    const at = target ? ` (at ${target.name})` : "";
    if (fight.foe.charging) {
        const left = fight.foe.charging.turnsLeft - 1;
        return left > 0
            ? `⏳ **${name}** is winding up **${move.name}**${at} (${left} more turn${left === 1 ? "" : "s"})`
            : `❗ **${name}** unleashes **${move.name}**${at} this turn!`;
    }
    const lands = move.charge ? ` · **${move.name}** lands ${move.charge === 1 ? "next turn" : `in ${move.charge} turns`}` : "";
    return `👁️ **${name}** ${move.telegraph ?? `prepares **${move.name}**.`}${at}${lands}`;
}

/** Whether `a` acts before `b`: a first-strike move beats one without, then higher SPD; ties go to `b`. */
function actsFirst(a: Side, aMove: MoveConfig | null, b: Side, bMove: MoveConfig | null, statuses: Record<string, StatusConfig>): boolean {
    if (!!aMove?.firstStrike !== !!bMove?.firstStrike) return !!aMove?.firstStrike;
    return stat(a.stats, a.st, "spd", statuses) > stat(b.stats, b.st, "spd", statuses);
}

/** Who goes first next turn, as far as the players can know before choosing: shown under the buttons. */
export function turnOrderLine(fight: Fight, config: FightConfig): string {
    const party = fight.members.length > 1;
    if (fight.foe.stunned) return party ? "You all act first" : "You act first";
    const move = moveById(config, fight.foe.charging?.moveId ?? fight.enemyIntent);
    if (move.firstStrike) return `⚡ ${fight.enemy.name} strikes first`;
    const foe = foeSide(fight);
    const faster = activeMembers(fight).filter((m) => !actsFirst(foe, move, memberSide(fight, m), null, statusesOf(config)));
    if (!party) return faster.length ? "You act first" : `⚡ ${fight.enemy.name} is faster: it acts first`;
    if (faster.length === activeMembers(fight).length) return "You all act first";
    return faster.length ? `⚡ Faster than ${fight.enemy.name}: ${faster.map((m) => m.name).join(", ")}` : `⚡ ${fight.enemy.name} is faster than all of you`;
}

/** How worrying the enemy's next move is: the fight message takes its colour from this. */
export function intentThreat(fight: Fight, config: FightConfig): "danger" | "defend" | "normal" {
    const move = landsThisTurn(fight, config);
    if (!move) return "normal";
    if (move.charge) return "danger";
    const power = move.effects.reduce((sum, e) => sum + (e.type === "hit" && e.target !== "self" ? e.power * (e.hits ?? 1) : 0), 0);
    if (power >= 1.5) return "danger";
    return move.effects.some((e) => e.type === "guard" || e.type === "counter") ? "defend" : "normal";
}

function foeSide(fight: Fight): Side {
    const e = fight.enemy;
    const stats: FightStats = { maxHp: fight.enemyMaxHp, atk: e.atk, def: e.def, spd: e.spd, critChance: e.critChance, critMultiplier: e.critMultiplier };
    return { name: e.name, stats, st: fight.foe, hp: fight.enemyCurrentHp, maxHp: fight.enemyMaxHp, guard: 0, ...(e.armor && { armor: e.armor }), ...(e.thorns && { thorns: e.thorns }) };
}

/** A member as a side. Alone they're "You"; in a party, their name. */
function memberSide(fight: Fight, m: Fighter): Side {
    return { name: fight.members.length > 1 ? m.name : "You", stats: m.stats, st: m.state, hp: m.hp, maxHp: m.stats.maxHp, guard: 0, ...(m.state.thorns && { thorns: m.state.thorns }) };
}

// ─── One turn ─────────────────────────────────────────────────────────────────

/** What a player does: a move, a drink, or nothing (stunned, winding up, a failed flee). */
export type PlayerChoice =
    | { kind: "move"; moveId: string }
    | { kind: "potion"; heal: number; name: string; emoji: string }
    | { kind: "pass" };

export interface TurnResult {
    outcome: FightOutcome;
    enemyHpDelta: number;
    log: string[];
}

/**
 * Plays one turn for every member still in: guards and counters go up first,
 * then everyone acts in order (first strike, then speed, members winning ties),
 * the enemy at its target, then statuses tick. A member on 0 HP is knocked
 * out; the fight is lost when nobody is left. Mutates the fight and picks the
 * enemy's next move.
 */
export function playTurn(fight: Fight, choices: Record<string, PlayerChoice>, config: FightConfig): TurnResult {
    return seeded(fight, () => turn(fight, choices, config));
}

function turn(fight: Fight, choices: Record<string, PlayerChoice>, config: FightConfig): TurnResult {
    const statuses = statusesOf(config);
    const log: string[] = [];
    const foe = foeSide(fight);
    const players = activeMembers(fight).map((m) => {
        const choice = choices[m.userId] ?? { kind: "pass" as const };
        const side = memberSide(fight, m);
        const chosen = choice.kind === "move" ? moveById(config, choice.moveId) : null;
        const firing = m.state.charging ? moveById(config, m.state.charging.moveId) : chosen;
        return { m, side, choice, chosen, firing, hpBefore: m.hp };
    });
    const foeMove = moveById(config, fight.foe.charging?.moveId ?? fight.enemyIntent);
    const target = () => {
        const aimed = players.find((p) => p.m.userId === fight.enemyTarget && p.side.hp > 0);
        if (aimed) return aimed;
        const standing = players.filter((p) => p.side.hp > 0);
        return standing[Math.floor(rand() * standing.length)];
    };

    // Guard and counter cover the whole turn, so they're up before anyone swings.
    const firstTarget = target();
    for (const [side, other, move] of [
        ...players.map((p) => [p.side, foe, p.firing] as const),
        ...(firstTarget ? [[foe, firstTarget.side, foeMove] as const] : []),
    ]) {
        if (!goesOff(side, move)) continue;
        for (const e of move!.effects ?? []) {
            if ((e.type !== "guard" && e.type !== "counter") || !holds(e.when, side, other) || !rolls(e)) continue;
            if (e.type === "guard") side.guard = Math.min(100, side.guard + e.percent);
            else side.counter = { percent: (side.counter?.percent ?? 0) + (e.percent ?? 0), stun: !!(side.counter?.stun || e.stun) };
        }
    }

    type Actor = { side: Side; move: MoveConfig | null; foe: boolean; run: () => void };
    const actors: Actor[] = [
        ...players.map((p): Actor => ({
            side: p.side, move: p.firing, foe: false,
            run: () => {
                if (p.choice.kind === "potion" && !p.side.st.stunned && !p.side.st.charging) {
                    const healed = Math.min(p.choice.heal, p.side.maxHp - p.side.hp);
                    p.side.hp += healed;
                    log.push(`${p.choice.emoji} **${p.side.name}** drank **${p.choice.name}**: +${healed} HP`);
                } else {
                    act(p.side, foe, p.chosen, config, log);
                }
            },
        })),
        {
            side: foe, move: foeMove, foe: true,
            run: () => {
                const t = target();
                if (t) act(foe, t.side, foeMove, config, log);
            },
        },
    ];
    // Members the enemy doesn't beat go first in join order, then the enemy, then the rest.
    // (A sort comparator can't do this: with mixed speeds it isn't a consistent order.)
    const [enemyActor, ...memberActors] = [actors[actors.length - 1]!, ...actors.slice(0, -1)];
    const beaten = (m: Actor) => !fight.foe.stunned && actsFirst(enemyActor.side, enemyActor.move, m.side, m.move, statuses);
    const order = [...memberActors.filter((m) => !beaten(m)), enemyActor, ...memberActors.filter(beaten)];
    for (const actor of order) {
        if (foe.hp <= 0 || players.every((p) => p.side.hp <= 0)) break;
        if (actor.side.hp <= 0) continue;
        actor.run();
    }

    // Enrage: past its threshold, it gets angrier for the rest of the fight.
    const rage = fight.enemy.enrage;
    if (rage && foe.hp > 0 && foe.hp <= foe.maxHp * rage.at / 100 && !foe.st.statuses[rage.statusId]) {
        foe.st.statuses[rage.statusId] = 999;
        log.push(`💢 **${foe.name}** is enraged!`);
    }

    if (foe.hp > 0 && players.some((p) => p.side.hp > 0)) {
        for (const p of players) if (p.side.hp > 0) endOfTurn(p.side, statuses, log);
        endOfTurn(foe, statuses, log);
    }

    const enemyHpDelta = foe.hp - fight.enemyCurrentHp;
    fight.enemyCurrentHp = foe.hp;
    for (const p of players) {
        p.m.hp = p.side.hp;
        p.m.taken += Math.max(0, p.hpBefore - p.side.hp);
        if (p.m.hp <= 0) {
            p.m.out = "down";
            if (fight.members.length > 1 && foe.hp > 0) log.push(`💀 **${p.m.name}** is knocked out.`);
        }
    }
    for (const p of players) p.m.dealt += p.side.dealt ?? 0;
    fight.lastHits = {
        enemy: Math.max(0, -enemyHpDelta),
        members: Object.fromEntries(players.map((p) => [p.m.userId, Math.max(0, p.hpBefore - p.m.hp)])),
    };

    const outcome: FightOutcome =
        foe.hp <= 0 ? "win" :
        activeMembers(fight).length === 0 ? "loss" :
        fight.round + 1 >= MAX_ROUNDS ? "flee" : "continue";
    if (outcome === "flee") log.push("⏱️ The fight dragged on too long — you escaped exhausted.");
    if (outcome === "continue") fight.enemyIntent = pickIntent(fight, config);
    return { outcome, enemyHpDelta, log };
}

// ─── Plain-language descriptions ──────────────────────────────────────────────
// The dashboard writes the same text (web/app/components/combat/moveText.ts). Change one, change the other.

function conditionText(c: MoveCondition, statuses: Record<string, StatusConfig>): string {
    switch (c.type) {
        case "targetHasStatus": return `if the target is ${statuses[c.statusId]?.name ?? c.statusId}`;
        case "selfHpBelow": return `if your HP is below ${c.percent}%`;
        case "targetHpBelow": return `if the target's HP is below ${c.percent}%`;
        case "targetCharging": return "if the target is winding up";
        case "targetGuarding": return "if the target is guarding";
    }
}

function turnsText(n: number): string {
    return n === 1 ? "this turn" : `for ${n} turns`;
}

/** A status that does its holder some good: HP back or a raised stat. */
function helpful(s: StatusConfig | undefined): boolean {
    return !!s && (s.hpPercentPerTurn > 0 || Object.values(s.stats ?? {}).some((v) => (v ?? 0) > 0));
}

/** Whether an effect works against the one using it: the drawbacks, listed apart. */
function isDrawback(e: MoveEffect, statuses: Record<string, StatusConfig>): boolean {
    const self = (e.target ?? (SELF_BY_DEFAULT.has(e.type) ? "self" : "target")) === "self";
    switch (e.type) {
        case "hit": case "stun": return self;
        case "heal": return self ? e.percent < 0 : e.percent > 0;
        case "boost": return self ? e.percent < 0 : e.percent > 0;
        // Mixed ones (Enraged: ATK up, DEF down) are taken for their upside; the text says the cost.
        case "status": return self ? !helpful(statuses[e.statusId]) : !harmful(statuses[e.statusId]);
        default: return false;
    }
}

/** What a status does while it's on, short: "ATK +40%, DEF −20%" or "loses 5% of max HP each turn". */
function statusEffects(s: StatusConfig): string {
    return [
        s.hpPercentPerTurn ? `${s.hpPercentPerTurn > 0 ? "heals" : "loses"} ${Math.abs(s.hpPercentPerTurn)}% of max HP each turn` : "",
        ...(Object.entries(s.stats ?? {}) as Array<[MoveStat, number]>).filter(([, v]) => v).map(([k, v]) => `${STAT_LABEL[k]} ${v > 0 ? "+" : "−"}${Math.abs(v)}%`),
    ].filter(Boolean).join(", ");
}

function effectText(e: MoveEffect, statuses: Record<string, StatusConfig>): string {
    const self = (e.target ?? (SELF_BY_DEFAULT.has(e.type) ? "self" : "target")) === "self";
    const who = self ? "you" : "the target";
    let text: string;
    switch (e.type) {
        case "hit": {
            const extras = [
                e.pierce ? `ignoring ${e.pierce}% of defense` : "",
                e.lifesteal ? `healing you for ${e.lifesteal}% of it` : "",
            ].filter(Boolean).join(", ");
            text = `${self ? "Hits you" : "Deals"} ${Math.round(e.power * 100)}% damage${(e.hits ?? 1) > 1 ? `, ${e.hits} times` : ""}${extras ? `, ${extras}` : ""}`;
            break;
        }
        case "guard": text = `Blocks ${e.percent}% of damage this turn`; break;
        case "counter": text = `When hit this turn, ${[e.percent ? `deals ${e.percent}% of the damage back` : "", e.stun ? "stuns the attacker" : ""].filter(Boolean).join(" and ")}`; break;
        case "heal": text = e.percent >= 0 ? `Heals ${who} for ${e.percent}% of max HP` : `${self ? "You lose" : "The target loses"} ${-e.percent}% of max HP`; break;
        case "boost": text = `${self ? "Your" : "The target's"} ${STAT_LABEL[e.stat]} ${e.percent >= 0 ? "rises" : "drops"} ${Math.abs(e.percent)}% ${turnsText(e.turns)}`; break;
        case "status": {
            const s = statuses[e.statusId];
            text = `${s ? `${s.emoji} ${s.name}` : e.statusId} on ${who} for ${e.turns} turn${e.turns === 1 ? "" : "s"}${s && statusEffects(s) ? ` (${statusEffects(s)})` : ""}${(s?.maxStacks ?? 1) > 1 ? `, stacking up to ${s!.maxStacks}` : ""}`;
            break;
        }
        case "stun": text = `Stuns ${who}: the next action is lost`; break;
        case "cleanse": text = `Removes ${e.harmfulOnly ? "harmful effects" : "all effects"} from ${who}`; break;
    }
    if (e.when) text += `, ${conditionText(e.when, statuses)}`;
    if (e.chance != null && e.chance < 100) text = `${e.chance}% chance: ${text[0]!.toLowerCase()}${text.slice(1)}`;
    return `${text}.`;
}

/** A move in plain words: what it does, then its costs marked ⚠️. */
export function describeMove(move: MoveConfig, config: FightConfig): { does: string[]; drawbacks: string[] } {
    const statuses = statusesOf(config);
    const does: string[] = [];
    const drawbacks: string[] = [];
    for (const e of move.effects ?? []) (isDrawback(e, statuses) ? drawbacks : does).push(effectText(e, statuses));
    const rules = [
        move.charge ? `Winds up for ${move.charge} turn${move.charge === 1 ? "" : "s"} first.` : "",
        move.firstStrike ? "Goes first." : "",
        move.energy && move.energy > 0 ? `Costs ${move.energy} energy.` : "",
        move.energy && move.energy < 0 ? `Builds ${-move.energy} energy.` : "",
        move.cooldown ? `${move.cooldown}-turn cooldown.` : "",
        move.usesPerFight ? `${move.usesPerFight} use${move.usesPerFight === 1 ? "" : "s"} per fight.` : "",
    ].filter(Boolean);
    return { does: [...does, ...rules], drawbacks };
}

// ─── Estimates ────────────────────────────────────────────────────────────────

/**
 * The damage a move would do now, before crits, chances and the other side's
 * guard: what the website's Daily shows on its buttons and for the enemy's next move.
 */
export function hitEstimate(fight: Fight, config: FightConfig, moveId: string, by: "member" | "foe"): number {
    const statuses = statusesOf(config);
    const foe = foeSide(fight);
    const member = memberSide(fight, fight.members.find((m) => m.userId === fight.enemyTarget) ?? fight.members[0]!);
    const [actor, other] = by === "foe" ? [foe, member] : [member, foe];
    let total = 0;
    for (const e of moveById(config, moveId).effects ?? []) {
        if (e.type !== "hit" || targetOf(e, actor, other) !== other || !holds(e.when, actor, other)) continue;
        const def = stat(other.stats, other.st, "def", statuses) * (1 - Math.min(100, e.pierce ?? 0) / 100);
        total += Math.max(1, stat(actor.stats, actor.st, "atk", statuses) - def * 0.6) * e.power * Math.max(1, e.hits ?? 1);
    }
    return Math.round(total);
}
