import type { GameType, GatheringActivity, GatheringCondition, GatheringLocation, TwistEffects, TwistRule } from "../types/gathering.js";
import type { GuildConfig } from "../types/guild.js";

/**
 * What makes a gathering spot play differently, not just harder: a location's
 * fixed traits, plus a condition rolled every few hours (conditionHours). Both are owner-made from
 * the same effects: general ones that work in any game (difficulty, rare loot,
 * yield, XP, energy) and rules for one game type. Nothing is themed: "storm"
 * or "pitch dark" are just what an owner calls them.
 */

/** Each rule, the game it belongs to, and how it reads when a run starts. */
export const RULES: Record<TwistRule, { game: GameType; name: string; line: string }> = {
    "grid.adjacent": { game: "grid", name: "Only next to opened", line: "You can only open tiles next to ones you've uncovered." },
    "grid.clustered": { game: "grid", name: "Clustered finds", line: "Finds come in clusters: one find means more nearby." },
    "grid.unstable": { game: "grid", name: "Unstable", line: "Hit a hazard and you lose everything, not half." },
    "timing.falseAlarm": { game: "timing", name: "False alarms", line: "Some signals are false: don't jump at the first one." },
    "timing.twice": { game: "timing", name: "Twice", line: "It takes two good reactions in a row to land one." },
    "timing.fragile": { game: "timing", name: "Fragile", line: "One miss and the run is over." },
    "find.glimpse": { game: "find", name: "Glimpse", line: "You only see it for a moment: remember where it was." },
    "find.reshuffle": { game: "find", name: "Reshuffle", line: "A wrong pick scrambles everything." },
    "find.twin": { game: "find", name: "Twin", line: "There are two to find each round." },
};

/** Everything acting on a run, combined. */
export type RunMods = {
    /** Steps harder (+) or easier (−); each game reads it its own way. */
    difficulty: number;
    /** Multiplier on rare-and-up items' share of the loot. */
    rareLoot: number;
    /** Extra items per find. */
    yield: number;
    /** Multiplier on skill XP. */
    xp: number;
    /** Extra energy a run costs. */
    energy: number;
    rules: Set<TwistRule>;
    /** Shown under the run's header: each trait and today's condition. */
    lines: string[];
};

/** Hours a condition lasts unless the owner picks otherwise. Short enough that members in every time zone see a few. */
export const DEFAULT_CONDITION_HOURS = 6;

/**
 * The current stretch of time conditions are rolled for, and when it ends.
 * Counted from midnight UTC, so everyone sees the same, and a 24-hour setting
 * changes at midnight UTC.
 */
export function conditionSlot(config: GuildConfig, now = Date.now()): { key: string; endsAt: number } {
    const ms = Math.max(1, config.gathering?.conditionHours ?? DEFAULT_CONDITION_HOURS) * 3_600_000;
    const slot = Math.floor(now / ms);
    return { key: `${ms}:${slot}`, endsAt: (slot + 1) * ms };
}

/** A steady number in [0, 1) for a string: the same day and place always roll the same. */
function hash01(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0) / 4294967296;
}

/** The condition at a location right now, or null when it's calm. Nothing is stored: it's worked out from the time. */
export function conditionNow(config: GuildConfig, activity: GatheringActivity, location: GatheringLocation, now = Date.now()): GatheringCondition | null {
    const all = config.gathering?.conditions ?? {};
    const options = (location.conditions ?? []).filter((c) => all[c.conditionId] && (c.weight ?? 1) > 0);
    if (!options.length) return null;
    const calm = Math.max(0, location.calmWeight ?? 2);
    const total = calm + options.reduce((sum, c) => sum + (c.weight ?? 1), 0);
    let r = hash01(`${conditionSlot(config, now).key}:${activity.id}:${location.id}`) * total - calm;
    if (r < 0) return null;
    for (const c of options) {
        r -= c.weight ?? 1;
        if (r < 0) return all[c.conditionId]!;
    }
    return all[options.at(-1)!.conditionId]!;
}

/** The location's traits and today's condition, combined for one run. Rules for another game are ignored. */
export function runMods(config: GuildConfig, activity: GatheringActivity, location: GatheringLocation, now = Date.now()): RunMods {
    const mods: RunMods = { difficulty: 0, rareLoot: 1, yield: 0, xp: 1, energy: 0, rules: new Set(), lines: [] };
    const apply = (e: TwistEffects | undefined) => {
        if (!e) return;
        mods.difficulty += e.difficulty ?? 0;
        mods.rareLoot *= (e.rareLoot ?? 100) / 100;
        mods.yield += e.yield ?? 0;
        mods.xp *= (e.xp ?? 100) / 100;
        mods.energy += e.energy ?? 0;
        for (const r of e.rules ?? []) if (RULES[r]?.game === activity.game) mods.rules.add(r);
    };
    // What a rule does, when the owner didn't write a line of their own.
    const ruleLines = (e: TwistEffects | undefined) => (e?.rules ?? []).filter((r) => RULES[r]?.game === activity.game).map((r) => RULES[r].line).join(" ");
    for (const t of location.traits ?? []) {
        apply(t.effects);
        mods.lines.push(`${t.emoji || "✦"} **${t.name}:** ${t.line || ruleLines(t.effects) || "—"}`);
    }
    const current = conditionNow(config, activity, location, now);
    if (current) {
        apply(current.effects);
        const ends = Math.floor(conditionSlot(config, now).endsAt / 1000);
        mods.lines.push(`${current.emoji || "🌤️"} **${current.name}** (ends <t:${ends}:R>): ${current.line || ruleLines(current.effects) || "—"}`);
    }
    mods.energy = Math.max(0, Math.round(mods.energy));
    mods.yield = Math.max(0, Math.round(mods.yield));
    return mods;
}

/** No traits, no condition: how every run played before. */
export const NO_MODS: RunMods = { difficulty: 0, rareLoot: 1, yield: 0, xp: 1, energy: 0, rules: new Set(), lines: [] };
