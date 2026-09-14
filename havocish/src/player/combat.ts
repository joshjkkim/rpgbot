import type { DbUserGuildProfile } from "../types/userprofile.js";
import type { GuildConfig } from "../types/guild.js";
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
    const level = profile.level ?? 1;

    // Base stats from level formula
    let maxHp  = (c.hpBase          ?? 100) + level * (c.hpPerLevel          ?? 10);
    let atk    = (c.attackBase       ?? 10)  + level * (c.attackPerLevel       ?? 2);
    let def    = (c.defenseBase      ?? 5)   + level * (c.defensePerLevel      ?? 1);
    let spd    = (c.speedBase        ?? 5)   + level * (c.speedPerLevel        ?? 1);
    let crit   = (c.critChanceBase   ?? 5)   + level * (c.critChancePerLevel   ?? 0.5);
    let critMul = (c.critMultiplierBase ?? 1.5) + level * (c.critMultiplierPerLevel ?? 0.05);

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

// ─── resolveCurrentHp ─────────────────────────────────────────────────────────
// Returns current HP, defaulting to full if never set (null/undefined).

export function resolveCurrentHp(profile: DbUserGuildProfile, stats: CombatStats): number {
    const stored = profile.user_stats?.currentHp;
    if (stored == null || stored > stats.maxHp) return stats.maxHp;
    return Math.max(0, stored);
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
