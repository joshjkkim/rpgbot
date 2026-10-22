import type {
    ActiveFight, EnemyConfig, EnemyMove, FightOutcome, FighterState,
    MoveCondition, MoveConfig, MoveEffect, MoveStat, StatusConfig,
} from "../types/combat.js";
import type { GuildConfig } from "../types/guild.js";
import type { DbUserGuildProfile } from "../types/userprofile.js";
import type { CombatStats } from "./combat.js";
import { checkRequirements, type MemberFacts } from "./requirements.js";

/**
 * Fight moves: players' and enemies' are built from the same effect blocks
 * (types/combat.ts MoveEffect) and played by one turn function, playTurn.
 * The enemy's next move is picked a turn ahead and shown, so each turn is a
 * read of what's coming rather than another click on Attack.
 */

/** Moves a player takes into a fight; one button row, with Flee. */
export const LOADOUT_SIZE = 4;

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
};

/** Enemies with no moves of their own: mostly attacks, sometimes a telegraphed heavy hit or a guard. */
const DEFAULT_ENEMY_MOVES: EnemyMove[] = [
    { moveId: "attack", weight: 3 },
    { moveId: "heavy", weight: 1 },
    { moveId: "guard", weight: 1 },
];

export function movesOf(config: GuildConfig): Record<string, MoveConfig> {
    return config.combat?.moves ?? DEFAULT_MOVES;
}

export function statusesOf(config: GuildConfig): Record<string, StatusConfig> {
    return config.combat?.statuses ?? DEFAULT_STATUSES;
}

/** A move by id. The built-ins stay reachable, so a deleted move never breaks a fight. */
export function moveById(config: GuildConfig, id: string): MoveConfig {
    return movesOf(config)[id] ?? DEFAULT_MOVES[id] ?? DEFAULT_MOVES.attack!;
}

export function newFighterState(): FighterState {
    return { statuses: {}, boosts: [], cooldowns: {}, uses: {} };
}

// ─── What a player can use ────────────────────────────────────────────────────

/** Move ids the player's equipped gear gives. */
export function gearMoves(profile: DbUserGuildProfile, config: GuildConfig): string[] {
    const items = config.shop?.items ?? {};
    return Object.values(profile.equips ?? {}).flatMap((id) => (id && items[id]?.effects?.moves) || []);
}

/** Every move this player has: from gear, or for players and unlocked (and learned, where it must be). */
export function playerMoves(profile: DbUserGuildProfile, config: GuildConfig, facts: MemberFacts): MoveConfig[] {
    const gear = new Set(gearMoves(profile, config));
    const learned = new Set(profile.user_stats?.moves?.learned ?? []);
    const all = movesOf(config);
    const have = Object.values(all).filter((m) =>
        gear.has(m.id) || (
            !!m.players &&
            (!m.players.learned || learned.has(m.id)) &&
            checkRequirements(m.players.requirements, { profile, config, facts }).ok
        ));
    return have.length > 0 ? have : [moveById(config, "attack")];
}

/** The moves taken into a fight: the picked ones still available, topped up in list order. */
export function loadoutFor(profile: DbUserGuildProfile, config: GuildConfig, facts: MemberFacts): string[] {
    const have = playerMoves(profile, config, facts).map((m) => m.id);
    const picked = (profile.user_stats?.moves?.loadout ?? []).filter((id) => have.includes(id));
    const gear = gearMoves(profile, config).filter((id) => have.includes(id));
    return [...new Set([...picked, ...gear, ...have])].slice(0, LOADOUT_SIZE);
}

// ─── Turn state ───────────────────────────────────────────────────────────────

export function usable(state: FighterState, move: MoveConfig): boolean {
    return (state.cooldowns[move.id] ?? 0) <= 0 &&
        (move.usesPerFight == null || (state.uses[move.id] ?? 0) < move.usesPerFight);
}

/** A stat with the boosts on it. */
function stat(base: CombatStats, state: FighterState, s: MoveStat): number {
    const pct = state.boosts.filter((b) => b.stat === s).reduce((sum, b) => sum + b.percent, 0);
    const value = s === "crit" ? base.critChance : base[s];
    return Math.max(0, value * (1 + pct / 100));
}

/** One side during a turn: the fight's state plus what only lasts the turn. */
interface Side {
    name: string;
    stats: CombatStats;
    st: FighterState;
    hp: number;
    maxHp: number;
    guard: number;
    counter?: { percent: number; stun: boolean };
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
    return e.chance == null || e.chance >= 100 || Math.random() * 100 < e.chance;
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
                    const def = stat(t.stats, t.st, "def") * (1 - Math.min(100, e.pierce ?? 0) / 100);
                    const crit = Math.random() * 100 < stat(actor.stats, actor.st, "crit");
                    let dmg = Math.max(1, stat(actor.stats, actor.st, "atk") - def * 0.6) * e.power;
                    if (crit) dmg *= actor.stats.critMultiplier;
                    if (t !== actor) dmg *= 1 - Math.min(100, t.guard) / 100;
                    const n = Math.max(0, Math.round(dmg));
                    t.hp = Math.max(0, t.hp - n);
                    parts.push(t.guard > 0 && t !== actor ? `**${n}** damage (blocked some)` : `**${n}** damage${crit ? " 💥 critical!" : ""}`);
                    if (e.lifesteal && t !== actor) {
                        const healed = Math.min(actor.maxHp - actor.hp, Math.round(n * e.lifesteal / 100));
                        if (healed > 0) { actor.hp += healed; parts.push(`healed **${healed}**`); }
                    }
                    if (t.counter && t !== actor && n > 0 && t.hp > 0) {
                        const back = Math.round(n * t.counter.percent / 100);
                        if (back > 0) { actor.hp = Math.max(0, actor.hp - back); parts.push(`countered for **${back}**`); }
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
                t.st.statuses[s.id] = Math.max(t.st.statuses[s.id] ?? 0, e.turns);
                parts.push(`${s.emoji} ${t.name} ${s.name}`);
                break;
            }
            case "stun":
                parts.push(t.st.charging ? `${t.name} interrupted 💫` : `${t.name} stunned 💫`);
                t.st.stunned = true;
                delete t.st.charging;
                break;
            case "cleanse":
                for (const id of Object.keys(t.st.statuses)) {
                    if (!e.harmfulOnly || (statuses[id]?.hpPercentPerTurn ?? -1) < 0) delete t.st.statuses[id];
                }
                t.st.boosts = t.st.boosts.filter((b) => b.percent > 0);
                parts.push(`${t.name} cleansed ✨`);
                break;
        }
    }
    return `${move.emoji} **${actor.name}** used **${move.name}**${parts.length ? `: ${parts.join(" · ")}` : "."}`;
}

/** Takes a side's turn: lost to a stun, spent winding up, or the move itself. */
function act(actor: Side, other: Side, move: MoveConfig | null, config: GuildConfig, log: string[]): void {
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
        if (s && side.hp > 0) {
            const raw = side.maxHp * s.hpPercentPerTurn / 100;
            const amount = Math.sign(raw) * Math.max(1, Math.round(Math.abs(raw)));
            const before = side.hp;
            side.hp = Math.max(0, Math.min(side.maxHp, side.hp + amount));
            if (side.hp !== before) log.push(`${s.emoji} **${side.name}** ${s.name.toLowerCase()}: ${side.hp > before ? "+" : "−"}${Math.abs(side.hp - before)} HP`);
        }
        if (turns <= 1) delete side.st.statuses[id];
        else side.st.statuses[id] = turns - 1;
    }
    side.st.boosts = side.st.boosts.map((b) => ({ ...b, turns: b.turns - 1 })).filter((b) => b.turns > 0);
    for (const [id, left] of Object.entries(side.st.cooldowns)) {
        if (left <= 1) delete side.st.cooldowns[id];
        else side.st.cooldowns[id] = left - 1;
    }
}

// ─── The enemy's choice ───────────────────────────────────────────────────────

export function enemyMoveList(enemy: EnemyConfig): EnemyMove[] {
    return enemy.moves && enemy.moves.length > 0 ? enemy.moves : DEFAULT_ENEMY_MOVES;
}

/** Picks what the enemy does next turn, by weight, among the moves it can use now. */
export function pickIntent(fight: ActiveFight, config: GuildConfig): string {
    if (fight.foe.charging) return fight.foe.charging.moveId;
    const [foe, you] = sides(fight);
    const options = enemyMoveList(fight.enemy).filter((m) =>
        usable(fight.foe, moveById(config, m.moveId)) && holds(m.when, foe, you));
    const total = options.reduce((sum, m) => sum + Math.max(0, m.weight ?? 1), 0);
    let roll = Math.random() * total;
    for (const m of options) {
        roll -= Math.max(0, m.weight ?? 1);
        if (roll < 0) return moveById(config, m.moveId).id;
    }
    return moveById(config, "attack").id;
}

/** The line shown above the buttons: what's coming. */
export function intentLine(fight: ActiveFight, config: GuildConfig): string {
    const name = `${fight.enemy.emoji} ${fight.enemy.name}`;
    if (fight.foe.stunned) return `💫 **${name}** is stunned and will lose its turn.`;
    const move = moveById(config, fight.enemyIntent);
    if (fight.foe.charging) {
        const left = fight.foe.charging.turnsLeft - 1;
        return left > 0
            ? `⏳ **${name}** is winding up **${move.name}** (${left} more turn${left === 1 ? "" : "s"})`
            : `❗ **${name}** unleashes **${move.name}** this turn!`;
    }
    return `👁️ **${name}** ${move.telegraph ?? `prepares **${move.name}**.`}`;
}

/** How worrying the enemy's next move is: the fight message takes its colour from this. */
export function intentThreat(fight: ActiveFight, config: GuildConfig): "danger" | "defend" | "normal" {
    if (fight.foe.stunned) return "normal";
    if (fight.foe.charging) return "danger";
    const move = moveById(config, fight.enemyIntent);
    const power = move.effects.reduce((sum, e) => sum + (e.type === "hit" && e.target !== "self" ? e.power * (e.hits ?? 1) : 0), 0);
    if (power >= 1.5) return "danger";
    return move.effects.some((e) => e.type === "guard" || e.type === "counter") ? "defend" : "normal";
}

function sides(fight: ActiveFight): [foe: Side, you: Side] {
    const e = fight.enemy;
    const foeStats: CombatStats = { maxHp: e.hp, atk: e.atk, def: e.def, spd: e.spd, critChance: e.critChance, critMultiplier: e.critMultiplier };
    return [
        { name: e.name, stats: foeStats, st: fight.foe, hp: fight.enemyCurrentHp, maxHp: e.hp, guard: 0 },
        { name: "You", stats: fight.playerStats, st: fight.player, hp: fight.playerCurrentHp, maxHp: fight.playerStats.maxHp, guard: 0 },
    ];
}

// ─── One turn ─────────────────────────────────────────────────────────────────

/** What the player does: a move, a drink, or nothing (stunned, winding up, a failed flee). */
export type PlayerChoice =
    | { kind: "move"; moveId: string }
    | { kind: "potion"; heal: number; name: string; emoji: string }
    | { kind: "pass" };

export interface TurnResult {
    outcome: FightOutcome;
    playerHpDelta: number;
    enemyHpDelta: number;
    log: string[];
}

/**
 * Plays one turn: guards and counters go up first, then both sides act (the
 * player first unless only the enemy's move strikes first), then statuses tick.
 * Mutates the fight's state and HP, and picks the enemy's next move.
 */
export function playTurn(fight: ActiveFight, choice: PlayerChoice, config: GuildConfig): TurnResult {
    const [foe, you] = sides(fight);
    const statuses = statusesOf(config);
    const log: string[] = [];

    const yourMove: MoveConfig | null = choice.kind === "move" ? moveById(config, choice.moveId) : null;
    const foeMove = moveById(config, fight.foe.charging?.moveId ?? fight.enemyIntent);
    const yourFiring = you.st.charging ? moveById(config, you.st.charging.moveId) : yourMove;

    // Guard and counter cover the whole turn, so they're up before anyone swings.
    for (const [side, other, move] of [[you, foe, yourFiring], [foe, you, foeMove]] as const) {
        if (!goesOff(side, move)) continue;
        for (const e of move!.effects ?? []) {
            if ((e.type !== "guard" && e.type !== "counter") || !holds(e.when, side, other) || !rolls(e)) continue;
            if (e.type === "guard") side.guard = Math.min(100, side.guard + e.percent);
            else side.counter = { percent: (side.counter?.percent ?? 0) + (e.percent ?? 0), stun: !!(side.counter?.stun || e.stun) };
        }
    }

    const yourTurn = () => {
        if (choice.kind === "potion" && !you.st.stunned && !you.st.charging) {
            const healed = Math.min(choice.heal, you.maxHp - you.hp);
            you.hp += healed;
            log.push(`${choice.emoji} **You** drank **${choice.name}**: +${healed} HP`);
        } else {
            act(you, foe, yourMove, config, log);
        }
    };
    const foeTurn = () => act(foe, you, foeMove, config, log);

    const foeFirst = !!foeMove.firstStrike && !yourFiring?.firstStrike && !fight.foe.stunned;
    for (const turn of foeFirst ? [foeTurn, yourTurn] : [yourTurn, foeTurn]) {
        if (you.hp <= 0 || foe.hp <= 0) break;
        turn();
    }

    if (you.hp > 0 && foe.hp > 0) {
        endOfTurn(you, statuses, log);
        endOfTurn(foe, statuses, log);
    }

    const playerHpDelta = you.hp - fight.playerCurrentHp;
    const enemyHpDelta = foe.hp - fight.enemyCurrentHp;
    fight.playerCurrentHp = you.hp;
    fight.enemyCurrentHp = foe.hp;

    const outcome: FightOutcome =
        foe.hp <= 0 ? "win" :
        you.hp <= 0 ? "loss" :
        fight.round + 1 >= MAX_ROUNDS ? "flee" : "continue";
    if (outcome === "flee") log.push("⏱️ The fight dragged on too long — you escaped exhausted.");
    if (outcome === "continue") fight.enemyIntent = pickIntent(fight, config);
    return { outcome, playerHpDelta, enemyHpDelta, log };
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

/** Whether an effect works against the one using it: the drawbacks, listed apart. */
function isDrawback(e: MoveEffect, statuses: Record<string, StatusConfig>): boolean {
    const self = (e.target ?? (SELF_BY_DEFAULT.has(e.type) ? "self" : "target")) === "self";
    switch (e.type) {
        case "hit": case "stun": return self;
        case "heal": return self ? e.percent < 0 : e.percent > 0;
        case "boost": return self ? e.percent < 0 : e.percent > 0;
        case "status": return self === ((statuses[e.statusId]?.hpPercentPerTurn ?? -1) < 0);
        default: return false;
    }
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
            text = `${s ? `${s.emoji} ${s.name}` : e.statusId} on ${who} for ${e.turns} turn${e.turns === 1 ? "" : "s"}`;
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
export function describeMove(move: MoveConfig, config: GuildConfig): { does: string[]; drawbacks: string[] } {
    const statuses = statusesOf(config);
    const does: string[] = [];
    const drawbacks: string[] = [];
    for (const e of move.effects ?? []) (isDrawback(e, statuses) ? drawbacks : does).push(effectText(e, statuses));
    const rules = [
        move.charge ? `Winds up for ${move.charge} turn${move.charge === 1 ? "" : "s"} first.` : "",
        move.firstStrike ? "Goes first." : "",
        move.cooldown ? `${move.cooldown}-turn cooldown.` : "",
        move.usesPerFight ? `${move.usesPerFight} use${move.usesPerFight === 1 ? "" : "s"} per fight.` : "",
    ].filter(Boolean);
    return { does: [...does, ...rules], drawbacks };
}
