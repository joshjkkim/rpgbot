import type {
    ActiveFight, EnemyConfig, EnemyMove, FightMember, FightOutcome, FighterState,
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

/**
 * Whether a move scroll has anything to teach: "missing" when the move is gone
 * or isn't for players, "known" when already learned or it needs no learning.
 */
export function moveToLearn(profile: DbUserGuildProfile, config: GuildConfig, moveId: string): { status: "missing" | "known" | "new"; move?: MoveConfig } {
    const move = movesOf(config)[moveId];
    if (!move?.players) return { status: "missing" };
    const learned = profile.user_stats?.moves?.learned ?? [];
    return { status: !move.players.learned || learned.includes(moveId) ? "known" : "new", move };
}

/** Adds a move to the learned list in place; callers commit user_stats. */
export function learnMove(profile: DbUserGuildProfile, moveId: string): void {
    const stats = profile.user_stats ?? ({} as NonNullable<DbUserGuildProfile["user_stats"]>);
    const learned = [...new Set([...(stats.moves?.learned ?? []), moveId])];
    profile.user_stats = { ...stats, moves: { ...stats.moves, learned } };
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

/** Stacks of a status on a fighter (0 when it isn't on). */
function stacksOf(state: FighterState, id: string): number {
    return (state.statuses[id] ?? 0) > 0 ? state.stacks?.[id] ?? 1 : 0;
}

/** A status that works against whoever has it: HP loss or a lowered stat. */
export function harmful(s: StatusConfig | undefined): boolean {
    return !s || s.hpPercentPerTurn < 0 || Object.values(s.stats ?? {}).some((v) => (v ?? 0) < 0);
}

/** A stat with the boosts and statuses on it. */
function stat(base: CombatStats, state: FighterState, s: MoveStat, statuses: Record<string, StatusConfig>): number {
    const fromStatuses = Object.keys(state.statuses).reduce((sum, id) => sum + (statuses[id]?.stats?.[s] ?? 0) * stacksOf(state, id), 0);
    const pct = fromStatuses + state.boosts.filter((b) => b.stat === s).reduce((sum, b) => sum + b.percent, 0);
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
                    const def = stat(t.stats, t.st, "def", statuses) * (1 - Math.min(100, e.pierce ?? 0) / 100);
                    const crit = Math.random() * 100 < stat(actor.stats, actor.st, "crit", statuses);
                    let dmg = Math.max(1, stat(actor.stats, actor.st, "atk", statuses) - def * 0.6) * e.power;
                    if (crit) dmg *= actor.stats.critMultiplier;
                    if (t !== actor) dmg *= 1 - Math.min(100, t.guard) / 100;
                    const n = Math.max(0, Math.round(dmg));
                    t.hp = Math.max(0, t.hp - n);
                    if (t !== actor) actor.dealt = (actor.dealt ?? 0) + n;
                    parts.push(t.guard > 0 && t !== actor ? `**${n}** damage (blocked some)` : `**${n}** damage${crit ? " 💥 critical!" : ""}`);
                    if (e.lifesteal && t !== actor) {
                        const healed = Math.min(actor.maxHp - actor.hp, Math.round(n * e.lifesteal / 100));
                        if (healed > 0) { actor.hp += healed; parts.push(`healed **${healed}**`); }
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

export function enemyMoveList(enemy: EnemyConfig): EnemyMove[] {
    return enemy.moves && enemy.moves.length > 0 ? enemy.moves : DEFAULT_ENEMY_MOVES;
}

/** The members still fighting. */
export function activeMembers(fight: ActiveFight): FightMember[] {
    return fight.members.filter((m) => !m.out);
}

/** Who the enemy goes for next: one of the members still standing, at random. */
export function pickTarget(fight: ActiveFight): string {
    const standing = activeMembers(fight);
    if (standing.some((m) => m.userId === fight.enemyTarget) && fight.foe.charging) return fight.enemyTarget;
    return standing[Math.floor(Math.random() * standing.length)]?.userId ?? fight.members[0]!.userId;
}

/** Picks what the enemy does next turn, by weight, among the moves it can use now, and at whom. */
export function pickIntent(fight: ActiveFight, config: GuildConfig): string {
    fight.enemyTarget = pickTarget(fight);
    if (fight.foe.charging) return fight.foe.charging.moveId;
    const foe = foeSide(fight);
    const target = memberSide(fight, fight.members.find((m) => m.userId === fight.enemyTarget)!);
    const options = enemyMoveList(fight.enemy).filter((m) =>
        usable(fight.foe, moveById(config, m.moveId)) && holds(m.when, foe, target));
    const total = options.reduce((sum, m) => sum + Math.max(0, m.weight ?? 1), 0);
    let roll = Math.random() * total;
    for (const m of options) {
        roll -= Math.max(0, m.weight ?? 1);
        if (roll < 0) return moveById(config, m.moveId).id;
    }
    return moveById(config, "attack").id;
}

/** The line shown above the buttons: what's coming, and in a party at whom. */
export function intentLine(fight: ActiveFight, config: GuildConfig): string {
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
    return `👁️ **${name}** ${move.telegraph ?? `prepares **${move.name}**.`}${at}`;
}

/** Whether `a` acts before `b`: a first-strike move beats one without, then higher SPD; ties go to `b`. */
function actsFirst(a: Side, aMove: MoveConfig | null, b: Side, bMove: MoveConfig | null, statuses: Record<string, StatusConfig>): boolean {
    if (!!aMove?.firstStrike !== !!bMove?.firstStrike) return !!aMove?.firstStrike;
    return stat(a.stats, a.st, "spd", statuses) > stat(b.stats, b.st, "spd", statuses);
}

/** Who goes first next turn, as far as the players can know before choosing: shown under the buttons. */
export function turnOrderLine(fight: ActiveFight, config: GuildConfig): string {
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
export function intentThreat(fight: ActiveFight, config: GuildConfig): "danger" | "defend" | "normal" {
    if (fight.foe.stunned) return "normal";
    if (fight.foe.charging) return "danger";
    const move = moveById(config, fight.enemyIntent);
    const power = move.effects.reduce((sum, e) => sum + (e.type === "hit" && e.target !== "self" ? e.power * (e.hits ?? 1) : 0), 0);
    if (power >= 1.5) return "danger";
    return move.effects.some((e) => e.type === "guard" || e.type === "counter") ? "defend" : "normal";
}

function foeSide(fight: ActiveFight): Side {
    const e = fight.enemy;
    const stats: CombatStats = { maxHp: fight.enemyMaxHp, atk: e.atk, def: e.def, spd: e.spd, critChance: e.critChance, critMultiplier: e.critMultiplier };
    return { name: e.name, stats, st: fight.foe, hp: fight.enemyCurrentHp, maxHp: fight.enemyMaxHp, guard: 0 };
}

/** A member as a side. Alone they're "You"; in a party, their name. */
function memberSide(fight: ActiveFight, m: FightMember): Side {
    return { name: fight.members.length > 1 ? m.name : "You", stats: m.stats, st: m.state, hp: m.hp, maxHp: m.stats.maxHp, guard: 0 };
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
export function playTurn(fight: ActiveFight, choices: Record<string, PlayerChoice>, config: GuildConfig): TurnResult {
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
        return standing[Math.floor(Math.random() * standing.length)];
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
    // Stable sort: members keep join order among themselves; the enemy moves ahead only when it beats them.
    const order = [...actors].sort((a, b) => {
        if (a.foe === b.foe) return 0;
        const [enemy, member] = a.foe ? [a, b] : [b, a];
        const enemyFirst = !fight.foe.stunned && actsFirst(enemy.side, enemy.move, member.side, member.move, statuses);
        return (a.foe ? 1 : -1) * (enemyFirst ? -1 : 1);
    });
    for (const actor of order) {
        if (foe.hp <= 0 || players.every((p) => p.side.hp <= 0)) break;
        if (actor.side.hp <= 0) continue;
        actor.run();
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

/** Whether an effect works against the one using it: the drawbacks, listed apart. */
function isDrawback(e: MoveEffect, statuses: Record<string, StatusConfig>): boolean {
    const self = (e.target ?? (SELF_BY_DEFAULT.has(e.type) ? "self" : "target")) === "self";
    switch (e.type) {
        case "hit": case "stun": return self;
        case "heal": return self ? e.percent < 0 : e.percent > 0;
        case "boost": return self ? e.percent < 0 : e.percent > 0;
        case "status": return self === harmful(statuses[e.statusId]);
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
            text = `${s ? `${s.emoji} ${s.name}` : e.statusId} on ${who} for ${e.turns} turn${e.turns === 1 ? "" : "s"}${(s?.maxStacks ?? 1) > 1 ? `, stacking up to ${s!.maxStacks}` : ""}`;
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
