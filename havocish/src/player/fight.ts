import type { GuildConfig } from "../types/guild.js";
import type { DbGuild } from "../types/guild.js";
import type { DbUserGuildProfile, item } from "../types/userprofile.js";
import type {
    ActiveFight,
    FightMember,
    CombatActionResult,
    EnemyConfig,
    FightEndSummary,
    FightOutcome,
} from "../types/combat.js";
import { calculateStats, resolveCurrentHp, respawnHp, storeHp, type CombatStats } from "./combat.js";
import { getOrCreateProfile, commitProfileChanges } from "../cache/profileService.js";
import type { PendingProfileChanges } from "../types/cache.js";
import { calculateLevelFromXp } from "../leveling/levels.js";
import { runQuestPipeline } from "./quests.js";
import { addCombatXp, combatXp } from "./combatLevel.js";
import { EmbedBuilder, type Client } from "discord.js";
import type { shopItemConfig } from "../types/economy.js";
import { getOrCreateGuildConfig } from "../cache/guildService.js";
import { bestEffort } from "../ui/bestEffort.js";
import { moveById, newFighterState, pickIntent, playTurn, usable, type PlayerChoice } from "./moves.js";

/** A fight expires (auto-fled) if the player doesn't act within this many ms. */
const FIGHT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

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

/** Registers the fight for every member still in it. */
export function setActiveFight(fight: ActiveFight) {
    for (const m of fight.members) if (!m.out || m.out === "down") activeFights.set(fightKey(m.userId, fight.guildId), fight);
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

/** How much an item heals when drunk mid-fight; 0 for anything that isn't a healing consumable. */
export function healAmount(item: shopItemConfig | undefined): number {
    if (!item || item.permanent) return 0;
    let total = 0;
    for (const a of Object.values(item.actions ?? {}) as any[]) {
        if (a?.type === "giveStat" && a.statId === "health") total += a.amount ?? 0;
    }
    return total;
}

/**
 * Turns a member's button into what they do. Button ids: `move:<id>`,
 * `potion:<itemId>`, `wait` (stunned or winding up) and `flee`. Throws on
 * anything the member can't do now.
 */
function choiceFor(fight: ActiveFight, m: FightMember, actionId: string, config: GuildConfig): { choice: PlayerChoice; log: string[] } | { fled: true } | { refused: string } {
    if (m.state.stunned || m.state.charging) return { choice: { kind: "pass" }, log: [] };
    const name = fight.members.length > 1 ? `**${m.name}**` : "You";
    if (actionId === "flee") {
        // Faster than the enemy always gets away; slower is a coin flip, and a miss costs the turn.
        if (m.stats.spd >= fight.enemy.spd || Math.random() < 0.5) return { fled: true };
        return { choice: { kind: "pass" }, log: [`🚫 ${name} failed to flee!`] };
    }
    if (actionId.startsWith("potion:")) {
        const item = config.shop?.items?.[actionId.slice("potion:".length)];
        const heal = healAmount(item);
        if (!item || heal <= 0) throw new Error(`Not a potion: ${actionId}`);
        return { choice: { kind: "potion", heal, name: item.name, emoji: item.emoji ?? "🧪" }, log: [] };
    }
    const moveId = actionId.startsWith("move:") ? actionId.slice("move:".length) : actionId === "basic_attack" ? m.loadout[0]! : "";
    const move = m.loadout.includes(moveId) ? moveById(config, moveId) : null;
    if (!move) throw new Error(`Unknown combat action: ${actionId}`);
    if (!usable(m.state, move)) return { refused: `⌛ **${move.name}** isn't ready yet.` };
    return { choice: { kind: "move", moveId }, log: [] };
}

/** What a member who didn't pick in time does: Attack, or their first move that's ready. */
function defaultPick(m: FightMember, config: GuildConfig): string {
    if (m.state.stunned || m.state.charging) return "wait";
    const ready = m.loadout.filter((id) => usable(m.state, moveById(config, id)));
    return `move:${ready.includes("attack") ? "attack" : ready[0] ?? m.loadout[0]}`;
}

// ─── Start and join ────────────────────────────────────────────────────────────

/** A player as they enter a fight: their stats and HP right now, and the moves they bring. */
export function newMember(opts: { discordUserId: string; name: string; profile: DbUserGuildProfile; config: GuildConfig; loadout: string[] }): FightMember {
    const stats = calculateStats(opts.profile, opts.config, opts.config.shop?.items ?? {});
    return {
        userId: opts.discordUserId,
        dbUserId: opts.profile.user_id,
        name: opts.name,
        stats,
        hp: resolveCurrentHp(opts.profile, stats, opts.config),
        state: newFighterState(),
        loadout: opts.loadout,
        dealt: 0,
        taken: 0,
    };
}

export interface StartFightOptions {
    discordUserId: string;
    discordGuildId: string;
    messageId: string;
    channelId: string;
    combatType: "pve" | "pvp";
    profile: DbUserGuildProfile;
    enemy: EnemyConfig;
    config: GuildConfig;
    /** From loadoutFor, which needs the member's roles. */
    loadout: string[];
    /** Their display name: shown in the title and, in a party, the log. */
    name: string;
    origin?: { channelId: string; messageId: string };
    placeName?: string;
}

export function startFight(opts: StartFightOptions): ActiveFight {
    const now = Date.now();
    const fight: ActiveFight = {
        userId: opts.discordUserId,
        guildId: opts.discordGuildId,
        messageId: opts.messageId,
        channelId: opts.channelId,
        dbGuildId: opts.profile.guild_id,
        combatType: opts.combatType,
        members: [newMember(opts)],
        enemy: opts.enemy,
        enemyMaxHp: opts.enemy.hp,
        enemyCurrentHp: opts.enemy.hp,
        foe: newFighterState(),
        ...(opts.origin && { origin: opts.origin }),
        ...(opts.placeName && { placeName: opts.placeName }),
        enemyIntent: "",
        enemyTarget: opts.discordUserId,
        round: 0,
        startedAt: now,
        expiresAt: now + FIGHT_TIMEOUT_MS,
    };

    fight.enemyIntent = pickIntent(fight, opts.config);

    setActiveFight(fight);
    return fight;
}

const PARTY_DEFAULTS = { enabled: true, maxPlayers: 3, turnSeconds: 30, hpPerExtraPlayer: 100, levelRange: true };

export function partyRules(config: GuildConfig) {
    return { ...PARTY_DEFAULTS, ...config.combat?.party };
}

/** Why someone can't join this fight right now, or null when they can. */
export function cantJoin(fight: ActiveFight, discordUserId: string, config: GuildConfig): string | null {
    const rules = partyRules(config);
    if (fight.resolved) return "That fight just ended.";
    if (!rules.enabled || fight.enemy.party === false || fight.combatType !== "pve") return "This fight is solo only.";
    if (fight.members.some((m) => m.userId === discordUserId)) return "You're already in this fight.";
    if (fight.members.length >= rules.maxPlayers) return `This fight is full (${rules.maxPlayers} players).`;
    return null;
}

/** Adds a player to a fight. The enemy gets tougher for each one, so a party earns about what a solo player does. */
export function joinFight(fight: ActiveFight, member: FightMember, config: GuildConfig): void {
    const extra = Math.round(fight.enemy.hp * partyRules(config).hpPerExtraPlayer / 100);
    fight.members.push(member);
    fight.enemyMaxHp += extra;
    fight.enemyCurrentHp += extra;
    setActiveFight(fight);
}

// ─── Rounds ────────────────────────────────────────────────────────────────────

/** Whether every member still in has picked, so the round can play. */
export function everyonePicked(fight: ActiveFight): boolean {
    return fight.members.every((m) => m.out || m.pick);
}

/**
 * Records a member's pick for this round. Refuses a move that isn't ready
 * (a stale button), which costs nothing.
 */
export function submitPick(fight: ActiveFight, discordUserId: string, actionId: string, config: GuildConfig): { refused?: string } {
    const m = fight.members.find((x) => x.userId === discordUserId && !x.out);
    if (!m) return { refused: "You're not in this fight." };
    let picked: ReturnType<typeof choiceFor>;
    try {
        picked = choiceFor(fight, m, actionId, config);
    } catch {
        return { refused: "That isn't one of your moves." };
    }
    if ("refused" in picked) return { refused: picked.refused };
    m.pick = actionId;
    return {};
}

export interface MemberResult { member: FightMember; summary: FightEndSummary }

export interface RoundResult {
    outcome: FightOutcome;
    log: string[];
    /** Members whose part ended this round (fled, or everyone when the fight ended), with what they earned. */
    settled: MemberResult[];
    ended: boolean;
    /** The fight was already over: the caller must pay and render nothing. */
    alreadyResolved?: boolean;
}

/** Plays the round with everyone's picks; anyone who didn't pick attacks. */
export function resolveRound(fight: ActiveFight, config: GuildConfig): RoundResult {
    if (fight.resolved) return { outcome: "continue", log: [], settled: [], ended: false, alreadyResolved: true };
    if (fight.roundTimer) clearTimeout(fight.roundTimer);
    delete fight.roundTimer;
    delete fight.roundEndsAt;

    const log: string[] = [];
    const settled: MemberResult[] = [];
    const choices: Record<string, PlayerChoice> = {};
    for (const m of fight.members.filter((x) => !x.out)) {
        const picked = choiceFor(fight, m, m.pick ?? defaultPick(m, config), config);
        delete m.pick;
        if ("fled" in picked) {
            m.out = "fled";
            clearActiveFight(m.userId, fight.guildId);
            log.push(`🏃 ${fight.members.length > 1 ? `**${m.name}**` : "You"} fled from the ${fight.enemy.emoji} ${fight.enemy.name}!`);
            settled.push({ member: m, summary: buildSummary(fight, m, "flee", config) });
        } else if ("refused" in picked) {
            choices[m.userId] = { kind: "pass" };
        } else {
            choices[m.userId] = picked.choice;
            log.push(...picked.log);
        }
    }

    let outcome: FightOutcome = "flee";
    if (fight.members.some((m) => !m.out)) {
        const turn = playTurn(fight, choices, config);
        log.push(...turn.log);
        outcome = turn.outcome;
    }
    fight.round += 1;
    fight.expiresAt = Date.now() + FIGHT_TIMEOUT_MS;

    if (outcome === "continue") {
        setActiveFight(fight);
        return { outcome, log, settled, ended: false };
    }
    // Set before anything awaits, so a concurrent click sees it.
    fight.resolved = true;
    for (const m of fight.members) {
        clearActiveFight(m.userId, fight.guildId);
        if (m.out === "fled") continue; // settled when they left
        settled.push({ member: m, summary: buildSummary(fight, m, outcome, config) });
    }
    return { outcome, log, settled, ended: true };
}

// ─── Solo shortcut ─────────────────────────────────────────────────────────────

export interface ApplyActionResult {
    fight: ActiveFight;
    result: { outcome: FightOutcome; log: string[] };
    ended: boolean;
    summary: FightEndSummary | null;
    /** Every member's result when it ended (one, alone). */
    settled: MemberResult[];
    alreadyResolved?: boolean;
}

/** One click in a solo fight: the pick and the round together. */
export function applyAction(
    fight: ActiveFight,
    actionId: string,
    _guild: DbGuild,
    _profile: DbUserGuildProfile,
    config: GuildConfig,
): ApplyActionResult {
    if (fight.resolved) {
        return { fight, result: { outcome: "continue", log: [] }, ended: false, summary: null, settled: [], alreadyResolved: true };
    }
    const pick = submitPick(fight, fight.members.find((m) => !m.out)?.userId ?? fight.userId, actionId, config);
    if (pick.refused) return { fight, result: { outcome: "continue", log: [pick.refused] }, ended: false, summary: null, settled: [] };
    const round = resolveRound(fight, config);
    const mine = round.settled.find((r) => r.member.userId === fight.userId)?.summary ?? null;
    return { fight, result: { outcome: round.outcome, log: round.log }, ended: round.ended, summary: round.ended ? mine : null, settled: round.settled };
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

/**
 * What one member earned. On a win, everyone standing gets the full reward and
 * their own drop rolls; a member knocked out gets half, and no drops.
 */
function buildSummary(fight: ActiveFight, m: FightMember, outcome: FightOutcome, config: GuildConfig): FightEndSummary {
    const won = outcome === "win";
    const share = won && m.out === "down" ? 0.5 : 1;
    return {
        outcome: (won ? "win" : outcome === "loss" || m.out === "down" ? "loss" : "flee") as FightEndSummary["outcome"],
        xpGained: won ? Math.floor(fight.enemy.xpReward * share)
            : outcome === "loss" ? Math.floor(fight.enemy.xpReward * 0.1)
            : 0,
        goldGained: won ? Math.floor(fight.enemy.goldReward * share) : 0,
        goldLost: 0,  // calculated in applyFightRewards once we have the profile
        itemsDropped: won && m.out !== "down" ? rollDrops(fight.enemy) : [],
        rounds: fight.round,
        totalDamageDealt: m.dealt,
        totalDamageTaken: m.taken,
        ...(won && m.out === "down" && { knockedOut: true }),
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
    fight: Pick<ActiveFight, "combatType" | "enemy">,
    /** Their HP when it ended; knocked out, or on a loss, they respawn low instead. */
    fighter: { hp: number; stats: CombatStats; out?: FightMember["out"] },
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

    // ── Combat XP ── (never chat XP: the RPG doesn't feed leveling)
    if (finalXp > 0) {
        const { before, after } = addCombatXp(p, config, finalXp);
        if (after > before) summary.combatLevelUp = after;
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
        if (xpPct > 0) addCombatXp(p, config, -Math.floor(combatXp(p) * xpPct / 100));
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
    // A loss respawns you low rather than at 0: a break, not a lockout.
    Object.assign(stats, storeHp(summary.outcome === "loss" || fighter.out === "down" ? respawnHp(fighter.stats, config) : fighter.hp));
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
export function pickRandomEnemy(config: GuildConfig, playerLevel: number, allowed: (e: EnemyConfig) => boolean = () => true): EnemyConfig | null {
    const eligible = getEligibleEnemies(config, playerLevel).filter(allowed);
    if (eligible.length === 0) return null;
    return eligible[Math.floor(Math.random() * eligible.length)] ?? null;
}

// ─── Stale fight cleanup ───────────────────────────────────────────────────────
// Call this on an interval (e.g. every 60s) from index.ts to reap abandoned fights.

export function cleanupStaleFights(client: Client): number {
    const now = Date.now();
    let cleaned = 0;
    for (const fight of allActiveFights()) {
        if (now > fight.expiresAt) {
            void abandonFight(fight, client, "timeout").catch((err) => console.error("Failed to end an abandoned fight:", err));
            cleaned++;
        }
    }
    return cleaned;
}

/** Every fight still going, for the shutdown handler. */
export function allActiveFights(): ActiveFight[] {
    return [...new Set(activeFights.values())];
}

/**
 * Ends a fight nobody finished -- the member walked away, or the bot is
 * restarting -- as a flee. No rewards and no death penalty, but the HP lost
 * in it stays lost, so walking away is never better than fleeing.
 */
export async function abandonFight(fight: ActiveFight, client: Client, why: "timeout" | "restart"): Promise<void> {
    if (fight.resolved) return;
    fight.resolved = true;
    if (fight.roundTimer) clearTimeout(fight.roundTimer);

    const { config } = await getOrCreateGuildConfig({ discordGuildId: fight.guildId });
    for (const m of fight.members) {
        clearActiveFight(m.userId, fight.guildId);
        if (m.out === "fled") continue; // settled when they left
        const ids = { user_id: m.dbUserId, guild_id: fight.dbGuildId } as DbUserGuildProfile;
        await applyFightRewards(buildSummary(fight, m, "flee", config), fight, m, ids, config);
    }

    const reason = why === "timeout" ? "Everyone walked away" : "havocish restarted";
    const embed = new EmbedBuilder()
        .setTitle(`🏃 Left the fight with ${fight.enemy.emoji} ${fight.enemy.name}`)
        .setColor("#FFA500")
        .setDescription(`${reason}, so it counts as fleeing. Wounds stay: ${fight.members.map((m) => `${fight.members.length > 1 ? `${m.name} ` : ""}❤️ **${m.hp}** / **${m.stats.maxHp}**`).join(" · ")}.`);
    await bestEffort("abandoned fight message", (async () => {
        const channel = await client.channels.fetch(fight.channelId);
        if (channel?.isTextBased()) await channel.messages.edit(fight.messageId, { embeds: [embed], components: [] });
    })());
    await postResultLine(client, fight, `🏃 <@${fight.userId}> left the fight with the ${fight.enemy.emoji} **${fight.enemy.name}**.`);
}

/** A threaded fight's result, on the short line in chat it hangs off. */
export async function postResultLine(client: Client, fight: ActiveFight, line: string): Promise<void> {
    if (!fight.origin) return;
    const { channelId, messageId } = fight.origin;
    await bestEffort("fight result line", (async () => {
        const channel = await client.channels.fetch(channelId);
        if (channel?.isTextBased()) await channel.messages.edit(messageId, { content: line, embeds: [], components: [], allowedMentions: { parse: [] } });
    })());
}
