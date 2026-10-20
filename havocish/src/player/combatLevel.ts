import type { GuildConfig } from "../types/guild.js";
import type { DbUserGuildProfile } from "../types/userprofile.js";
import { calculateLevelFromXp, calculateTotalXpForLevel } from "../leveling/levels.js";
import { query } from "../db/index.js";
import { DEFAULT_GUILD_CONFIG } from "../types/guild.js";

/**
 * Combat is the RPG's own level, kept apart from chat level: fights, bosses,
 * quests and RPG items pay Combat XP, and stats, enemy matching and gear read
 * Combat level. It has its own curve and cap (config.combat.curve, 1-99 by
 * default), so it moves at a fighting pace, not a chatting one.
 */

const DEFAULT_CURVE = DEFAULT_GUILD_CONFIG.combat.curve!;

// The chat level code handles every curve type; it only reads `levels`.
const asLevels = (config: GuildConfig) => {
    const { maxLevel, curveType, curveParams } = config.combat?.curve ?? DEFAULT_CURVE;
    return { levels: { maxLevel, curveType, curveParams, xpOverrides: {} } } as unknown as GuildConfig;
};

/** Combat XP. Missing means none yet: new members start at Combat 1. */
export function combatXp(p: DbUserGuildProfile): number {
    return p.user_stats?.combat?.xp ?? 0;
}

export function combatLevel(p: DbUserGuildProfile, config: GuildConfig): number {
    return calculateLevelFromXp(combatXp(p), asLevels(config));
}

/** Level, and XP into it out of what it takes, for progress bars. `span` is 0 at the cap. */
export function combatProgress(p: DbUserGuildProfile, config: GuildConfig) {
    const xp = combatXp(p);
    const curve = asLevels(config);
    const level = calculateLevelFromXp(xp, curve);
    if (level >= (config.combat?.curve ?? DEFAULT_CURVE).maxLevel) return { level, into: 0, span: 0 };
    const from = calculateTotalXpForLevel(level, curve);
    const to = calculateTotalXpForLevel(level + 1, curve);
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
    return { before, after: calculateLevelFromXp(xp, asLevels(config)) };
}

/**
 * The one-time split of Combat from chat level. Every profile made before the
 * split starts at the Combat level matching its chat level (capped at 99),
 * at the start of that level on the default Combat curve; new profiles are
 * created with Combat XP 0, so only pre-split rows ever lack it. Runs at
 * startup, before the bot logs in: the old process has flushed its cache and
 * this one hasn't cached anything, so nothing can overwrite the result. A
 * no-op after the first run.
 */
export async function convertLegacyCombat(): Promise<number> {
    const { curveParams: { factor, degree } } = DEFAULT_CURVE;
    const res = await query(
        `UPDATE user_guild_profiles
         SET user_stats = jsonb_set(COALESCE(user_stats, '{}'::jsonb), '{combat}',
             jsonb_build_object('xp', floor($1::float8 * power(GREATEST(LEAST(level, $3) - 1, 0), $2::float8))::bigint))
         WHERE user_stats IS NULL OR NOT (user_stats ? 'combat')`,
        [factor, degree, DEFAULT_CURVE.maxLevel],
    );
    return res.rowCount ?? 0;
}
