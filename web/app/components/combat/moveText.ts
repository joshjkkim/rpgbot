import type { Requirements } from "@/app/components/ui/requirementsField";

// ─── Types and defaults (mirrored from havocish/src/types/combat.ts and player/moves.ts) ───

export type MoveStat = "atk" | "def" | "spd" | "crit";

export type MoveCondition =
  | { type: "targetHasStatus"; statusId: string }
  | { type: "selfHpBelow"; percent: number }
  | { type: "targetHpBelow"; percent: number }
  | { type: "targetCharging" }
  | { type: "targetGuarding" };

export type MoveEffect = {
  target?: "self" | "target";
  chance?: number;
  when?: MoveCondition;
} & (
  | { type: "hit"; power: number; hits?: number; pierce?: number; lifesteal?: number }
  | { type: "guard"; percent: number }
  | { type: "counter"; percent?: number; stun?: boolean }
  | { type: "heal"; percent: number }
  | { type: "boost"; stat: MoveStat; percent: number; turns: number }
  | { type: "status"; statusId: string; turns: number }
  | { type: "stun" }
  | { type: "cleanse"; harmfulOnly?: boolean }
);

export type EffectType = MoveEffect["type"];

export interface MoveConfig {
  id: string;
  name: string;
  emoji: string;
  telegraph?: string;
  cooldown?: number;
  usesPerFight?: number;
  firstStrike?: boolean;
  charge?: number;
  effects: MoveEffect[];
  players?: { requirements?: Requirements; learned?: boolean };
}

export interface StatusConfig {
  id: string;
  name: string;
  emoji: string;
  hpPercentPerTurn: number;
  /** Stat changes while it's on, in %, per stack. */
  stats?: Partial<Record<MoveStat, number>>;
  /** Putting it on again adds a stack, up to this many (default 1). */
  maxStacks?: number;
}

export interface PlaceConfig {
  id: string;
  name: string;
  emoji: string;
  arrival?: string;
  channelIds: string[];
  enemies: { enemyId: string; weight?: number }[];
  fights?: "thread" | "channel";
  colour?: string;
  image?: string;
}

export interface EnemyMove {
  moveId: string;
  weight?: number;
  when?: MoveCondition;
}

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
    id: "guard", name: "Guard", emoji: "🛡️", telegraph: "raises its guard.", cooldown: 1,
    effects: [{ type: "guard", percent: 60 }, { type: "counter", percent: 30 }], players: {},
  },
};

export const DEFAULT_STATUSES: Record<string, StatusConfig> = {
  bleed: { id: "bleed", name: "Bleeding", emoji: "🩸", hpPercentPerTurn: -5 },
  poison: { id: "poison", name: "Poisoned", emoji: "🧪", hpPercentPerTurn: -4 },
  burn: { id: "burn", name: "Burning", emoji: "🔥", hpPercentPerTurn: -6 },
  regen: { id: "regen", name: "Regenerating", emoji: "💚", hpPercentPerTurn: 5 },
  wounded: { id: "wounded", name: "Wounded", emoji: "🩹", hpPercentPerTurn: 0, stats: { atk: -20, def: -20 } },
};

export const DEFAULT_ENEMY_MOVES: EnemyMove[] = [
  { moveId: "attack", weight: 3 },
  { moveId: "heavy", weight: 1 },
  { moveId: "guard", weight: 1 },
];

/** A new effect of each kind, with sensible numbers. */
export const NEW_EFFECT: Record<EffectType, MoveEffect> = {
  hit: { type: "hit", power: 1 },
  guard: { type: "guard", percent: 50 },
  counter: { type: "counter", percent: 30 },
  heal: { type: "heal", percent: 20 },
  boost: { type: "boost", stat: "atk", percent: 25, turns: 2 },
  status: { type: "status", statusId: "bleed", turns: 3 },
  stun: { type: "stun" },
  cleanse: { type: "cleanse", harmfulOnly: true },
};

export const EFFECT_LABELS: Record<EffectType, string> = {
  hit: "Hit: deal damage",
  guard: "Guard: block damage this turn",
  counter: "Counter: hit back when hit",
  heal: "Heal (or lose) HP",
  boost: "Boost: change a stat for a while",
  status: "Status: Bleeding, Poisoned…",
  stun: "Stun: lose the next action",
  cleanse: "Cleanse: remove effects",
};

export const STAT_LABEL: Record<MoveStat, string> = { atk: "ATK", def: "DEF", spd: "SPD", crit: "crit" };

// ─── Plain-language descriptions ──────────────────────────────────────────────
// The bot writes the same text (havocish/src/player/moves.ts describeMove). Change one, change the other.

const SELF_BY_DEFAULT = new Set<EffectType>(["guard", "counter", "heal", "boost", "cleanse"]);

export function effectTarget(e: MoveEffect): "self" | "target" {
  return e.target ?? (SELF_BY_DEFAULT.has(e.type) ? "self" : "target");
}

/** A status that works against whoever has it: HP loss or a lowered stat. */
export function harmful(s: StatusConfig | undefined): boolean {
  return !s || s.hpPercentPerTurn < 0 || Object.values(s.stats ?? {}).some((v) => (v ?? 0) < 0);
}

/** What a status does each turn and while it's on, for the editor. */
export function describeStatus(s: StatusConfig): string {
  const parts = [
    s.hpPercentPerTurn ? `${s.hpPercentPerTurn > 0 ? "Heals" : "Loses"} ${Math.abs(s.hpPercentPerTurn)}% of max HP each turn` : "",
    ...(Object.entries(s.stats ?? {}) as Array<[MoveStat, number]>).filter(([, v]) => v).map(([k, v]) => `${STAT_LABEL[k]} ${v > 0 ? "+" : "−"}${Math.abs(v)}%`),
  ].filter(Boolean);
  const stacks = (s.maxStacks ?? 1) > 1 ? ` Stacks up to ${s.maxStacks}, each stack adding the same again.` : "";
  return `${parts.length ? parts.join(", ") : "Does nothing yet"}.${stacks}`;
}

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

function isDrawback(e: MoveEffect, statuses: Record<string, StatusConfig>): boolean {
  const self = effectTarget(e) === "self";
  switch (e.type) {
    case "hit": case "stun": return self;
    case "heal": return self ? e.percent < 0 : e.percent > 0;
    case "boost": return self ? e.percent < 0 : e.percent > 0;
    case "status": return self === harmful(statuses[e.statusId]);
    default: return false;
  }
}

function effectText(e: MoveEffect, statuses: Record<string, StatusConfig>): string {
  const self = effectTarget(e) === "self";
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

/** A move in plain words: what it does, then its costs. */
export function describeMove(move: MoveConfig, statuses: Record<string, StatusConfig>): { does: string[]; drawbacks: string[] } {
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
