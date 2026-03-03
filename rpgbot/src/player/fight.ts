import type { GuildConfig } from "../types/guild.js";
import type { DbGuild } from "../types/guild.js";
import type { DbUserGuildProfile, item } from "../types/userprofile.js";
import type {
    ActiveFight,
    CombatAction,
    CombatActionResult,
    EnemyConfig,
    FightContext,
    FightEndSummary,
    FightOutcome,
} from "../types/combat.js";
import { calculateStats, resolveCurrentHp } from "./combat.js";
import { getOrCreateProfile } from "../cache/profileService.js";
import { profileKey, userGuildProfileCache } from "../cache/caches.js";
import type { PendingProfileChanges } from "../types/cache.js";
import { calculateLevelFromXp } from "../leveling/levels.js";

/** A fight expires (auto-fled) if the player doesn't act within this many ms. */
const FIGHT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** Max rounds before the fight ends in a draw (prevents infinite loops with bad stat configs). */
const MAX_ROUNDS = 30;

// ─── Active fight store ────────────────────────────────────────────────────────
// Keyed by `${discordUserId}-${discordGuildId}`

const activeFights = new Map<string, ActiveFight>();

export function fightKey(discordUserId: string, discordGuildId: string) {
    return `${discordUserId}-${discordGuildId}`;
}

export function getActiveFight(discordUserId: string, discordGuildId: string): ActiveFight | null {
    return activeFights.get(fightKey(discordUserId, discordGuildId)) ?? null;
}

export function getFightByMessageId(messageId: string): ActiveFight | null {
    for (const fight of activeFights.values()) {
        if (fight.messageId === messageId) return fight;
    }
    return null;
}

export function setActiveFight(fight: ActiveFight) {
    activeFights.set(fightKey(fight.userId, fight.guildId), fight);
}

export function clearActiveFight(discordUserId: string, discordGuildId: string) {
    activeFights.delete(fightKey(discordUserId, discordGuildId));
}

// ─── Damage formula ────────────────────────────────────────────────────────────

/**
 * Resolves one attack hit.
 * Returns { damage, isCrit }.
 * Defense reduces damage but never below 1.
 */
export function resolveHit(
    atk: number,
    def: number,
    critChance: number,   // 0-100
    critMultiplier: number,
): { damage: number; isCrit: boolean } {
    const isCrit = Math.random() * 100 < critChance;
    const raw = Math.max(1, atk - def * 0.6);
    const damage = Math.round(isCrit ? raw * critMultiplier : raw);
    return { damage, isCrit };
}

// ─── Action registry ───────────────────────────────────────────────────────────
// Add new CombatAction objects here as the system grows.
// The /fight button handler looks actions up by id.

export const COMBAT_ACTIONS: Record<string, CombatAction> = {

    basic_attack: {
        id: "basic_attack",
        label: "Attack",
        emoji: "⚔️",
        style: "primary",
        execute(ctx): CombatActionResult {
            const { fight } = ctx;
            const log: string[] = [];

            // Player hits enemy
            const playerHit = resolveHit(
                fight.playerStats.atk,
                fight.enemy.def,
                fight.playerStats.critChance,
                fight.playerStats.critMultiplier,
            );
            const enemyHpDelta = -playerHit.damage;
            log.push(
                playerHit.isCrit
                    ? `💥 **Critical hit!** You dealt **${playerHit.damage}** damage to ${fight.enemy.emoji} ${fight.enemy.name}!`
                    : `⚔️ You dealt **${playerHit.damage}** damage to ${fight.enemy.emoji} ${fight.enemy.name}.`,
            );

            // Check if enemy is dead before it counter-attacks
            const enemyHpAfter = fight.enemyCurrentHp + enemyHpDelta;
            if (enemyHpAfter <= 0) {
                return { outcome: "win", playerHpDelta: 0, enemyHpDelta, log };
            }

            // Enemy counter-attacks (speed already determined order at fight start;
            // here we always let the enemy hit back in the same round)
            const enemyHit = resolveHit(
                fight.enemy.atk,
                fight.playerStats.def,
                fight.enemy.critChance,
                fight.enemy.critMultiplier,
            );
            const playerHpDelta = -enemyHit.damage;
            log.push(
                enemyHit.isCrit
                    ? `💥 **${fight.enemy.emoji} ${fight.enemy.name} landed a critical hit!** You took **${enemyHit.damage}** damage!`
                    : `🗡️ ${fight.enemy.emoji} ${fight.enemy.name} hit you for **${enemyHit.damage}** damage.`,
            );

            const playerHpAfter = fight.playerCurrentHp + playerHpDelta;
            if (playerHpAfter <= 0) {
                return { outcome: "loss", playerHpDelta, enemyHpDelta, log };
            }

            const outcome: FightOutcome =
                fight.round + 1 >= MAX_ROUNDS ? "flee" : "continue";
            if (outcome === "flee") {
                log.push(`⏱️ The fight dragged on too long — you escaped exhausted.`);
            }

            return { outcome, playerHpDelta, enemyHpDelta, log };
        },
    },

    flee: {
        id: "flee",
        label: "Flee",
        emoji: "🏃",
        style: "secondary",
        execute(ctx): CombatActionResult {
            const { fight } = ctx;
            // Speed-based flee: player flees if their speed >= enemy speed,
            // otherwise 50% chance. Fast enemies are harder to escape.
            const succeeds =
                fight.playerStats.spd >= fight.enemy.spd
                    ? true
                    : Math.random() < 0.5;

            if (succeeds) {
                return {
                    outcome: "flee",
                    playerHpDelta: 0,
                    enemyHpDelta: 0,
                    log: [`🏃 You successfully fled from ${fight.enemy.emoji} ${fight.enemy.name}!`],
                };
            }

            // Failed flee — enemy gets a free hit
            const hit = resolveHit(
                fight.enemy.atk,
                fight.playerStats.def,
                fight.enemy.critChance,
                fight.enemy.critMultiplier,
            );
            const playerHpAfter = fight.playerCurrentHp - hit.damage;
            return {
                outcome: playerHpAfter <= 0 ? "loss" : "continue",
                playerHpDelta: -hit.damage,
                enemyHpDelta: 0,
                log: [
                    `🚫 You failed to flee! ${fight.enemy.emoji} ${fight.enemy.name} hit you for **${hit.damage}** damage.`,
                ],
            };
        },
    },
};

/** Returns the action buttons available to the player right now. */
export function getAvailableActions(ctx: FightContext): CombatAction[] {
    return Object.values(COMBAT_ACTIONS).filter(
        (a) => !a.available || a.available(ctx),
    );
}

// ─── Start fight ───────────────────────────────────────────────────────────────

export interface StartFightOptions {
    discordUserId: string;
    discordGuildId: string;
    messageId: string;
    channelId: string;
    combatType: "pve" | "pvp";
    profile: DbUserGuildProfile;
    enemy: EnemyConfig;
    config: GuildConfig;
}

export function startFight(opts: StartFightOptions): ActiveFight {
    const playerStats = calculateStats(
        opts.profile,
        opts.config,
        opts.config.shop?.items ?? {},
    );
    const playerCurrentHp = resolveCurrentHp(opts.profile, playerStats);
    const now = Date.now();

    const fight: ActiveFight = {
        userId: opts.discordUserId,
        guildId: opts.discordGuildId,
        messageId: opts.messageId,
        channelId: opts.channelId,
        combatType: opts.combatType,
        playerStats,
        playerCurrentHp,
        enemy: opts.enemy,
        enemyCurrentHp: opts.enemy.hp,
        round: 0,
        startedAt: now,
        expiresAt: now + FIGHT_TIMEOUT_MS,
        totalDamageDealt: 0,
        totalDamageTaken: 0,
    };

    setActiveFight(fight);
    return fight;
}

// ─── Apply action ──────────────────────────────────────────────────────────────

export interface ApplyActionResult {
    fight: ActiveFight;
    result: CombatActionResult;
    ended: boolean;
    summary: FightEndSummary | null;
}

export function applyAction(
    fight: ActiveFight,
    actionId: string,
    guild: DbGuild,
    profile: DbUserGuildProfile,
    config: GuildConfig,
): ApplyActionResult {
    const action = COMBAT_ACTIONS[actionId];
    if (!action) {
        throw new Error(`Unknown combat action: ${actionId}`);
    }

    const ctx: FightContext = { fight, profile, guild, config };
    const result = action.execute(ctx);

    // Apply deltas
    fight.playerCurrentHp = Math.max(0, fight.playerCurrentHp + result.playerHpDelta);
    fight.enemyCurrentHp  = Math.max(0, fight.enemyCurrentHp  + result.enemyHpDelta);
    fight.totalDamageDealt += Math.abs(result.enemyHpDelta);
    fight.totalDamageTaken += Math.abs(result.playerHpDelta);
    fight.round += 1;
    fight.expiresAt = Date.now() + FIGHT_TIMEOUT_MS; // reset timeout on each action

    const ended = result.outcome !== "continue";

    if (ended) {
        const summary = buildSummary(fight, result.outcome, config);
        clearActiveFight(fight.userId, fight.guildId);
        return { fight, result, ended: true, summary };
    }

    // Update stored fight state
    setActiveFight(fight);
    return { fight, result, ended: false, summary: null };
}

// ─── Build summary ─────────────────────────────────────────────────────────────

function rollDrops(enemy: EnemyConfig): { itemId: string; quantity: number }[] {
    const dropped: { itemId: string; quantity: number }[] = [];
    for (const drop of enemy.drops ?? []) {
        if (Math.random() < drop.chance) {
            dropped.push({ itemId: drop.itemId, quantity: drop.quantity });
        }
    }
    return dropped;
}

function buildSummary(
    fight: ActiveFight,
    outcome: FightOutcome,
    config: GuildConfig,
): FightEndSummary {
    const isWin = outcome === "win";

    // Apply XP/gold multipliers from boosts (equipped items)
    let xpMultiplier = 1;
    let goldMultiplier = 1;
    const items = config.shop?.items ?? {};
    for (const itemId of Object.values(fight.playerStats as any)) {
        // pull boost multipliers from equipped item effects
    }
    // Simpler: iterate equips via profile — but profile isn't on ActiveFight.
    // Multipliers are applied in applyFightRewards where we have the profile.

    return {
        outcome: outcome as Exclude<FightOutcome, "continue">,
        xpGained: outcome === "win" ? fight.enemy.xpReward
         : outcome === "loss" ? Math.floor(fight.enemy.xpReward * 0.1)
         : 0,
        goldGained: isWin ? fight.enemy.goldReward : 0,
        goldLost: 0,  // calculated in applyFightRewards once we have the profile
        itemsDropped: isWin ? rollDrops(fight.enemy) : [],
        rounds: fight.round,
        totalDamageDealt: fight.totalDamageDealt,
        totalDamageTaken: fight.totalDamageTaken,
    };
}

// ─── Apply rewards ─────────────────────────────────────────────────────────────
// Call this after a fight ends. Writes XP, gold, drops, and stats to the DB
// (via cache). Returns the updated profile.

/**
 * Calculates how much gold is lost on death and deducts it from the profile.
 * Returns the actual gold deducted (clamped to current balance, minimum 0).
 * Never takes more gold than the player has.
 */
function calcDeathGoldLoss(
    currentGold: bigint,
    penalty: { goldPercent?: number; goldFlat?: number } | undefined,
): bigint {
    if (!penalty) return 0n;
    const pct     = penalty.goldPercent ?? 0;
    const flat    = penalty.goldFlat    ?? 0;
    const fromPct = BigInt(Math.floor(Number(currentGold) * pct / 100));
    const loss    = fromPct > BigInt(flat) ? fromPct : BigInt(flat);
    return loss > currentGold ? currentGold : loss;
}

export async function applyFightRewards(
    summary: FightEndSummary,
    fight: ActiveFight,
    profile: DbUserGuildProfile,
    config: GuildConfig,
): Promise<DbUserGuildProfile> {
    const cached = await getOrCreateProfile({
        userId: profile.user_id,
        guildId: profile.guild_id,
    });
    let p = cached.profile;
    let pendingChanges: PendingProfileChanges = cached.pendingChanges ?? {} as PendingProfileChanges;

    // ── XP/gold multipliers from equipped item boosts ──
    let xpMult = 1;
    let goldMult = 1;
    const shopItems = config.shop?.items ?? {};
    for (const itemId of Object.values(p.equips ?? {})) {
        if (!itemId) continue;
        const boosts = shopItems[itemId]?.effects?.boosts;
        if (!boosts) continue;
        xpMult   *= boosts.xpMultiplier   ?? 1;
        goldMult *= boosts.goldMultiplier  ?? 1;
    }

    const finalXp   = Math.round(summary.xpGained   * xpMult);
    const finalGold = Math.round(summary.goldGained  * goldMult);

    // ── XP ──
    if (finalXp > 0) {
        p.xp = (BigInt(p.xp) + BigInt(finalXp)).toString();
        const newLevel = calculateLevelFromXp(Number(p.xp), config);
        if (newLevel > p.level) {
            p.level = newLevel;
            pendingChanges.level = p.level;
        }
        pendingChanges.xp = p.xp;
    }

    // ── Gold ──
    if (finalGold > 0) {
        p.gold = (BigInt(p.gold) + BigInt(finalGold)).toString();
        pendingChanges.gold = p.gold;
    }

    // ── Death penalty (loss only) ──
    if (summary.outcome === "loss") {
        const penaltyConfig = fight.combatType === "pvp"
            ? config.combat.pvpDeathPenalty
            : config.combat.pveDeathPenalty;
        const goldLost = calcDeathGoldLoss(BigInt(p.gold), penaltyConfig);
        if (goldLost > 0n) {
            p.gold = (BigInt(p.gold) - goldLost).toString();
            pendingChanges.gold = p.gold;
            summary.goldLost = Number(goldLost);
        }
        // XP loss (off by default — configurable but not recommended for PvE)
        const xpPct = penaltyConfig?.xpPercent ?? 0;
        if (xpPct > 0) {
            const xpLost = BigInt(Math.floor(Number(BigInt(p.xp)) * xpPct / 100));
            if (xpLost > 0n) {
                p.xp = (BigInt(p.xp) - xpLost).toString();
                const newLevel = calculateLevelFromXp(Number(p.xp), config);
                if (newLevel < p.level) {
                    p.level = newLevel;
                    pendingChanges.level = p.level;
                }
                pendingChanges.xp = p.xp;
            }
        }
    }

    // ── Drops → inventory ──
    if (summary.itemsDropped.length > 0) {
        const inv: Record<string, item> = { ...(p.inventory ?? {}) };
        for (const drop of summary.itemsDropped) {
            const itemDef = shopItems[drop.itemId];
            if (!itemDef) continue;
            const maxPerUser = itemDef.maxPerUser;
            const existing = inv[drop.itemId];
            const currentQty = existing?.quantity ?? 0;
            const canAdd = maxPerUser != null
                ? Math.min(drop.quantity, maxPerUser - currentQty)
                : drop.quantity;
            if (canAdd <= 0) continue;
            inv[drop.itemId] = {
                id: drop.itemId,
                name: itemDef.name,
                ...(itemDef.emoji       && { emoji:       itemDef.emoji }),
                ...(itemDef.description && { description: itemDef.description }),
                quantity: currentQty + canAdd,
            };
        }
        p.inventory = inv;
        pendingChanges.inventory = inv;
    }

    // ── User stats ──
    const stats = { ...(p.user_stats ?? {}) };
    stats.currentHp          = fight.playerCurrentHp;
    stats.totalDamageDealt   = (stats.totalDamageDealt   ?? 0) + summary.totalDamageDealt;
    stats.totalDamageTaken   = (stats.totalDamageTaken   ?? 0) + summary.totalDamageTaken;

    if (summary.outcome === "win") {
        stats.fightsWon        = (stats.fightsWon        ?? 0) + 1;
        stats.enemiesDefeated  = (stats.enemiesDefeated  ?? 0) + 1;
    } else if (summary.outcome === "loss") {
        stats.fightsLost       = (stats.fightsLost       ?? 0) + 1;
    }

    p.user_stats = stats;
    pendingChanges.user_stats = stats;

    // ── Write to cache (dirty → synced to DB on next flush) ──
    const key = profileKey(p.guild_id, p.user_id);
    userGuildProfileCache.set(key, {
        profile: p,
        pendingChanges: Object.keys(pendingChanges).length > 0 ? pendingChanges : undefined,
        dirty: true,
        lastWroteToDb: cached.lastWroteToDb,
        lastLoaded: Date.now(),
    });

    return p;
}

// ─── Enemy selection helpers ───────────────────────────────────────────────────

/**
 * Returns all enemies in the config that are within the player's level range.
 * Used by /fight when no specific enemy is chosen.
 */
export function getEligibleEnemies(config: GuildConfig, playerLevel: number): EnemyConfig[] {
    const enemies = Object.values(config.combat.enemies ?? {});
    return enemies.filter(
        (e) =>
            playerLevel >= e.minLevel &&
            (e.maxLevel == null || playerLevel <= e.maxLevel),
    );
}

/**
 * Picks a random eligible enemy. Returns null if none are configured/eligible.
 */
export function pickRandomEnemy(config: GuildConfig, playerLevel: number): EnemyConfig | null {
    const eligible = getEligibleEnemies(config, playerLevel);
    if (eligible.length === 0) return null;
    return eligible[Math.floor(Math.random() * eligible.length)] ?? null;
}

// ─── Stale fight cleanup ───────────────────────────────────────────────────────
// Call this on an interval (e.g. every 60s) from index.ts to reap abandoned fights.

export function cleanupStaleFights(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, fight] of activeFights.entries()) {
        if (now > fight.expiresAt) {
            activeFights.delete(key);
            cleaned++;
        }
    }
    return cleaned;
}
