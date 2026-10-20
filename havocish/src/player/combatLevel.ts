import type { GuildConfig } from "../types/guild.js";
import type { DbUserGuildProfile } from "../types/userprofile.js";
import { calculateLevelFromXp, calculateTotalXpForLevel } from "../leveling/levels.js";

/**
 * Combat is the RPG's own level, kept apart from chat level: fights, bosses,
 * quests and RPG items pay Combat XP, and stats, enemy matching and gear read
 * Combat level. It uses the server's level curve and cap, so enemy rewards and
 * level ranges keep their meaning.
 *
 * Carry-over: a member with no Combat XP yet starts from their chat XP, so
 * nobody got weaker when combat split off. It's read lazily and fixed in
 * place the first time Combat XP is written.
 */

export function combatXp(p: DbUserGuildProfile): number {
    return p.user_stats?.combat?.xp ?? Number(p.xp ?? 0);
}

export function combatLevel(p: DbUserGuildProfile, config: GuildConfig): number {
    return calculateLevelFromXp(combatXp(p), config);
}

/** Level, and XP into it out of what it takes, for progress bars. `span` is 0 at the cap. */
export function combatProgress(p: DbUserGuildProfile, config: GuildConfig) {
    const xp = combatXp(p);
    const level = calculateLevelFromXp(xp, config);
    if (config.levels.maxLevel != null && level >= config.levels.maxLevel) return { level, into: 0, span: 0 };
    const from = calculateTotalXpForLevel(level, config);
    const to = calculateTotalXpForLevel(level + 1, config);
    return { level, into: Math.max(0, xp - from), span: Math.max(1, to - from) };
}

/**
 * Adds (or, negative, removes) Combat XP on the profile in place, never below 0.
 * Callers commit `user_stats`. Returns the level before and after.
 */
export function addCombatXp(p: DbUserGuildProfile, config: GuildConfig, amount: number) {
    const before = combatLevel(p, config);
    const xp = Math.max(0, combatXp(p) + Math.round(amount));
    p.user_stats = { ...(p.user_stats ?? {}), combat: { xp } } as typeof p.user_stats;
    return { before, after: calculateLevelFromXp(xp, config) };
}
