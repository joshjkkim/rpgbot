import { combatLevel } from "./combatLevel.js";
import type { DbUserGuildProfile } from "../types/userprofile.js";
import { DEFAULT_GUILD_CONFIG, type GuildConfig } from "../types/guild.js";
import type { shopItemConfig } from "../types/economy.js";

// ─── Computed stat block ──────────────────────────────────────────────────────

export interface CombatStats {
    maxHp: number;
    atk: number;
    def: number;
    spd: number;
    critChance: number;    // 0–100 (percent)
    critMultiplier: number; // e.g. 1.5 = 150% damage
}

// ─── calculateStats ───────────────────────────────────────────────────────────
// Derives a player's full combat stats from their level, equipped items, and
// the guild's combat config. Call this any time you need stats — never store them.

export function calculateStats(
    profile: DbUserGuildProfile,
    config: GuildConfig,
    guildItems: Record<string, shopItemConfig>, // config.shop.items
): CombatStats {
    const c = config.combat;
    // Combat level sets the stats; chat level adds a smaller bonus below.
    const level = combatLevel(profile, config);

    // Base stats from level formula
    let maxHp  = (c.hpBase          ?? 100) + level * (c.hpPerLevel          ?? 10);
    let atk    = (c.attackBase       ?? 10)  + level * (c.attackPerLevel       ?? 2);
    let def    = (c.defenseBase      ?? 5)   + level * (c.defensePerLevel      ?? 1);
    let spd    = (c.speedBase        ?? 5)   + level * (c.speedPerLevel        ?? 1);
    let crit   = (c.critChanceBase   ?? 5)   + level * (c.critChancePerLevel   ?? 0.5);
    let critMul = (c.critMultiplierBase ?? 1.5) + level * (c.critMultiplierPerLevel ?? 0.05);

    const bonus = chatLevelBonus(profile, config);
    maxHp += bonus.hp;
    atk   += bonus.atk;
    def   += bonus.def;
    spd   += bonus.spd;
    crit  += bonus.crit;

    // Add bonuses from every equipped item
    const equips = profile.equips ?? {};
    for (const itemId of Object.values(equips)) {
        if (!itemId) continue;
        const itemCfg = guildItems[itemId];
        const s = itemCfg?.effects?.stats;
        if (!s) continue;
        maxHp  += s.hp   ?? 0;
        atk    += s.atk  ?? 0;
        def    += s.def  ?? 0;
        spd    += s.spd  ?? 0;
        crit   += s.crit ?? 0;
    }

    return {
        maxHp:          Math.max(1, Math.round(maxHp)),
        atk:            Math.max(1, Math.round(atk)),
        def:            Math.max(0, Math.round(def)),
        spd:            Math.max(1, Math.round(spd)),
        critChance:     Math.min(100, Math.max(0, crit)),
        critMultiplier: Math.max(1, critMul),
    };
}

// ─── chatLevelBonus ───────────────────────────────────────────────────────────
// What chat level adds to the stats, so /me can show it on its own line.

export function chatLevelBonus(profile: DbUserGuildProfile, config: GuildConfig) {
    // Without havocish's leveling there is no chat level to reward.
    const per = config.xp?.enabled === false ? {} : config.combat?.chatBonus ?? DEFAULT_GUILD_CONFIG.combat.chatBonus!;
    const level = profile.level ?? 1;
    return {
        level,
        hp:   level * (per.hp   ?? 0),
        atk:  level * (per.atk  ?? 0),
        def:  level * (per.def  ?? 0),
        spd:  level * (per.spd  ?? 0),
        crit: level * (per.crit ?? 0),
    };
}

// ─── HP over time ─────────────────────────────────────────────────────────────
// HP refills on its own: worked out from when it was last set, like gathering
// energy, so there are no timers. Losing a fight respawns you low instead of at
// 0, so a loss means a break, never being stuck.

const HP_DEFAULTS = { regenMinutes: 120, respawnPercent: 25 };

export function hpRules(config: GuildConfig) {
    return { ...HP_DEFAULTS, ...config.combat?.hp };
}

/** HP now: what was stored, plus what's come back since. Full when never set. */
export function resolveCurrentHp(profile: DbUserGuildProfile, stats: CombatStats, config: GuildConfig, now = Date.now()): number {
    const stored = profile.user_stats?.currentHp;
    const at = profile.user_stats?.hpAt;
    // Before regen, HP was stored without a time; those members start full.
    if (stored == null || stored >= stats.maxHp || !at) return stats.maxHp;
    const { regenMinutes } = hpRules(config);
    const back = regenMinutes > 0 ? Math.floor(stats.maxHp * Math.max(0, now - Date.parse(at)) / (regenMinutes * 60_000)) : 0;
    return Math.max(0, Math.min(stats.maxHp, stored + back));
}

/** Minutes until full HP, for "back to full in 40 min". 0 when full or regen is off. */
export function minutesToFull(hp: number, stats: CombatStats, config: GuildConfig): number {
    const { regenMinutes } = hpRules(config);
    return regenMinutes > 0 && hp < stats.maxHp ? Math.ceil(regenMinutes * (stats.maxHp - hp) / stats.maxHp) : 0;
}

/** HP to store, with the time regen counts from. Every write of currentHp goes through this. */
export function storeHp(hp: number, now = Date.now()): { currentHp: number; hpAt: string } {
    return { currentHp: Math.max(0, Math.round(hp)), hpAt: new Date(now).toISOString() };
}

/** Where a loss leaves you: a share of max HP (25% by default). */
export function respawnHp(stats: CombatStats, config: GuildConfig): number {
    return Math.round(stats.maxHp * hpRules(config).respawnPercent / 100);
}

// ─── formatStats ──────────────────────────────────────────────────────────────
// Utility for displaying stats in an embed field.

export function formatStats(stats: CombatStats, currentHp: number): string {
    const hpBar = buildBar(currentHp, stats.maxHp, 10);
    return [
        `❤️ **HP:** ${hpBar} ${currentHp}/${stats.maxHp}`,
        `⚔️ **ATK:** ${stats.atk}`,
        `🛡️ **DEF:** ${stats.def}`,
        `💨 **SPD:** ${stats.spd}`,
        `🎯 **Crit:** ${stats.critChance.toFixed(1)}% × ${stats.critMultiplier.toFixed(2)}`,
    ].join("\n");
}

function buildBar(current: number, max: number, length: number): string {
    const filled = Math.round((current / max) * length);
    return "[" + "█".repeat(filled) + "░".repeat(length - filled) + "]";
}
