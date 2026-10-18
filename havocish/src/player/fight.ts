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
import { getOrCreateProfile, commitProfileChanges } from "../cache/profileService.js";
import type { PendingProfileChanges } from "../types/cache.js";
import { calculateLevelFromXp } from "../leveling/levels.js";
import { runQuestPipeline } from "./quests.js";
import { EmbedBuilder, type Client } from "discord.js";
import type { shopItemConfig } from "../types/economy.js";
import { getOrCreateGuildConfig } from "../cache/guildService.js";
import { bestEffort } from "../ui/bestEffort.js";

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

/** A link that jumps to the fight's message. */
export function fightLink(fight: ActiveFight): string {
    return `https://discord.com/channels/${fight.guildId}/${fight.channelId}/${fight.messageId}`;
}

/**
 * While a member is fighting, anything else that changes their HP or gear
 * waits: the fight holds its own copy of both and would overwrite the change
 * when it ends. Returns what to tell them, or null when they aren't fighting.
 */
export function busyFighting(discordUserId: string, discordGuildId: string, then: string): string | null {
    const fight = getActiveFight(discordUserId, discordGuildId);
    if (!fight) return null;
    return `⚔️ You're fighting ${fight.enemy.emoji} **${fight.enemy.name}** ([jump to it](${fightLink(fight)})). ${then}`;
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

/**
 * The enemy's swing after the player's turn, and whether the fight goes on.
 * `playerHp` is the player's HP before the swing.
 */
function enemyTurn(fight: ActiveFight, playerHp: number, log: string[]): { playerHpDelta: number; outcome: FightOutcome } {
    const enemyHit = resolveHit(
        fight.enemy.atk,
        fight.playerStats.def,
        fight.enemy.critChance,
        fight.enemy.critMultiplier,
    );
    log.push(
        enemyHit.isCrit
            ? `💥 **${fight.enemy.emoji} ${fight.enemy.name} landed a critical hit!** You took **${enemyHit.damage}** damage!`
            : `🗡️ ${fight.enemy.emoji} ${fight.enemy.name} hit you for **${enemyHit.damage}** damage.`,
    );
    if (playerHp - enemyHit.damage <= 0) return { playerHpDelta: -enemyHit.damage, outcome: "loss" };

    const outcome: FightOutcome = fight.round + 1 >= MAX_ROUNDS ? "flee" : "continue";
    if (outcome === "flee") log.push(`⏱️ The fight dragged on too long — you escaped exhausted.`);
    return { playerHpDelta: -enemyHit.damage, outcome };
}

/** How much an item heals when drunk mid-fight; 0 for anything that isn't a healing consumable. */
export function healAmount(item: shopItemConfig | undefined): number {
    if (!item || item.permanent) return 0;
    let total = 0;
    for (const a of Object.values(item.actions ?? {}) as any[]) {
        if (a?.type === "giveStat" && a.statId === "health") total += a.amount ?? 0;
    }
    return total;
}

/** Drinking a potion takes the player's turn, so the enemy still swings. */
function drinkAction(item: shopItemConfig): CombatAction {
    return {
        id: `potion:${item.id}`, label: item.name, emoji: item.emoji ?? "🧪", style: "secondary",
        execute({ fight }): CombatActionResult {
            const healed = Math.min(healAmount(item), fight.playerStats.maxHp - fight.playerCurrentHp);
            const hp = fight.playerCurrentHp + healed;
            const log = [`${item.emoji ?? "🧪"} You drank **${item.name}**. ❤️ ${fight.playerCurrentHp} → ${hp}`];
            const turn = enemyTurn(fight, hp, log);
            return { outcome: turn.outcome, playerHpDelta: healed + turn.playerHpDelta, enemyHpDelta: 0, log };
        },
    };
}

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
            const { playerHpDelta, outcome } = enemyTurn(fight, fight.playerCurrentHp, log);
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
        dbUserId: opts.profile.user_id,
        dbGuildId: opts.profile.guild_id,
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
    /**
     * True when the fight was already over before this action. The caller must
     * hand out no rewards and render nothing -- the action that actually ended
     * the fight has already done both.
     */
    alreadyResolved?: boolean;
}

export function applyAction(
    fight: ActiveFight,
    actionId: string,
    guild: DbGuild,
    profile: DbUserGuildProfile,
    config: GuildConfig,
): ApplyActionResult {
    const potion = actionId.startsWith("potion:") ? config.shop?.items?.[actionId.slice("potion:".length)] : undefined;
    const action = potion && healAmount(potion) > 0 ? drinkAction(potion) : COMBAT_ACTIONS[actionId];
    if (!action) {
        throw new Error(`Unknown combat action: ${actionId}`);
    }

    // A finished fight accepts no further actions. Without this, a second
    // click resolves against an enemy already on 0 HP, reports another win and
    // pays out the rewards a second time.
    if (fight.resolved) {
        return {
            fight,
            result: { outcome: "continue", playerHpDelta: 0, enemyHpDelta: 0, log: [] },
            ended: false,
            summary: null,
            alreadyResolved: true,
        };
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
        // Set before anything awaits, so a concurrent click sees it.
        fight.resolved = true;
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
    const baseline = { xp: p.xp, gold: p.gold };

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

    // ── Quests ── (a finished one shows as ready to claim in /quests)
    if (summary.outcome === "win" && fight.combatType === "pve" && fight.enemy) {
        const q = await runQuestPipeline({
            profile: p, pending: pendingChanges, config,
            event: { type: "defeatEnemy", guildId: String(p.guild_id), userId: String(p.user_id), enemyId: fight.enemy.id },
        });
        p = q.profile;
        pendingChanges = q.pending;
        summary.questsCompleted = q.completed.map((c) => c.name);
    }

    // ── Write to cache (dirty → synced to DB on next flush) ──
    return commitProfileChanges({
        userId: p.user_id,
        guildId: p.guild_id,
        profile: p,
        changes: pendingChanges,
        baseline,
        recomputeLevel: (xp) => calculateLevelFromXp(Number(xp), config),
    });
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
            !e.boss &&
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

export function cleanupStaleFights(client: Client): number {
    const now = Date.now();
    let cleaned = 0;
    for (const fight of [...activeFights.values()]) {
        if (now > fight.expiresAt) {
            void abandonFight(fight, client, "timeout").catch((err) => console.error("Failed to end an abandoned fight:", err));
            cleaned++;
        }
    }
    return cleaned;
}

/** Every fight still going, for the shutdown handler. */
export function allActiveFights(): ActiveFight[] {
    return [...activeFights.values()];
}

/**
 * Ends a fight nobody finished -- the member walked away, or the bot is
 * restarting -- as a flee. No rewards and no death penalty, but the HP lost
 * in it stays lost, so walking away is never better than fleeing.
 */
export async function abandonFight(fight: ActiveFight, client: Client, why: "timeout" | "restart"): Promise<void> {
    if (fight.resolved) return;
    fight.resolved = true;
    clearActiveFight(fight.userId, fight.guildId);

    const { config } = await getOrCreateGuildConfig({ discordGuildId: fight.guildId });
    const ids = { user_id: fight.dbUserId, guild_id: fight.dbGuildId } as DbUserGuildProfile;
    await applyFightRewards(buildSummary(fight, "flee", config), fight, ids, config);

    const reason = why === "timeout" ? "You walked away" : "havocish restarted";
    const embed = new EmbedBuilder()
        .setTitle(`🏃 Left the fight with ${fight.enemy.emoji} ${fight.enemy.name}`)
        .setColor("#FFA500")
        .setDescription(`${reason}, so it counts as fleeing. You kept your wounds: ❤️ **${fight.playerCurrentHp}** / **${fight.playerStats.maxHp}**.`);
    await bestEffort("abandoned fight message", (async () => {
        const channel = await client.channels.fetch(fight.channelId);
        if (channel?.isTextBased()) await channel.messages.edit(fight.messageId, { embeds: [embed], components: [] });
    })());
}
