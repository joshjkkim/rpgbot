/**
 * Headless smoke tests for the persistence layer.
 *
 * These exercise the real cache, trade and DB code paths with no Discord
 * connection --
 * addMessageXp(), grantDailyXp() and the quest/achievement pipelines all take
 * plain data, and only touch Discord when a `client` is passed.
 *
 * Run against a SCRATCH database, never production:
 *
 *   npm --workspace havocish run smoke
 *
 * See scripts/setup-test-db.sh for creating the scratch schema.
 */
// MUST be first: it loads DATABASE_URL before db/index.ts builds its Pool.
import "./loadTestEnv.js";
import { upsertUser } from "../src/db/users.js";
import { upsertGuild, setGuildConfig, mergeConfig, getGuildByDiscordId, markGuildRemoved } from "../src/db/guilds.js";
import { addMessageXp, grantDailyXp, getUserGuildProfile, upsertUserGuildProfile } from "../src/db/userGuildProfiles.js";
import { commitProfileChanges, getOrCreateProfile, flushProfileCacheToDb, profileEvents } from "../src/cache/profileService.js";
import { calculateTotalXpForLevel, dailyTemplate } from "../src/leveling/levels.js";
import { flushDirtyProfiles, userGuildProfileCache, profileKey, guildConfigCache } from "../src/cache/caches.js";
import { query, closePool } from "../src/db/index.js";
import { createTrade, acceptTrade, denyTrade, cancelTrade } from "../src/db/trade.js";
import { updateInventory, sellItemFromInventory } from "../src/player/inventory.js";
import { transferItem } from "../src/player/trading.js";
import { purchaseItem } from "../src/db/shop.js";
import { startFight, applyAction, applyFightRewards, cantJoin, easyXpShare, pickRandomEnemy, everyonePicked, joinFight, resolveRound, submitPick, clearActiveFight, abandonFight, busyFighting, getActiveFight } from "../src/player/fight.js";
import { buildActionRows } from "../src/commands/user/fight.js";
import { resolveDuel } from "../src/db/duel.js";
import { simulateDuel, splitPot } from "../src/player/duel.js";
import { databaseUrlProblem } from "../src/env.js";
import type { ActiveFight, EnemyConfig, FightMember } from "../src/types/combat.js";
import type { DbGuild, GuildConfig } from "../src/types/guild.js";
import type { DbUserGuildProfile, item } from "../src/types/userprofile.js";
import type { shopItemConfig } from "../src/types/economy.js";
import { handleEncounterButton, maybeSpawnEncounter } from "../src/player/encounters.js";
import { dismissBoss, handleBossButton, liveBoss, nextIntent, restoreBosses, saveLiveBosses, spawnBoss, splitBossRewards } from "../src/player/bosses.js";
import { execute as helpCommand, handleHelpButton } from "../src/commands/user/help.js";
import { logAndBroadcastEvent, flushLogBuffer as flushLogsForTest } from "../src/db/events.js";
import { calculateLevelFromXp as levelFromXp, levelStartXp } from "../src/leveling/levels.js";
import type { EventCategory } from "../src/types/logging.js";
import { renderSheet } from "../src/commands/user/me.js";
import { newestEntry, shortEntry } from "./changelog-post.js";
import { STARTER_PACKS, applyPack } from "../src/content/packs.js";
import { attemptUpgrade, chanceAfterStrike, nextStep, upgradeBonus, upgradeLevel } from "../src/player/upgrades.js";
import { packChanges, stableJson } from "../src/content/packHistory.js";
import { renderCharacterPane } from "../src/ui/canvas/characterPane.js";
import { postResultLine } from "../src/player/fight.js";
import { checkUnlocks, earned } from "../src/player/unlocks.js";
import { enemyPreset, gearPreset } from "../src/content/balance.js";
import { addEntries, entryOf, KINDS, plan, refsOf, type Kind, type Ref } from "../src/content/library.js";
import { buildPack, parseSkeleton, type Skeleton } from "../src/content/aiPack.js";
import { applyChanges, cleanChanges, valueAt } from "../src/content/helper.js";
import { handleSetupInteraction } from "../src/commands/admin/setup.js";
import { announcer, editSpoken, lineOf, shopkeeper, speak, speaker } from "../src/ui/characters.js";
import { EmbedBuilder } from "discord.js";
import { getOrCreateGuildConfig } from "../src/cache/guildService.js";
import { readFileSync } from "node:fs";
import { handleQuestsButton, objective, renderQuestLog } from "../src/commands/user/quests.js";
import { applyQuestEvent } from "../src/player/quests.js";
import { checkGuild, type Access } from "../src/health/checkGuild.js";
import { DEFAULT_GUILD_CONFIG } from "../src/types/guild.js";
import { equipItemFromInventory, useItemFromInventory } from "../src/player/inventory.js";
import { itemCardLines } from "../src/ui/canvas/itemCard.js";
import { visibleCategories } from "../src/commands/user/shop.js";
import { checkRequirements, itemRequirements } from "../src/player/requirements.js";
import { addCombatXp, combatLevel, combatXpForLevel, convertLegacyCombat } from "../src/player/combatLevel.js";
import { afterLoss, calculateStats, hpRules, minutesToFull, resolveCurrentHp, respawnHp, storeHp, woundedUntil, type CombatStats } from "../src/player/combat.js";
import { fightsInThread, pickFromPlace, placeEnemies, placeFor } from "../src/player/places.js";
import { DEFAULT_MOVES, describeMove, learnMove, moveToLearn, intentLine, intentThreat, turnOrderLine, loadoutFor, moveById, newFighterState, pickIntent, playTurn, usable, type PlayerChoice } from "../src/player/moves.js";
import { announceRareFinds } from "../src/ui/rareFinds.js";
import { mentionsFor } from "../src/ui/mentions.js";
import { newMoveLines, nextFightLine, nextGatherLine } from "../src/player/nextSteps.js";
import { leftToday } from "../src/db/shop.js";
import { payCollectionMilestones, setProgress } from "../src/player/collections.js";
import { pruneOldEvents } from "../src/db/events.js";
import { renderBattleScene } from "../src/ui/canvas/battleScene.js";
import { loadCachedImage } from "../src/ui/canvas/drawEmojis.js";
import { imgCache } from "../src/cache/caches.js";
import { tipOnce } from "../src/player/tips.js";
import { grantLevelRewards, grantRoleRewards, resetRoleRewards } from "../src/player/levelRewards.js";
import { rpgLevelUpCard } from "../src/ui/rpgLevelUpCard.js";
import { craftOnce, forgeRules, judgeForge, learnRecipe, placeForge, recipeState, recipeToLearn } from "../src/player/crafting.js";
import { energyNow, gridRules, makeClusteredGrid, makeGrid, rollLoot, skillLevel, skillXpForLevel, spentEnergy } from "../src/player/gathering.js";
import { conditionNow, conditionSlot, runMods } from "../src/player/twists.js";
import { pullRounds, timingWindowMs } from "../src/ui/gathering/timing.js";
import { findRules } from "../src/ui/gathering/find.js";

// ─── Tiny assertion harness ───────────────────────────────────────────────────

let passed = 0;
let failed = 0;

/** A fight built by hand for engine tests: one member "u" against `enemy`. */
function handFight(enemy: Partial<EnemyConfig>, you: Partial<CombatStats> = {}, loadout = ["attack", "heavy", "guard"]): ActiveFight {
    const stats = { maxHp: 100, atk: 20, def: 0, spd: 5, critChance: 0, critMultiplier: 1.5, ...you };
    const e = { id: "ogre", name: "Ogre", emoji: "👹", hp: 100, atk: 10, def: 0, spd: 1, critChance: 0, critMultiplier: 1,
        minLevel: 0, maxLevel: null, xpReward: 0, goldReward: 0, drops: [], ...enemy } as EnemyConfig;
    return {
        userId: "u", guildId: "g", messageId: "m", channelId: "c", dbGuildId: 0, combatType: "pve",
        members: [{ userId: "u", dbUserId: 0, name: "U", stats, hp: stats.maxHp, state: newFighterState(), loadout, dealt: 0, taken: 0 }],
        enemy: e, enemyMaxHp: e.hp, enemyCurrentHp: e.hp, foe: newFighterState(), enemyIntent: "attack", enemyTarget: "u",
        round: 0, startedAt: 0, expiresAt: 0,
    };
}

function check(name: string, actual: unknown, expected: unknown) {
    const ok = String(actual) === String(expected);
    if (ok) {
        passed++;
        console.log(`  \x1b[32mPASS\x1b[0m ${name}`);
    } else {
        failed++;
        console.log(`  \x1b[31mFAIL\x1b[0m ${name}\n       expected: ${expected}\n       actual:   ${actual}`);
    }
}

async function test(name: string, fn: () => Promise<void>) {
    console.log(`\n\x1b[1m${name}\x1b[0m`);
    try {
        await fn();
    } catch (err) {
        failed++;
        console.log(`  \x1b[31mTHREW\x1b[0m ${err}`);
    }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TEST_DISCORD_USER = "900000000000000001";
const TEST_DISCORD_GUILD = "900000000000000002";

/** Wipes all test rows and every in-memory cache, so each test starts clean. */
async function reset(): Promise<{ userId: number; guildId: number; config: GuildConfig }> {
    userGuildProfileCache.clear();
    guildConfigCache.clear();

    const user = await upsertUser({ discordUserId: TEST_DISCORD_USER, username: "smoke-test" });
    const guild = await upsertGuild({ discordGuildId: TEST_DISCORD_GUILD, name: "smoke-test-guild" });

    await query(`DELETE FROM user_guild_profiles WHERE user_id = $1 AND guild_id = $2`, [user.id, guild.id]);

    // No cooldown, predictable XP, so the tests are deterministic.
    const config = mergeConfig(guild.config);
    config.xp.basePerMessage = 10;
    config.xp.xpMessageCooldown = 0;
    config.logging.enabled = false;
    await setGuildConfig(TEST_DISCORD_GUILD, config);

    userGuildProfileCache.clear();
    return { userId: user.id, guildId: guild.id, config };
}

/** How many profiles the guild has, straight from Postgres. */
async function profileCount(guildId: number): Promise<string> {
    const res = await query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM user_guild_profiles WHERE guild_id = $1`,
        [guildId]
    );
    return res.rows[0]!.count;
}

/** Reads xp/gold straight from Postgres, bypassing the cache entirely. */
async function xpInDb(userId: number, guildId: number): Promise<string> {
    const res = await query<{ xp: string }>(
        `SELECT xp FROM user_guild_profiles WHERE user_id = $1 AND guild_id = $2`,
        [userId, guildId]
    );
    return res.rows[0]?.xp ?? "NO ROW";
}

/** Ages a cache entry so it looks stale without waiting out the real TTL. */
function ageCacheEntry(guildId: number, userId: number, ms: number) {
    const entry = userGuildProfileCache.get(profileKey(guildId, userId));
    if (entry) entry.lastLoaded = Date.now() - ms;
}

// ─── Trade fixtures ───────────────────────────────────────────────────────────

const TEST_DISCORD_USER_B = "900000000000000003";
const TEST_DISCORD_USER_C = "900000000000000004";

/** The shop the trade tests run against. `ghost` is deliberately absent. */
const SHOP_ITEMS: Record<string, shopItemConfig> = {
    potion: { id: "potion", name: "Health Potion", emoji: "🧪", description: "Restores HP.", categoryId: "consumables", price: 10 },
    sword:  { id: "sword",  name: "Iron Sword",    emoji: "⚔️",  description: "Pointy.",      categoryId: "gear",        price: 100 },
};

type TradeParty = { userId: number; discordId: string; profileId: number };
type TradeFixture = { guild: DbGuild; a: TradeParty; b: TradeParty; c: TradeParty };

/** Builds an inventory slot the way the bot stores them. */
function inv(entries: Array<[string, number]>): Record<string, item> {
    const out: Record<string, item> = {};
    for (const [id, quantity] of entries) {
        const shopItem = SHOP_ITEMS[id];
        out[id] = {
            id,
            name: shopItem?.name ?? id,
            quantity,
            ...(shopItem?.emoji !== undefined && { emoji: shopItem.emoji }),
            ...(shopItem?.description !== undefined && { description: shopItem.description }),
        };
    }
    return out;
}

/**
 * Three users in one guild with a stocked shop, all profiles empty.
 *
 * Trades cascade-delete with their profiles, so wiping the profiles is enough
 * to leave no rows behind between tests.
 */
async function resetTrades(): Promise<TradeFixture> {
    userGuildProfileCache.clear();
    guildConfigCache.clear();

    const guildRow = await upsertGuild({ discordGuildId: TEST_DISCORD_GUILD, name: "smoke-test-guild" });

    const parties: TradeParty[] = [];
    for (const discordId of [TEST_DISCORD_USER, TEST_DISCORD_USER_B, TEST_DISCORD_USER_C]) {
        const user = await upsertUser({ discordUserId: discordId, username: `smoke-${discordId.slice(-1)}` });
        await query(`DELETE FROM user_guild_profiles WHERE user_id = $1 AND guild_id = $2`, [user.id, guildRow.id]);
        const profile = await upsertUserGuildProfile({ userId: user.id, guildId: guildRow.id });
        parties.push({ userId: user.id, discordId, profileId: profile.id });
    }

    const config = mergeConfig(guildRow.config);
    config.logging.enabled = false;
    config.shop = { ...config.shop, enabled: true, items: SHOP_ITEMS };
    await setGuildConfig(TEST_DISCORD_GUILD, config);

    userGuildProfileCache.clear();

    const guild = await getGuildByDiscordId(TEST_DISCORD_GUILD);
    if (!guild) throw new Error("guild vanished after setGuildConfig");

    return { guild, a: parties[0]!, b: parties[1]!, c: parties[2]! };
}

/** Writes inventory + gold straight to Postgres and drops the cache entry. */
async function seed(p: TradeParty, guildId: number, inventory: Record<string, item>, gold: number): Promise<void> {
    await query(
        `UPDATE user_guild_profiles SET inventory = $3, gold = $4 WHERE user_id = $1 AND guild_id = $2`,
        [p.userId, guildId, JSON.stringify(inventory), String(gold)]
    );
    userGuildProfileCache.delete(profileKey(guildId, p.userId));
}

/** Reads a profile row from the DB, bypassing the cache. */
async function row(p: TradeParty, guildId: number): Promise<DbUserGuildProfile> {
    const profile = await getUserGuildProfile(p.userId, guildId);
    if (!profile) throw new Error(`no profile row for user ${p.userId}`);
    return profile;
}

/** Quantity of `itemId` in the DB row, 0 when the slot is absent. */
async function qty(p: TradeParty, guildId: number, itemId: string): Promise<number> {
    return (await row(p, guildId)).inventory?.[itemId]?.quantity ?? 0;
}

async function goldOf(p: TradeParty, guildId: number): Promise<string> {
    return (await row(p, guildId)).gold;
}

async function tradeStatus(tradeId: string): Promise<string> {
    const res = await query<{ status: string }>(`SELECT status FROM trades WHERE id = $1`, [tradeId]);
    return res.rows[0]?.status ?? "NO ROW";
}

/** Creates a trade through the real createTrade() path. */
async function offer(
    fx: TradeFixture,
    asker: TradeParty,
    receiver: TradeParty,
    opts: { askerItems?: Record<string, number>; receiverItems?: Record<string, number>; askerGold?: number; receiverGold?: number } = {}
): Promise<string> {
    const res = await createTrade(
        {
            asker: await row(asker, fx.guild.id),
            askerDiscordId: asker.discordId,
            receiver: await row(receiver, fx.guild.id),
            receiverDiscordId: receiver.discordId,
            askerItems: opts.askerItems ?? {},
            receiverItems: opts.receiverItems ?? {},
            askerGold: opts.askerGold ?? 0,
            receiverGold: opts.receiverGold ?? 0,
        },
        fx.guild
    );
    if (!res.success || !res.tradeId) throw new Error("createTrade failed to set up the fixture");
    return res.tradeId;
}

/**
 * Inserts a trade row directly, bypassing createTrade()'s validation.
 * Needed for states createTrade refuses to produce: already-expired offers, and
 * offers naming an item the shop no longer sells.
 */
async function rawOffer(
    fx: TradeFixture,
    asker: TradeParty,
    receiver: TradeParty,
    opts: {
        askerItems?: Record<string, number>; receiverItems?: Record<string, number>;
        askerGold?: number; receiverGold?: number; expiresAt?: Date;
    } = {}
): Promise<string> {
    const res = await query<{ id: string }>(
        `INSERT INTO trades
           (guild_id, discord_guild_id, asker_profile_id, asker_discord_id,
            receiver_profile_id, receiver_discord_id, asker_items, receiver_items,
            asker_gold, receiver_gold, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11)
         RETURNING id`,
        [
            fx.guild.id, fx.guild.discord_guild_id,
            asker.profileId, asker.discordId,
            receiver.profileId, receiver.discordId,
            JSON.stringify(opts.askerItems ?? {}), JSON.stringify(opts.receiverItems ?? {}),
            opts.askerGold ?? 0, opts.receiverGold ?? 0,
            opts.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
        ]
    );
    if (!res.rows[0]) throw new Error("rawOffer insert returned no id");
    return res.rows[0].id;
}

/** Overwrites one shop item's config, e.g. to give it finite stock. */
async function patchShopItem(fx: TradeFixture, itemId: string, patch: Partial<shopItemConfig>): Promise<void> {
    const base = SHOP_ITEMS[itemId];
    if (!base) throw new Error(`no fixture item ${itemId}`);

    const config = mergeConfig(fx.guild.config);
    config.logging.enabled = false;
    config.shop = {
        ...config.shop,
        enabled: true,
        items: { ...SHOP_ITEMS, [itemId]: { ...base, ...patch } },
    };
    await setGuildConfig(fx.guild.discord_guild_id, config);
    guildConfigCache.clear();
}

/** Reads an item's stock straight out of the stored config JSONB. */
async function itemStock(fx: TradeFixture, itemId: string): Promise<string> {
    const res = await query<{ stock: string | null }>(
        `SELECT config #>> ARRAY['shop', 'items', $2::text, 'stock'] AS stock
         FROM guilds WHERE id = $1`,
        [fx.guild.id, itemId]
    );
    return res.rows[0]?.stock ?? "null";
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function main() {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

    const target = await query<{ db: string; schema: string }>(
        `SELECT current_database() AS db, current_schema() AS schema`
    );
    console.log(`Running against: ${target.rows[0]?.db} / schema ${target.rows[0]?.schema}`);
    if (target.rows[0]?.schema === "public") {
        throw new Error(
            "Refusing to run: current_schema() is 'public'. Point DATABASE_URL at a scratch schema first " +
            "(see scripts/setup-test-db.sh)."
        );
    }

    await test("XP is buffered in cache, not written straight through", async () => {
        const { userId, guildId, config } = await reset();

        await addMessageXp({ userId, guildId, config });
        check("cache holds the XP", (await getOrCreateProfile({ userId, guildId })).profile.xp, "10");
        check("DB has not been written yet", await xpInDb(userId, guildId), "0");

        await flushDirtyProfiles(true);
        check("DB has the XP after a flush", await xpInDb(userId, guildId), "10");
    });

    await test("buffered XP survives a stale-cache reload (the silent-loss bug)", async () => {
        const { userId, guildId, config } = await reset();

        // Land some XP in the buffer, then flush it so lastWroteToDb is recent -
        // this is what used to make the next flush a no-op.
        await addMessageXp({ userId, guildId, config });
        await flushDirtyProfiles(true);
        check("baseline persisted", await xpInDb(userId, guildId), "10");

        // More XP arrives and stays buffered.
        await addMessageXp({ userId, guildId, config });
        check("cache is ahead of the DB", (await getOrCreateProfile({ userId, guildId })).profile.xp, "20");
        check("DB still behind", await xpInDb(userId, guildId), "10");

        // The entry goes stale while still dirty, then something reads the
        // profile. This is the exact sequence that used to drop the write.
        ageCacheEntry(guildId, userId, 60_000);
        const reloaded = await getOrCreateProfile({ userId, guildId });
        check("reload preserved the buffered XP", reloaded.profile.xp, "20");

        await flushDirtyProfiles(true);
        check("buffered XP reached the DB", await xpInDb(userId, guildId), "20");
    });

    await test("a forced flush persists everything (shutdown path)", async () => {
        const { userId, guildId, config } = await reset();

        await addMessageXp({ userId, guildId, config });
        await flushDirtyProfiles(true);

        // Immediately buffer more: the 5s write throttle would normally skip this.
        await addMessageXp({ userId, guildId, config });
        await flushDirtyProfiles(false);
        check("throttle held the second write back", await xpInDb(userId, guildId), "10");

        // force = true is what the SIGTERM handler uses.
        await flushDirtyProfiles(true);
        check("forced flush persisted it", await xpInDb(userId, guildId), "20");
    });

    await test("a forced flush does not settle for a throttled one already running", async () => {
        const { userId, guildId, config } = await reset();

        await addMessageXp({ userId, guildId, config });
        await flushDirtyProfiles(true);          // leaves lastWroteToDb recent
        await addMessageXp({ userId, guildId, config });

        // Both calls are in flight at once, and the throttled one gets there
        // first. Deduping purely by profile key would hand the forced caller the
        // throttled call's no-op result and drop the buffered XP -- which is the
        // shutdown path, where a SIGTERM lands on top of the 30s flush timer.
        const throttled = flushProfileCacheToDb({ userId, guildId });
        const forced = flushProfileCacheToDb({ userId, guildId, force: true });
        const [throttledResult, forcedResult] = await Promise.all([throttled, forced]);

        check("throttled call reported the entry still dirty", throttledResult, false);
        check("forced call reported it clean", forcedResult, true);
        check("forced call persisted the XP", await xpInDb(userId, guildId), "20");
    });

    await test("leveling off: no chat XP anywhere, the rest still runs", async () => {
        const { userId, guildId, config } = await reset();
        config.xp.enabled = false;

        await addMessageXp({ userId, guildId, config });
        const p = (await getOrCreateProfile({ userId, guildId })).profile;
        check("a message gives no XP", p.xp, "0");
        check("but still counts as a message", p.user_stats.messagesSent, 1);

        const daily = await grantDailyXp({ userId, guildId, config });
        check("the daily gives no XP", daily.rewardXp, 0);
        check("but still pays gold", daily.rewardGold, config.xp.dailyGold);

        const stats = calculateStats({ level: 40, user_stats: {} } as any, config, {});
        check("no chat-level stat bonus", stats.maxHp, calculateStats({ level: 1, user_stats: {} } as any, { ...config, combat: { ...config.combat, chatBonus: {} } }, {}).maxHp);
        check("the daily message drops its XP part",
            dailyTemplate("You got {xp} {xpName} {xpIcon} and {gold} {goldName}!", config), "You got {gold} {goldName}!");
    });

    await test("daily grants xp + gold once per day", async () => {
        const { userId, guildId, config } = await reset();

        const first = await grantDailyXp({ userId, guildId, config });
        check("first claim granted", first.granted, "true");
        check("streak started at 1", first.profile.streak_count, "1");

        const second = await grantDailyXp({ userId, guildId, config });
        check("second claim refused same day", second.granted, "false");

        await flushDirtyProfiles(true);
        const row = await getUserGuildProfile(userId, guildId);
        check("gold persisted", row?.gold, String(config.xp.dailyGold));
        check("xp persisted", row?.xp, String(config.xp.dailyXp));
    });

    await test("concurrent XP in the same tick is not lost", async () => {
        const { userId, guildId, config } = await reset();

        // Ten messages resolving concurrently, as they would under load.
        await Promise.all(
            Array.from({ length: 10 }, () => addMessageXp({ userId, guildId, config }))
        );
        await flushProfileCacheToDb({ userId, guildId, force: true });

        check("all ten grants landed", await xpInDb(userId, guildId), "100");
    });

    await test("a gold write landing during addMessageXp is not dropped", async () => {
        const { userId, guildId, config } = await reset();

        // Warm the cache so neither call starts by loading the row from Postgres.
        await getOrCreateProfile({ userId, guildId });

        // A message and a gold write resolve concurrently. addMessageXp reads
        // the pending-change buffer up front and only writes it back after the
        // quest and achievement pipelines have awaited, so a write that lands in
        // between used to be erased from the buffer. The cache still showed the
        // gold (every writer mutates the same profile object), but it never
        // reached Postgres and reverted the next time the entry was reloaded.
        await Promise.all([
            addMessageXp({ userId, guildId, config }),
            updateInventory(userId, guildId, inv([["potion", 2]]), 500),
        ]);

        await flushDirtyProfiles(true);
        const row = await getUserGuildProfile(userId, guildId);
        check("XP persisted", row?.xp, "10");
        check("the concurrent gold write persisted", row?.gold, "500");
        check("the concurrent inventory write persisted", row?.inventory?.potion?.quantity, "2");
    });

    await test("a gold write landing during grantDailyXp is not dropped", async () => {
        const { userId, guildId, config } = await reset();
        await getOrCreateProfile({ userId, guildId });

        // Same race on the daily path, which awaits the quest pipeline and the
        // achievement pipeline between reading the buffer and writing it back.
        const [daily] = await Promise.all([
            grantDailyXp({ userId, guildId, config }),
            updateInventory(userId, guildId, inv([["potion", 1]]), 777),
        ]);
        check("daily granted", daily.granted, "true");

        await flushDirtyProfiles(true);
        const row = await getUserGuildProfile(userId, guildId);
        check("daily xp persisted", row?.xp, String(config.xp.dailyXp));

        // The daily reward is added to the balance the writer left behind, not
        // to the stale one read before it landed.
        check("gold is the concurrent write plus the daily reward",
            row?.gold, String(777 + config.xp.dailyGold));
        check("the concurrent inventory write persisted", row?.inventory?.potion?.quantity, "1");
    });

    // ─── Trades ───────────────────────────────────────────────────────────────

    await test("trade swaps items and gold both ways", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, inv([["potion", 3]]), 500);
        await seed(fx.b, g, inv([["sword", 1]]), 200);

        const tradeId = await offer(fx, fx.a, fx.b, {
            askerItems: { potion: 2 }, askerGold: 100,
            receiverItems: { sword: 1 }, receiverGold: 50,
        });

        const res = await acceptTrade(tradeId, await row(fx.b, g), fx.guild);
        check("accept succeeded", res.success, "true");

        check("asker kept the untraded potion", await qty(fx.a, g, "potion"), 1);
        check("asker received the sword", await qty(fx.a, g, "sword"), 1);
        check("asker gold = 500 - 100 + 50", await goldOf(fx.a, g), "450");

        check("receiver gained both potions", await qty(fx.b, g, "potion"), 2);
        check("receiver gave up the sword", await qty(fx.b, g, "sword"), 0);
        check("receiver gold = 200 - 50 + 100", await goldOf(fx.b, g), "250");

        check("trade marked accepted", await tradeStatus(tradeId), "accepted");
    });

    await test("post-trade reads are not served stale from cache", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, inv([["potion", 2]]), 100);
        await seed(fx.b, g, {}, 100);

        // Warm both cache entries so the trade has something stale to invalidate.
        await getOrCreateProfile({ userId: fx.a.userId, guildId: g });
        await getOrCreateProfile({ userId: fx.b.userId, guildId: g });

        const tradeId = await offer(fx, fx.a, fx.b, { askerItems: { potion: 2 }, askerGold: 40 });
        await acceptTrade(tradeId, await row(fx.b, g), fx.guild);

        const askerCached = await getOrCreateProfile({ userId: fx.a.userId, guildId: g });
        const receiverCached = await getOrCreateProfile({ userId: fx.b.userId, guildId: g });

        check("asker cache shows the debit", askerCached.profile.gold, "60");
        check("asker cache lost the potions", askerCached.profile.inventory?.potion?.quantity ?? 0, 0);
        check("receiver cache shows the credit", receiverCached.profile.gold, "140");
        check("receiver cache has the potions", receiverCached.profile.inventory?.potion?.quantity ?? 0, 2);
    });

    await test("an offer is re-checked against writes still buffered in cache", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, inv([["potion", 2]]), 100);
        await seed(fx.b, g, {}, 100);

        const tradeId = await offer(fx, fx.a, fx.b, { askerItems: { potion: 2 } });

        // The asker spends a potion. This lands in the write-back cache only --
        // Postgres still shows 2. Without the pre-transaction flush, the trade
        // would validate against the stale row and hand over an item the asker
        // no longer has.
        await updateInventory(fx.a.userId, g, inv([["potion", 1]]), 100);
        check("DB is still behind the cache", await qty(fx.a, g, "potion"), 2);

        const res = await acceptTrade(tradeId, await row(fx.b, g), fx.guild);
        check("accept refused", res.success, "false");
        check("refusal names the item", res.message.includes("potion"), "true");
        check("receiver got nothing", await qty(fx.b, g, "potion"), 0);
        check("trade left pending", await tradeStatus(tradeId), "pending");
    });

    await test("an offer is re-checked against gold spent since it was made", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, {}, 500);
        await seed(fx.b, g, {}, 100);

        const tradeId = await offer(fx, fx.a, fx.b, { askerGold: 400 });

        await updateInventory(fx.a.userId, g, {}, 50); // asker spends down to 50
        const res = await acceptTrade(tradeId, await row(fx.b, g), fx.guild);

        check("accept refused", res.success, "false");
        check("receiver gold untouched", await goldOf(fx.b, g), "100");
        check("asker gold untouched", await goldOf(fx.a, g), "50");
        check("trade left pending", await tradeStatus(tradeId), "pending");
    });

    await test("two simultaneous accepts apply the trade exactly once", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, inv([["potion", 5]]), 300);
        await seed(fx.b, g, {}, 0);

        const tradeId = await offer(fx, fx.a, fx.b, { askerItems: { potion: 2 }, askerGold: 100 });
        const acceptor = await row(fx.b, g);

        const results = await Promise.all([
            acceptTrade(tradeId, acceptor, fx.guild),
            acceptTrade(tradeId, acceptor, fx.guild),
        ]);

        check("exactly one accept won", results.filter(r => r.success).length, 1);
        check("asker debited once", await qty(fx.a, g, "potion"), 3);
        check("receiver credited once", await qty(fx.b, g, "potion"), 2);
        check("gold moved once", await goldOf(fx.b, g), "100");
    });

    await test("crossing offers between the same pair do not deadlock", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, inv([["potion", 4]]), 300);
        await seed(fx.b, g, inv([["sword", 2]]), 300);

        // trades_one_pending_per_pair is keyed on (asker, receiver) in order, so
        // A->B and B->A can both be open. Accepted at once they lock the same two
        // profile rows from two transactions -- the ABBA deadlock the ascending
        // lock order in acceptTrade exists to prevent.
        const aToB = await offer(fx, fx.a, fx.b, { askerItems: { potion: 1 }, receiverItems: { sword: 1 } });
        const bToA = await offer(fx, fx.b, fx.a, { askerItems: { sword: 1 }, receiverItems: { potion: 1 } });

        const [r1, r2] = await Promise.all([
            acceptTrade(aToB, await row(fx.b, g), fx.guild),
            acceptTrade(bToA, await row(fx.a, g), fx.guild),
        ]);

        check("A->B accepted", r1!.success, "true");
        check("B->A accepted", r2!.success, "true");
        check("asker net potions 4 - 2", await qty(fx.a, g, "potion"), 2);
        check("asker net swords 0 + 2", await qty(fx.a, g, "sword"), 2);
        check("receiver net swords 2 - 2", await qty(fx.b, g, "sword"), 0);
        check("receiver net potions 0 + 2", await qty(fx.b, g, "potion"), 2);
    });

    await test("a received item the user never owned is built from shop metadata", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, inv([["sword", 1]]), 0);
        await seed(fx.b, g, {}, 0);

        const tradeId = await offer(fx, fx.a, fx.b, { askerItems: { sword: 1 } });
        await acceptTrade(tradeId, await row(fx.b, g), fx.guild);

        const slot = (await row(fx.b, g)).inventory?.sword;
        check("name from shop config", slot?.name, "Iron Sword");
        check("emoji from shop config", slot?.emoji, "⚔️");
        check("description from shop config", slot?.description, "Pointy.");
    });

    await test("an item pulled from the shop still transfers, named by its id", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        // `ghost` is in the inventory but not in SHOP_ITEMS -- the shape you get
        // when an admin deletes a shop item people already own.
        await seed(fx.a, g, inv([["ghost", 1]]), 0);
        await seed(fx.b, g, {}, 0);

        const tradeId = await rawOffer(fx, fx.a, fx.b, { askerItems: { ghost: 1 } });
        const res = await acceptTrade(tradeId, await row(fx.b, g), fx.guild);

        check("accept succeeded", res.success, "true");
        check("receiver got the orphaned item", await qty(fx.b, g, "ghost"), 1);
        check("name fell back to the id", (await row(fx.b, g)).inventory?.ghost?.name, "ghost");
    });

    await test("an expired offer is refused and marked expired", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, inv([["potion", 1]]), 0);
        await seed(fx.b, g, {}, 0);

        const tradeId = await rawOffer(fx, fx.a, fx.b, {
            askerItems: { potion: 1 },
            expiresAt: new Date(Date.now() - 60_000),
        });

        const res = await acceptTrade(tradeId, await row(fx.b, g), fx.guild);
        check("accept refused", res.success, "false");
        check("status flipped to expired", await tradeStatus(tradeId), "expired");
        check("nothing moved", await qty(fx.b, g, "potion"), 0);
    });

    await test("only the named receiver can accept", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, inv([["potion", 1]]), 0);
        await seed(fx.b, g, {}, 0);
        await seed(fx.c, g, {}, 0);

        const tradeId = await offer(fx, fx.a, fx.b, { askerItems: { potion: 1 } });
        const res = await acceptTrade(tradeId, await row(fx.c, g), fx.guild);

        check("third party refused", res.success, "false");
        check("trade left pending", await tradeStatus(tradeId), "pending");
        check("bystander got nothing", await qty(fx.c, g, "potion"), 0);
    });

    await test("deny and cancel write the statuses the enum declares", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, inv([["potion", 2]]), 0);
        await seed(fx.b, g, {}, 0);

        const denied = await offer(fx, fx.a, fx.b, { askerItems: { potion: 1 } });
        const denyRes = await denyTrade(denied, String(fx.b.profileId));
        check("deny succeeded", denyRes.success, "true");
        check("status is denied", await tradeStatus(denied), "denied");

        // 'canceled', one L -- must match the trade_status enum in schema.sql.
        const canceled = await offer(fx, fx.a, fx.b, { askerItems: { potion: 1 } });
        const cancelRes = await cancelTrade(canceled, String(fx.a.profileId));
        check("cancel succeeded", cancelRes.success, "true");
        check("status is canceled", await tradeStatus(canceled), "canceled");

        check("neither resolution moved items", await qty(fx.b, g, "potion"), 0);
    });

    await test("a trade does not clobber XP still buffered in the cache", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, inv([["potion", 1]]), 100);
        await seed(fx.b, g, {}, 100);

        const config = mergeConfig(fx.guild.config);
        config.xp.basePerMessage = 10;
        config.xp.xpMessageCooldown = 0;
        config.logging.enabled = false;

        // XP earned seconds before the trade lives only in the cache. The trade
        // writes the profile row directly, so it has to be flushed down first or
        // the UPDATE overwrites it.
        await addMessageXp({ userId: fx.a.userId, guildId: g, config });
        check("XP is buffered, not yet persisted", (await row(fx.a, g)).xp, "0");

        const tradeId = await offer(fx, fx.a, fx.b, { askerItems: { potion: 1 } });
        const res = await acceptTrade(tradeId, await row(fx.b, g), fx.guild);
        check("accept succeeded", res.success, "true");

        check("buffered XP survived the trade", (await row(fx.a, g)).xp, "10");
        check("the trade itself still applied", await qty(fx.b, g, "potion"), 1);
    });

    // ─── Inventory writes ─────────────────────────────────────────────────────

    await test("an inventory write leaves gold alone unless asked to change it", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, inv([["potion", 2]]), 500);
        await seed(fx.b, g, inv([["sword", 1]]), 700);

        // What /removeitem does: take an item away, touch nothing else. It used
        // to pass a hardcoded 0 here, and a profile id in place of a user id, so
        // it wiped the gold of whichever user happened to hold that id.
        await updateInventory(fx.a.userId, g, inv([["potion", 1]]));
        await flushDirtyProfiles(true);

        check("item was removed", await qty(fx.a, g, "potion"), 1);
        check("gold untouched", await goldOf(fx.a, g), "500");
        check("bystander's gold untouched", await goldOf(fx.b, g), "700");
        check("bystander's items untouched", await qty(fx.b, g, "sword"), 1);
    });

    await test("an inventory write still updates gold when given a balance", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, inv([["potion", 1]]), 500);

        // The shop purchase path, which does mean to move both.
        await updateInventory(fx.a.userId, g, inv([["potion", 3]]), 250);
        await flushDirtyProfiles(true);

        check("items updated", await qty(fx.a, g, "potion"), 3);
        check("gold updated", await goldOf(fx.a, g), "250");
    });

    // ─── Gifting ──────────────────────────────────────────────────────────────

    await test("a gift moves items and touches neither side's gold", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, inv([["potion", 3]]), 500);
        await seed(fx.b, g, {}, 700);

        const config = mergeConfig(fx.guild.config);
        const res = await transferItem(await row(fx.a, g), await row(fx.b, g), "potion", 2, config);

        check("gift succeeded", res.success, "true");
        check("giver debited", await qty(fx.a, g, "potion"), 1);
        check("receiver credited", await qty(fx.b, g, "potion"), 2);
        check("giver gold untouched", await goldOf(fx.a, g), "500");
        check("receiver gold untouched", await goldOf(fx.b, g), "700");
        check("receiver slot named from shop config", (await row(fx.b, g)).inventory?.potion?.name, "Health Potion");
    });

    await test("two simultaneous gifts cannot overdraw the same stack", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, inv([["potion", 1]]), 0);
        await seed(fx.b, g, {}, 0);
        await seed(fx.c, g, {}, 0);

        const config = mergeConfig(fx.guild.config);
        const giver = await row(fx.a, g);

        // One potion, two gifts of it going to different people at once.
        const results = await Promise.all([
            transferItem(giver, await row(fx.b, g), "potion", 1, config),
            transferItem(giver, await row(fx.c, g), "potion", 1, config),
        ]);

        check("exactly one gift landed", results.filter(r => r.success).length, 1);
        check("giver has nothing left", await qty(fx.a, g, "potion"), 0);
        check("only one potion exists downstream",
            (await qty(fx.b, g, "potion")) + (await qty(fx.c, g, "potion")), 1);
    });

    await test("a gift is re-checked against writes still buffered in cache", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, inv([["potion", 2]]), 0);
        await seed(fx.b, g, {}, 0);

        const giver = await row(fx.a, g);
        await updateInventory(fx.a.userId, g, inv([["potion", 1]])); // cache only
        check("DB is still behind the cache", await qty(fx.a, g, "potion"), 2);

        const config = mergeConfig(fx.guild.config);
        const res = await transferItem(giver, await row(fx.b, g), "potion", 2, config);

        check("gift refused", res.success, "false");
        check("receiver got nothing", await qty(fx.b, g, "potion"), 0);
        check("giver keeps what they had", await qty(fx.a, g, "potion"), 1);
    });

    await test("gifting to yourself is refused rather than duplicating the stack", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, inv([["potion", 2]]), 0);

        const self = await row(fx.a, g);
        const config = mergeConfig(fx.guild.config);
        const res = await transferItem(self, self, "potion", 2, config);

        check("gift refused", res.success, "false");
        check("stack unchanged", await qty(fx.a, g, "potion"), 2);
    });

    await test("a gift larger than the stack is refused", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, inv([["potion", 1]]), 0);
        await seed(fx.b, g, {}, 0);

        const config = mergeConfig(fx.guild.config);
        const res = await transferItem(await row(fx.a, g), await row(fx.b, g), "potion", 5, config);

        check("gift refused", res.success, "false");
        check("giver keeps the stack", await qty(fx.a, g, "potion"), 1);
        check("receiver got nothing", await qty(fx.b, g, "potion"), 0);
    });

    // ─── Shop purchases ───────────────────────────────────────────────────────

    await test("a purchase debits gold and credits the item", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, {}, 500);

        const res = await purchaseItem({
            userId: fx.a.userId, guildId: g,
            discordGuildId: fx.guild.discord_guild_id,
            itemId: "sword", quantity: 2,
        });

        check("purchase succeeded", res.success, "true");
        check("gold debited 2 x 100", await goldOf(fx.a, g), "300");
        check("items credited", await qty(fx.a, g, "sword"), 2);
        check("slot named from shop config", (await row(fx.a, g)).inventory?.sword?.name, "Iron Sword");
    });

    await test("gold cannot be spent twice by two purchases at once", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, {}, 100); // exactly one sword's worth

        const buy = () => purchaseItem({
            userId: fx.a.userId, guildId: g,
            discordGuildId: fx.guild.discord_guild_id,
            itemId: "sword", quantity: 1,
        });

        const results = await Promise.all([buy(), buy()]);

        check("exactly one purchase went through", results.filter(r => r.success).length, 1);
        check("charged once", await goldOf(fx.a, g), "0");
        check("delivered once", await qty(fx.a, g, "sword"), 1);
    });

    await test("limited stock cannot be oversold by simultaneous buyers", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await patchShopItem(fx, "sword", { stock: 1 });
        await seed(fx.a, g, {}, 500);
        await seed(fx.b, g, {}, 500);

        const results = await Promise.all([
            purchaseItem({ userId: fx.a.userId, guildId: g, discordGuildId: fx.guild.discord_guild_id, itemId: "sword", quantity: 1 }),
            purchaseItem({ userId: fx.b.userId, guildId: g, discordGuildId: fx.guild.discord_guild_id, itemId: "sword", quantity: 1 }),
        ]);

        check("exactly one buyer got it", results.filter(r => r.success).length, 1);
        check("stock landed on zero", await itemStock(fx, "sword"), "0");
        check("only one sword exists", (await qty(fx.a, g, "sword")) + (await qty(fx.b, g, "sword")), 1);
        check("the loser was not charged",
            (await goldOf(fx.a, g)) === "500" || (await goldOf(fx.b, g)) === "500", "true");
    });

    await test("stock decrements by the quantity bought, and unlimited stays unlimited", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await patchShopItem(fx, "sword", { stock: 5 });
        await seed(fx.a, g, {}, 500);

        await purchaseItem({ userId: fx.a.userId, guildId: g, discordGuildId: fx.guild.discord_guild_id, itemId: "sword", quantity: 3 });
        check("stock 5 - 3", await itemStock(fx, "sword"), "2");

        const tooMany = await purchaseItem({ userId: fx.a.userId, guildId: g, discordGuildId: fx.guild.discord_guild_id, itemId: "sword", quantity: 3 });
        check("buying past the stock is refused", tooMany.success, "false");
        check("stock unchanged after the refusal", await itemStock(fx, "sword"), "2");

        // potion has no stock key at all, which means unlimited.
        await purchaseItem({ userId: fx.a.userId, guildId: g, discordGuildId: fx.guild.discord_guild_id, itemId: "potion", quantity: 4 });
        check("unlimited item still has no stock", await itemStock(fx, "potion"), "null");
        check("unlimited item delivered", await qty(fx.a, g, "potion"), 4);
    });

    await test("a purchase is refused on gold, charging nothing; the level gate is a requirement", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, {}, 50);

        const broke = await purchaseItem({ userId: fx.a.userId, guildId: g, discordGuildId: fx.guild.discord_guild_id, itemId: "sword", quantity: 1 });
        check("too poor is refused", broke.success, "false");
        check("gold untouched", await goldOf(fx.a, g), "50");
        check("no item delivered", await qty(fx.a, g, "sword"), 0);

        // An item's level is a Combat level now, checked with its other requirements before
        // purchaseItem runs (buyItem in shop.ts), from the cache rather than the database row.
        const gate = checkRequirements(itemRequirements({ minLevel: 10 } as any), {
            profile: { xp: "0", level: 1, user_stats: {} } as any, config: DEFAULT_GUILD_CONFIG, facts: { roleIds: [], joinedAt: null, boosting: false },
        });
        check("under the level requirement is refused", gate.message, "Needs Combat 10.");
        check("still nothing charged", await goldOf(fx.a, g), "50");
    });

    await test("a purchase sees gold spent but still buffered in cache", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, {}, 500);

        // Spend down to 50 in the cache only; Postgres still shows 500.
        await updateInventory(fx.a.userId, g, {}, 50);
        check("DB is still behind the cache", await goldOf(fx.a, g), "500");

        const res = await purchaseItem({
            userId: fx.a.userId, guildId: g,
            discordGuildId: fx.guild.discord_guild_id,
            itemId: "sword", quantity: 1,
        });

        check("purchase refused against the real balance", res.success, "false");
        check("buffered balance survived", await goldOf(fx.a, g), "50");
        check("no item delivered", await qty(fx.a, g, "sword"), 0);
    });

    // ─── Combat ───────────────────────────────────────────────────────────────

    await test("a finished fight pays out once, however many clicks arrive", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, {}, 0);

        const config = mergeConfig(fx.guild.config);
        config.combat.enabled = true;
        config.logging.enabled = false;

        // One hit kills: 1 HP, no attack of its own.
        const enemy: EnemyConfig = {
            id: "dummy", name: "Training Dummy", emoji: "🎯",
            hp: 1, atk: 0, def: 0, spd: 1, critChance: 0, critMultiplier: 1,
            minLevel: 0, maxLevel: null,
            xpReward: 50, goldReward: 25, drops: [],
        };

        const profile = await row(fx.a, g);
        const fight = startFight({
            discordUserId: fx.a.discordId, discordGuildId: fx.guild.discord_guild_id,
            messageId: "smoke-fight-1", channelId: "smoke-channel",
            combatType: "pve", profile, enemy, config, loadout: ["attack"], name: "A",
        });

        const first = applyAction(fight, "basic_attack", fx.guild, profile, config);
        check("first click ended the fight", first.ended, "true");
        check("first click produced a summary", first.summary !== null, "true");

        await applyFightRewards(first.summary!, first.fight, first.fight.members[0]!, profile, config);
        await flushDirtyProfiles(true);
        const afterFirst = await goldOf(fx.a, g);
        check("rewards paid once", afterFirst, "25");

        // The double-click: the handler captures the fight object before it
        // awaits, so a second click reaches applyAction holding the same object
        // even though the fight is no longer in the active map.
        const second = applyAction(fight, "basic_attack", fx.guild, profile, config);
        check("second click is rejected", second.alreadyResolved, "true");
        check("second click reports no end", second.ended, "false");
        check("second click has no summary", second.summary === null, "true");

        // Mirror the handler: it pays out whenever an action reports the fight
        // ended. Without the guard this is the second payout.
        if (second.ended && second.summary) {
            await applyFightRewards(second.summary, second.fight, second.fight.members[0]!, profile, config);
        }
        await flushDirtyProfiles(true);
        check("no second payout", await goldOf(fx.a, g), afterFirst);
    });

    await test("a fight payout does not erase a write that landed just before it", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, {}, 0);

        const config = mergeConfig(fx.guild.config);
        config.combat.enabled = true;
        config.logging.enabled = false;

        const enemy: EnemyConfig = {
            id: "dummy", name: "Training Dummy", emoji: "\u{1f3af}",
            hp: 1, atk: 0, def: 0, spd: 1, critChance: 0, critMultiplier: 1,
            minLevel: 0, maxLevel: null,
            xpReward: 50, goldReward: 25, drops: [],
        };

        const profile = await row(fx.a, g);
        const fight = startFight({
            discordUserId: fx.a.discordId, discordGuildId: fx.guild.discord_guild_id,
            messageId: "smoke-fight-2", channelId: "smoke-channel",
            combatType: "pve", profile, enemy, config, loadout: ["attack"], name: "A",
        });
        const first = applyAction(fight, "basic_attack", fx.guild, profile, config);

        // Warm the cache so neither call starts by loading the row.
        await getOrCreateProfile({ userId: fx.a.userId, guildId: g });

        // Both writers reach their commit after a single await, so they land in
        // call order: the inventory write buffers first, the fight payout second.
        // The payout used to write back a buffer snapshotted before the item
        // existed, so the item was never flushed.
        await Promise.all([
            updateInventory(fx.a.userId, g, inv([["potion", 1]])),
            applyFightRewards(first.summary!, first.fight, first.fight.members[0]!, profile, config),
        ]);

        await flushDirtyProfiles(true);
        const after = await row(fx.a, g);
        check("fight gold paid", after.gold, "25");
        check("fight XP is Combat XP, not chat XP", `${after.xp}|${after.user_stats?.combat?.xp}`, "0|50");
        check("the write that landed first survived", after.inventory?.potion?.quantity, 1);
        check("fight counters survived", after.user_stats?.fightsWon, 1);
    });


    // ─── Duels ────────────────────────────────────────────────────────────────

    await test("a duel moves the wager one way and takes the configured rake", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, {}, 1000);
        await seed(fx.b, g, {}, 1000);

        const config = mergeConfig(fx.guild.config);
        config.combat.enabled = true;
        config.logging.enabled = false;
        config.combat.pvp = { enabled: true, rakePercent: 10, maxRounds: 50 };

        const outcome = await resolveDuel({
            guildId: g,
            challenger: { userId: fx.a.userId, discordUserId: fx.a.discordId, displayName: "A" },
            opponent: { userId: fx.b.userId, discordUserId: fx.b.discordId, displayName: "B" },
            wager: 100n,
            config,
        });

        check("duel resolved", outcome.success, "true");
        if (!outcome.success) return;

        // 10% of a 200 pot is 20, so the winner nets +80 and the loser -100.
        check("rake taken from the pot", outcome.rake.toString(), "20");
        check("payout is the pot less the rake", outcome.payout.toString(), "180");

        const aGold = BigInt(await goldOf(fx.a, g));
        const bGold = BigInt(await goldOf(fx.b, g));

        check("winner is up 80", (aGold > 1000n ? aGold : bGold).toString(), "1080");
        check("loser is down 100", (aGold < 1000n ? aGold : bGold).toString(), "900");
        check("the rake left circulation", (aGold + bGold).toString(), "1980");
    });

    await test("a duel is refused when a stake is no longer covered", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, {}, 1000);
        await seed(fx.b, g, {}, 10);

        const config = mergeConfig(fx.guild.config);
        config.combat.enabled = true;
        config.logging.enabled = false;
        config.combat.pvp = { enabled: true };

        const outcome = await resolveDuel({
            guildId: g,
            challenger: { userId: fx.a.userId, discordUserId: fx.a.discordId, displayName: "A" },
            opponent: { userId: fx.b.userId, discordUserId: fx.b.discordId, displayName: "B" },
            wager: 100n,
            config,
        });

        check("refused", outcome.success, "false");
        check("challenger untouched", await goldOf(fx.a, g), "1000");
        check("opponent untouched", await goldOf(fx.b, g), "10");
    });

    await test("a duel sees gold spent but still buffered in cache", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, {}, 1000);
        await seed(fx.b, g, {}, 1000);

        const config = mergeConfig(fx.guild.config);
        config.combat.enabled = true;
        config.logging.enabled = false;
        config.combat.pvp = { enabled: true };

        // B spends almost everything, and it is still sitting in the write-back
        // cache when the duel is accepted.
        await updateInventory(fx.b.userId, g, {}, 50);
        check("DB is still behind the cache", await goldOf(fx.b, g), "1000");

        const outcome = await resolveDuel({
            guildId: g,
            challenger: { userId: fx.a.userId, discordUserId: fx.a.discordId, displayName: "A" },
            opponent: { userId: fx.b.userId, discordUserId: fx.b.discordId, displayName: "B" },
            wager: 100n,
            config,
        });

        check("refused against the real balance", outcome.success, "false");
        check("buffered balance survived", await goldOf(fx.b, g), "50");
    });

    await test("a friendly duel settles without moving gold", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, {}, 500);
        await seed(fx.b, g, {}, 500);

        const config = mergeConfig(fx.guild.config);
        config.combat.enabled = true;
        config.logging.enabled = false;
        config.combat.pvp = { enabled: true };

        const outcome = await resolveDuel({
            guildId: g,
            challenger: { userId: fx.a.userId, discordUserId: fx.a.discordId, displayName: "A" },
            opponent: { userId: fx.b.userId, discordUserId: fx.b.discordId, displayName: "B" },
            wager: 0n,
            config,
        });

        check("resolved", outcome.success, "true");
        check("challenger gold unchanged", await goldOf(fx.a, g), "500");
        check("opponent gold unchanged", await goldOf(fx.b, g), "500");

        // HP still carries out, so a duel is never entirely free.
        const after = await row(fx.a, g);
        check("hp was written back", typeof after.user_stats?.currentHp, "number");
    });

    await test("a duel fights at each side's Combat level", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, {}, 500);
        await seed(fx.b, g, {}, 500);
        // A at Combat 30 against B at Combat 1: A cannot lose unless duels ignore Combat XP.
        await query(
            `UPDATE user_guild_profiles SET user_stats = '{"combat":{"xp":24738}}' WHERE user_id = $1 AND guild_id = $2`,
            [fx.a.userId, g]
        );
        userGuildProfileCache.delete(profileKey(g, fx.a.userId));

        const config = mergeConfig(fx.guild.config);
        config.combat.enabled = true;
        config.logging.enabled = false;
        config.combat.pvp = { enabled: true };

        const outcome = await resolveDuel({
            guildId: g,
            challenger: { userId: fx.a.userId, discordUserId: fx.a.discordId, displayName: "A" },
            opponent: { userId: fx.b.userId, discordUserId: fx.b.discordId, displayName: "B" },
            wager: 0n,
            config,
        });
        check("the Combat 30 side won", outcome.success && outcome.result.winnerDiscordId, fx.a.discordId);
    });

    await test("the simulation always produces a winner or a declared draw", async () => {
        const side = (id: string, atk: number, def: number, spd: number, hp: number) => ({
            userId: 0,
            discordUserId: id,
            displayName: id,
            stats: { maxHp: hp, atk, def, spd, critChance: 0, critMultiplier: 1 },
            startingHp: hp,
        });

        const decisive = simulateDuel(side("a", 50, 0, 10, 100), side("b", 5, 0, 1, 30));
        check("someone won", decisive.draw, "false");
        check("the stronger side won", decisive.winnerDiscordId, "a");
        check("loser is on zero", decisive.opponentHp, 0);

        // Two walls: damage floors at 1 a hit, so the cap decides it.
        const stalemate = simulateDuel(
            side("a", 1, 999, 5, 10_000),
            side("b", 1, 999, 5, 10_000),
            { maxRounds: 5 }
        );
        check("hit the round cap", stalemate.draw, "true");
        check("no winner on a draw", String(stalemate.winnerDiscordId), "null");
        check("both sides still standing", stalemate.challengerHp > 0 && stalemate.opponentHp > 0, "true");
    });

    await test("the pot split never pays out more than the pot", async () => {
        check("no rake", splitPot(200n, 0).payout.toString(), "200");
        check("10% rake", splitPot(200n, 10).rake.toString(), "20");
        check("fractional rake rounds down", splitPot(101n, 10).rake.toString(), "10");
        check("a full rake leaves nothing", splitPot(200n, 100).payout.toString(), "0");
        check("a negative rake is clamped", splitPot(200n, -5).payout.toString(), "200");
        check("payout plus rake is the pot", (splitPot(777n, 33).payout + splitPot(777n, 33).rake).toString(), "777");
    });


    await test("the duel cooldown blocks a rematch until it lapses", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, {}, 1000);
        await seed(fx.b, g, {}, 1000);

        const config = mergeConfig(fx.guild.config);
        config.combat.enabled = true;
        config.logging.enabled = false;
        config.combat.pvp = { enabled: true, cooldownSeconds: 300 };

        const duel = () => resolveDuel({
            guildId: g,
            challenger: { userId: fx.a.userId, discordUserId: fx.a.discordId, displayName: "A" },
            opponent: { userId: fx.b.userId, discordUserId: fx.b.discordId, displayName: "B" },
            wager: 50n,
            config,
        });

        const first = await duel();
        check("first duel resolved", first.success, "true");

        const second = await duel();
        check("rematch refused", second.success, "false");
        if (!second.success) {
            check("refusal names the wait", /\d+s left/.test(second.message), "true");
        }

        // Only one payout happened, so the pot did not move twice.
        const total = BigInt(await goldOf(fx.a, g)) + BigInt(await goldOf(fx.b, g));
        check("gold moved exactly once", total.toString(), "2000");

        // Age the stored timestamp past the window, and heal both (the loser is
        // at 0 HP, which now blocks a duel on its own); the rematch is allowed again.
        await query(
            `UPDATE user_guild_profiles
             SET user_stats = jsonb_set(user_stats, '{lastDuelAt}', to_jsonb($3::text)) - 'currentHp'
             WHERE guild_id = $1 AND user_id = ANY($2::bigint[])`,
            [g, [fx.a.userId, fx.b.userId], new Date(Date.now() - 600_000).toISOString()]
        );
        userGuildProfileCache.clear();

        const third = await duel();
        check("allowed once the cooldown lapsed", third.success, "true");
    });

    await test("a duel records who won and when", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, {}, 500);
        await seed(fx.b, g, {}, 500);

        const config = mergeConfig(fx.guild.config);
        config.combat.enabled = true;
        config.logging.enabled = false;
        config.combat.pvp = { enabled: true };

        const outcome = await resolveDuel({
            guildId: g,
            challenger: { userId: fx.a.userId, discordUserId: fx.a.discordId, displayName: "A" },
            opponent: { userId: fx.b.userId, discordUserId: fx.b.discordId, displayName: "B" },
            wager: 0n,
            config,
        });
        check("resolved", outcome.success, "true");

        const a = (await row(fx.a, g)).user_stats as any;
        const b = (await row(fx.b, g)).user_stats as any;

        check("both sides stamped", Boolean(a.lastDuelAt && b.lastDuelAt), "true");
        check("exactly one win recorded", (a.duelsWon ?? 0) + (b.duelsWon ?? 0), 1);
        check("exactly one loss recorded", (a.duelsLost ?? 0) + (b.duelsLost ?? 0), 1);
    });

    await test("being removed from a guild keeps every profile intact", async () => {
        const { userId, guildId, config } = await reset();

        await addMessageXp({ userId, guildId, config });
        await flushDirtyProfiles(true);

        // Counted before and after rather than asserted as a fixed number:
        // earlier tests leave their own profiles in this guild.
        const profilesBefore = await profileCount(guildId);

        await markGuildRemoved(TEST_DISCORD_GUILD);

        const guild = await getGuildByDiscordId(TEST_DISCORD_GUILD);
        check("guild row survives the removal", Boolean(guild), "true");
        check("removal is stamped", Boolean(guild?.removed_at), "true");

        // The whole point of a soft delete: a kick must not cascade the guild's
        // progression away, because kicking and re-adding the bot is a normal
        // thing for a server admin to do.
        check("every profile is still there", await profileCount(guildId), profilesBefore);
        check("and still holds its xp", await xpInDb(userId, guildId), 10);
    });

    await test("re-adding the bot clears the removal and restores the config", async () => {
        const { guildId } = await reset();

        const before = mergeConfig((await getGuildByDiscordId(TEST_DISCORD_GUILD))!.config);
        before.xp.basePerMessage = 77;
        await setGuildConfig(TEST_DISCORD_GUILD, before);

        await markGuildRemoved(TEST_DISCORD_GUILD);

        // What the GuildCreate handler does on a rejoin.
        const rejoined = await upsertGuild({ discordGuildId: TEST_DISCORD_GUILD, name: "smoke-test-guild" });

        check("same guild row, not a new one", rejoined.id, guildId);
        check("no longer flagged as removed", rejoined.removed_at, null);
        check("the server's settings came back", mergeConfig(rejoined.config).xp.basePerMessage, 77);
    });

    await test("a DATABASE_URL pasted with its .env quotes is refused at startup", async () => {
        const url = "postgresql://u:secret@ep-x-pooler.c-2.us-east-2.aws.neon.tech/db?sslmode=require&channel_binding=require";

        check("bare postgresql:// accepted", databaseUrlProblem(url), null);
        check("bare postgres:// accepted", databaseUrlProblem("postgres://u:p@localhost:5432/havocish"), null);
        check("double-quoted refused", databaseUrlProblem(`"${url}"`) !== null, true);
        check("single-quoted refused", databaseUrlProblem(`'${url}'`) !== null, true);
        check("leading whitespace refused (pg reads it as host `base` too)", databaseUrlProblem(` ${url}`) !== null, true);
        check("trailing newline accepted (pg ignores it)", databaseUrlProblem(`${url}\n`), null);
        check("wrong scheme refused", databaseUrlProblem("mysql://u:p@localhost/havocish") !== null, true);
        check("error never echoes the password", databaseUrlProblem(`"${url}"`)!.includes("secret"), false);
    });

    await test("every level-up fires once, from whatever XP source", async () => {
        const { userId, guildId, config } = await reset();
        const fired: Array<{ fromLevel: number; toLevel: number }> = [];
        const listener = (e: { fromLevel: number; toLevel: number }) => fired.push(e);
        profileEvents.on("levelUp", listener);
        try {
            const start = (await getOrCreateProfile({ userId, guildId })).profile.level;
            await addMessageXp({ userId, guildId, config, amount: calculateTotalXpForLevel(3, config) });
            check("one event for a jump", fired.length, 1);
            check("it spans every level crossed", `${fired[0]?.fromLevel}->${fired[0]?.toLevel}`, `${start}->3`);

            await addMessageXp({ userId, guildId, config, amount: 1 });
            check("XP without a new level fires nothing", fired.length, 1);

            // A reload is not a level-up.
            await flushDirtyProfiles(true);
            userGuildProfileCache.delete(profileKey(guildId, userId));
            await getOrCreateProfile({ userId, guildId });
            await addMessageXp({ userId, guildId, config, amount: 1 });
            check("reloading the profile fires nothing", fired.length, 1);
        } finally {
            profileEvents.off("levelUp", listener);
        }
    });

    await test("selling an item pays its sell price and stops at the last copy", async () => {
        const { userId, guildId, config } = await reset();
        config.shop.items = {
            ...config.shop.items,
            gem: { id: "gem", name: "Gem", categoryId: "misc", price: 50, sellPrice: 20 },
            junk: { id: "junk", name: "Junk", categoryId: "misc", price: 5 },
        };
        await setGuildConfig(TEST_DISCORD_GUILD, config);
        guildConfigCache.clear();

        await updateInventory(userId, guildId, {
            gem: { id: "gem", name: "Gem", emoji: "", description: "", quantity: 2 },
            junk: { id: "junk", name: "Junk", emoji: "", description: "", quantity: 1 },
        });
        const interaction = { guild: { id: TEST_DISCORD_GUILD }, user: { id: TEST_DISCORD_USER } } as any;

        check("first sale succeeds", (await sellItemFromInventory(interaction, "gem")).success, true);
        check("second sale succeeds", (await sellItemFromInventory(interaction, "gem")).success, true);
        check("no third copy to sell", (await sellItemFromInventory(interaction, "gem")).success, false);
        check("an item without a sell price is refused", (await sellItemFromInventory(interaction, "junk")).success, false);

        const { profile } = await getOrCreateProfile({ userId, guildId });
        check("paid twice", profile.gold, "40");
        check("the last copy left the bag", profile.inventory["gem"] === undefined, true);
        check("unsellable item kept", profile.inventory["junk"]?.quantity, 1);

        await flushDirtyProfiles(true);
        const row = await query<{ gold: string }>(`SELECT gold FROM user_guild_profiles WHERE user_id = $1 AND guild_id = $2`, [userId, guildId]);
        check("gold persisted", row.rows[0]?.gold, "40");
    });

    await test("chat level adds a small bonus on top of Combat stats", async () => {
        const cfg = DEFAULT_GUILD_CONFIG;
        const chat1 = calculateStats({ level: 1, user_stats: {} } as any, cfg, {});
        const chat41 = calculateStats({ level: 41, user_stats: {} } as any, cfg, {});
        // At Combat 1 only 7 chat levels count (5 + twice the Combat level): no skipping the early game.
        check("a chat-41 regular at Combat 1 gets 7 levels' worth", [chat41.maxHp - chat1.maxHp, chat41.atk - chat1.atk], [12, 3]);
        const veteran = { level: 41, user_stats: {} } as any;
        addCombatXp(veteran, cfg, combatXpForLevel(18, cfg));
        const combat18 = { level: 1, user_stats: {} } as any;
        addCombatXp(combat18, cfg, combatXpForLevel(18, cfg));
        check("by Combat 18 all 40 count: 80 HP, 20 attack", [calculateStats(veteran, cfg, {}).maxHp - calculateStats(combat18, cfg, {}).maxHp, calculateStats(veteran, cfg, {}).atk - calculateStats(combat18, cfg, {}).atk], [80, 20]);
        const off = { ...cfg, combat: { ...cfg.combat, chatBonus: { hp: 0, atk: 0 } } };
        check("an owner can turn it off", calculateStats({ level: 41, user_stats: {} } as any, off, {}).maxHp, chat1.maxHp - 2);
    });

    await test("combat: its own level and curve, split once from chat level", async () => {
        const cfg = DEFAULT_GUILD_CONFIG;
        const p = { xp: "999999", level: 40, user_stats: {} } as any;
        check("no Combat XP means Combat 1, whatever the chat level", combatLevel(p, cfg), 1);
        const weak = calculateStats(p, cfg, {}).atk;
        const up = addCombatXp(p, cfg, 1885);
        check("Combat XP is stored on its own", p.user_stats.combat.xp, 1885);
        check("chat XP is untouched", p.xp, "999999");
        check("1885 Combat XP reaches Combat 10 on the fighting curve", combatLevel(p, cfg), 10);
        check("the level-up is reported", up.after > up.before, true);
        check("stats grow with Combat level", calculateStats(p, cfg, {}).atk > weak, true);
        addCombatXp(p, cfg, -999999);
        check("Combat XP never goes below 0", p.user_stats.combat.xp, 0);
        p.user_stats.combat.xp = combatXpForLevel(37, cfg);
        check("/admin set combat lands on the level asked for", combatLevel(p, cfg), 37);
        check("and stops at the cap", (p.user_stats.combat.xp = combatXpForLevel(500, cfg), combatLevel(p, cfg)), 99);
        check("/admin set skill does the same on the skill curve", skillLevel(skillXpForLevel(12, cfg), cfg), 12);

        // The one-time split: pre-split rows get the Combat level of their chat level; new rows start at 0.
        const { userId, guildId } = await reset();
        check("a new profile starts with Combat XP 0", (await getOrCreateProfile({ userId, guildId })).profile.user_stats?.combat?.xp, 0);
        await flushDirtyProfiles(true);
        userGuildProfileCache.clear();
        await query(`UPDATE user_guild_profiles SET level = 30, user_stats = user_stats - 'combat' WHERE user_id = $1 AND guild_id = $2`, [userId, guildId]);
        await convertLegacyCombat();
        const converted = (await getOrCreateProfile({ userId, guildId })).profile;
        check("a pre-split member starts at the Combat level of their chat level", combatLevel(converted, cfg), 30);
        check("running the split again changes nothing", await convertLegacyCombat(), 0);
    });

    await test("requirements: one check for every gate", async () => {
        const config = { ...DEFAULT_GUILD_CONFIG, gathering: { ...DEFAULT_GUILD_CONFIG.gathering, activities: { mining: { id: "mining", skillName: "Mining" } } } } as any;
        const profile = { level: 5, user_stats: { gathering: { mining: { xp: 0 } } } } as any;
        const now = Date.parse("2026-10-19T00:00:00Z");
        const facts = { roleIds: ["vet"], joinedAt: now - 40 * 86_400_000, boosting: false };
        const ok = (req: any) => checkRequirements(req, { profile, config, facts, now });

        check("no requirements pass", ok(undefined).ok, true);
        check("chat level", ok({ chatLevel: 6 }).message, "Needs chat level 6.");
        check("combat level (carried over from chat XP)", ok({ combatLevel: 99 }).message, "Needs Combat 99.");
        check("a role from any bot", ok({ roles: ["vet"] }).ok, true);
        check("any one of several roles", ok({ roles: ["x", "vet"] }).ok, true);
        check("a missing role is named", ok({ roles: ["x"] }).message, "Needs the <@&x> role.");
        check("membership age", ok({ memberDays: 30 }).ok && !ok({ memberDays: 60 }).ok, true);
        check("booster", ok({ booster: true }).message, "Needs boosting the server.");
        check("a skill", ok({ skills: { mining: 15 } }).message, "Needs Mining 15.");
        check("a deleted skill fails open", ok({ skills: { gone: 99 } }).ok, true);
        check("several missing read as a list", ok({ chatLevel: 9, booster: true, roles: ["x"] }).message, "Needs chat level 9, the <@&x> role and boosting the server.");
        check("an item's old level folds in as Combat", JSON.stringify(itemRequirements({ minLevel: 3, requiresRoleIds: ["r"] } as any)), JSON.stringify({ combatLevel: 3, roles: ["r"] }));
    });

    await test("rare finds are announced at or above the chosen rarity", async () => {
        const cfg = structuredClone(DEFAULT_GUILD_CONFIG);
        cfg.shop.items = {
            pebble: { id: "pebble", name: "Pebble", rarity: "common", categoryId: "", price: 0 },
            shard: { id: "shard", name: "Starmetal Shard", emoji: "🌠", rarity: "epic", categoryId: "", price: 0 },
            crown: { id: "crown", name: "Crown", emoji: "👑", rarity: "legendary", categoryId: "", price: 0 },
        } as any;
        const sent: string[] = [];
        const channel = { isTextBased: () => true, isSendable: () => true, send: async (m: { content: string }) => { sent.push(m.content); } };
        const client = { channels: { fetch: async () => channel } } as any;
        const find = (items: { itemId: string; quantity: number }[]) =>
            announceRareFinds({ client, config: cfg, discordUserId: "u1", items, verb: "found", where: "at Deep Veins" });

        await find([{ itemId: "shard", quantity: 1 }]);
        check("off until a channel is set", sent.length, 0);
        cfg.rareFinds = { channelId: "c1" };
        await find([{ itemId: "pebble", quantity: 3 }]);
        check("common finds stay quiet (default: epic and up)", sent.length, 0);
        await find([{ itemId: "pebble", quantity: 3 }, { itemId: "shard", quantity: 1 }, { itemId: "crown", quantity: 2 }]);
        check("only the rare ones, in one post", sent[0], "✨ <@u1> found 🌠 **Starmetal Shard** and 👑 **Crown** ×2 at Deep Veins!");
        cfg.rareFinds = { channelId: "c1", minRarity: "legendary" };
        await find([{ itemId: "shard", quantity: 1 }]);
        check("a higher bar skips epics", sent.length, 1);
    });

    await test("role rewards pay once per member per role", async () => {
        const ids = await reset();
        const config = ids.config;
        config.shop = { ...config.shop, items: { badge: { id: "badge", name: "Badge", categoryId: "", price: 0 } } } as any;
        config.roleRewards = { roles: {
            lvl10: [{ type: "giveGold", amount: 250 }, { type: "giveItem", itemId: "badge" }],
            lvl20: [{ type: "giveCombatXp", amount: 1885 }],
            onlyMessage: [{ type: "sendMessage", message: "hi" }],
        } };
        const p = (await getOrCreateProfile({ userId: ids.userId, guildId: ids.guildId })).profile;
        p.gold = "0";
        const grant = (roleIds: string[]) => grantRoleRewards({ userId: ids.userId, guildId: ids.guildId, config, roleIds });

        const first = await grant(["everyone", "lvl10", "onlyMessage"]);
        check("only the rewarded role pays", first.map((r) => r.roleId).join(","), "lvl10");
        check("and says what it gave", first[0]?.given.join(", "), "+250 Gold, 1× Badge");
        check("having it still pays nothing more", (await grant(["lvl10"])).length, 0);
        const both = await grant(["lvl10", "lvl20"]);
        check("a new role pays just itself", both.map((r) => r.roleId).join(","), "lvl20");
        const after = (await getOrCreateProfile({ userId: ids.userId, guildId: ids.guildId })).profile;
        check("gold once", after.gold, "250");
        check("Combat XP once", after.user_stats.combat?.xp, 1885);
        check("chat XP untouched", after.xp, p.xp);
        check("losing and regaining a role pays nothing", (await grant(["lvl20"])).length + (await grant(["lvl10", "lvl20"])).length, 0);
        check("an admin reset clears just that role", await resetRoleRewards({ userId: ids.userId, guildId: ids.guildId, roleId: "lvl10" }), 1);
        check("which then pays once more", (await grant(["lvl10", "lvl20"])).map((r) => r.roleId).join(","), "lvl10");
        check("resetting everything clears both", await resetRoleRewards({ userId: ids.userId, guildId: ids.guildId }), 2);
    });

    await test("RPG level-up cards: Combat every level, skills at milestones, both switchable", async () => {
        const cfg = structuredClone(DEFAULT_GUILD_CONFIG);
        const posted: string[] = [];
        const channel = { isTextBased: () => true, isSendable: () => true, send: async (m: { content: string }) => { posted.push(m.content); } };
        const user = { id: "u1", client: { channels: { fetch: async () => channel } }, displayName: "Tester", displayAvatarURL: () => "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" } as any;
        const card = (kind: "combat" | "skills", before: number, after: number) =>
            rpgLevelUpCard({ config: cfg, kind, user, label: kind === "combat" ? "Combat" : "Mining", before, after }).then((c) => !!c);
        check("Combat 4 → 5 gets a card", await card("combat", 4, 5), true);
        check("a skill 11 → 12 does not", await card("skills", 11, 12), false);
        check("a skill 9 → 10 does", await card("skills", 9, 10), true);
        check("a skill reaching its cap does", await card("skills", 48, 50), true);
        check("no level gained, no card", await card("combat", 5, 5), false);
        cfg.style.levelUpCards = { combat: false };
        check("an owner can turn Combat cards off", await card("combat", 4, 5), false);
        check("which leaves skill cards on", await card("skills", 9, 10), true);
        check("no channel set, no copy posted", posted.length, 0);
        cfg.style.levelUpCards = { channelId: "c1" };
        await card("skills", 9, 10);
        check("with a channel, a copy is posted there too", posted, ["🎉 <@u1> reached **Mining 10**!"]);
    });

    await test("level actions pay gold, items and Combat XP for every level crossed", async () => {
        const ids = await reset();
        const config = ids.config;
        config.shop = { ...config.shop, items: { potion: { id: "potion", name: "Potion", emoji: "🧪", categoryId: "", price: 0 } } } as any;
        config.levels.levelActions = {
            5: [{ type: "giveGold", amount: 100 }, { type: "assignRole", roleId: "r" }],
            6: [{ type: "giveItem", itemId: "potion", quantity: 2 }, { type: "giveItem", itemId: "gone" }],
            7: [{ type: "giveCombatXp", amount: 1885 }],
            9: [{ type: "giveGold", amount: 999 }],
        };
        const p = (await getOrCreateProfile({ userId: ids.userId, guildId: ids.guildId })).profile;
        p.gold = "10";
        const given = await grantLevelRewards({ userId: ids.userId, guildId: ids.guildId, config, fromLevel: 4, toLevel: 7 });
        const after = (await getOrCreateProfile({ userId: ids.userId, guildId: ids.guildId })).profile;
        check("gold from level 5, not level 9", after.gold, "110");
        check("items from level 6; a deleted item gives nothing", after.inventory.potion?.quantity, 2);
        check("Combat XP from level 7", after.user_stats.combat?.xp, 1885);
        check("chat XP untouched", after.xp, p.xp);
        check("the announcement lists it", given.join(", "), "+100 Gold, 2× 🧪 Potion, +1,885 ⚔️ Combat XP");
        check("no reward actions, nothing given", (await grantLevelRewards({ userId: ids.userId, guildId: ids.guildId, config, fromLevel: 9, toLevel: 10 })).length, 0);
    });

    await test("recipe scrolls teach a hidden recipe once", async () => {
        const cfg = structuredClone(DEFAULT_GUILD_CONFIG);
        cfg.shop.items = { ore: { id: "ore", name: "Ore", categoryId: "", price: 0 }, blade: { id: "blade", name: "Blade", categoryId: "", price: 0 } } as any;
        const secret = { id: "blade", inputs: [{ itemId: "ore", quantity: 1 }], output: { itemId: "blade", quantity: 1 }, minSkill: 1, skillXp: 5, hidden: true };
        cfg.crafting.stations = { smith: { id: "smith", name: "Smithing", emoji: "⚒️", skillName: "Smithing", enabled: true, style: "simple", recipes: { blade: secret } } } as any;
        const p = { user_stats: {}, inventory: {} } as any;

        check("a hidden recipe starts locked", recipeState(secret as any, p, cfg, 1, []).locked, "hidden");
        check("so the scroll has something to teach", recipeToLearn(p, cfg, "smith", "blade").status, "new");
        learnRecipe(p, "smith", "blade");
        const known = p.user_stats.crafting.smith.known;
        check("reading it records the recipe", known.join(","), "blade");
        check("and unlocks it", recipeState(secret as any, p, cfg, 1, known).locked, null);
        check("a second scroll has nothing left to teach", recipeToLearn(p, cfg, "smith", "blade").status, "known");
        check("a scroll for a deleted recipe teaches nothing", recipeToLearn(p, cfg, "smith", "gone").status, "missing");
        learnRecipe(p, "smith", "blade");
        check("learning twice doesn't duplicate it", p.user_stats.crafting.smith.known.length, 1);
    });

    await test("move scrolls teach a must-learn move once; statuses stack and change stats", async () => {
        const cfg = structuredClone(DEFAULT_GUILD_CONFIG);
        cfg.combat.moves = {
            ...DEFAULT_MOVES,
            cleave: { id: "cleave", name: "Cleave", emoji: "🪓", effects: [{ type: "hit", power: 1.5 }], players: { learned: true, requirements: { combatLevel: 50 } } },
            weaken: { id: "weaken", name: "Weaken", emoji: "🥀", effects: [{ type: "status", statusId: "weak", turns: 3 }], players: {} },
            venom: { id: "venom", name: "Venom", emoji: "🐍", effects: [{ type: "status", statusId: "venom", turns: 3 }], players: {} },
        };
        cfg.combat.statuses = {
            weak: { id: "weak", name: "Weakened", emoji: "🥀", hpPercentPerTurn: 0, stats: { atk: -50 } },
            venom: { id: "venom", name: "Venom", emoji: "🐍", hpPercentPerTurn: -5, maxStacks: 3 },
        };
        const p = { user_stats: {}, equips: {} } as any;
        const facts = { roleIds: [], joinedAt: null, boosting: false };

        check("a must-learn move isn't known yet", moveToLearn(p, cfg, "cleave").status, "new");
        check("so it isn't in the loadout", loadoutFor(p, cfg, facts).includes("cleave"), false);
        learnMove(p, "cleave");
        check("a move with no learning has nothing to teach", moveToLearn(p, cfg, "attack").status, "known");
        check("a scroll for a deleted move teaches nothing", moveToLearn(p, cfg, "gone").status, "missing");
        check("once learned, it's known", moveToLearn(p, cfg, "cleave").status, "known");
        check("but its requirements still apply", loadoutFor(p, cfg, facts).includes("cleave"), false);
        addCombatXp(p, cfg, combatXpForLevel(50, cfg));
        p.user_stats.moves.loadout = ["cleave"];
        check("met, it's usable", loadoutFor(p, cfg, facts)[0], "cleave");
        learnMove(p, "cleave");
        check("learning twice doesn't duplicate it", p.user_stats.moves.learned.length, 1);

        // A stat status: Weakened halves the enemy's attack while it's on.
        const fight = handFight({ name: "Ogre", moves: [{ moveId: "attack" }] }, {}, ["weaken", "venom"]);
        playTurn(fight, { u: { kind: "move", moveId: "weaken" } }, cfg);
        check("a weakened enemy hits for half", fight.members[0]!.hp, 95);
        // Venom stacks: one stack ticks 5, two stacks tick 10.
        playTurn(fight, { u: { kind: "move", moveId: "venom" } }, cfg);
        playTurn(fight, { u: { kind: "move", moveId: "venom" } }, cfg);
        check("a stacking status counts its stacks", [fight.foe.stacks?.venom, fight.enemyCurrentHp], [2, 85]);
        check("and says so", describeMove(cfg.combat.moves.venom!, cfg).does[0], "🐍 Venom on the target for 3 turns, stacking up to 3.");
    });

    await test("parties: joining, picks, the turn timer's default, knockouts and shares", async () => {
        const cfg = structuredClone(DEFAULT_GUILD_CONFIG);
        const ally = (id: string, hp = 100): FightMember => ({
            userId: id, dbUserId: 0, name: id.toUpperCase(), stats: { maxHp: 100, atk: 20, def: 0, spd: 5, critChance: 0, critMultiplier: 1.5 },
            hp, state: newFighterState(), loadout: ["attack", "heavy", "guard"], dealt: 0, taken: 0,
        });
        const fight = handFight({ hp: 100, atk: 10, xpReward: 100, goldReward: 40, moves: [{ moveId: "attack" }], drops: [{ itemId: "pelt", chance: 1, quantity: 1 }] });
        check("anyone can join an open fight", cantJoin(fight, "b", cfg), null);
        joinFight(fight, ally("b"), cfg);
        check("each extra player adds the enemy's HP again", [fight.enemyMaxHp, fight.enemyCurrentHp], [200, 200]);
        joinFight(fight, ally("c"), cfg);
        check("three is the cap", cantJoin(fight, "d", cfg), "This fight is full (3 players).");
        check("you can't join twice", cantJoin(handFight({}), "u", cfg), "You're already in this fight.");
        check("an enemy can be solo only", cantJoin(handFight({ party: false }), "b", cfg), "This fight is solo only.");
        cfg.combat.party = { enabled: false };
        check("and so can the whole server", cantJoin(handFight({}), "b", cfg), "This fight is solo only.");
        delete cfg.combat.party;

        fight.enemyTarget = "b";
        check("the warning says who it's aimed at", intentLine(fight, cfg).includes("(at B)"), true);
        check("a pick waits for the others", [submitPick(fight, "u", "move:attack", cfg).refused, everyonePicked(fight)], [undefined, false]);
        submitPick(fight, "b", "move:guard", cfg);
        check("a move that isn't yours is refused", submitPick(fight, "c", "move:nope", cfg).refused, "That isn't one of your moves.");
        // C never picks: the timer plays the round and C attacks.
        const r1 = resolveRound(fight, cfg);
        check("everyone's turn plays, the late one attacks: two hits and a counter", [fight.enemyCurrentHp, r1.log.filter((l) => l.startsWith("⚔️ **C** used **Attack**")).length], [259, 1]);
        check("the enemy hit only its target, who guarded", [fight.members.map((m) => m.hp), r1.log.some((l) => l.includes("countered"))], [[100, 96, 100], true]);

        // B is knocked out; the others win. B gets half and no drops.
        fight.members[1]!.hp = 1;
        fight.enemyTarget = "b";
        fight.enemyIntent = "attack";
        resolveRound(fight, cfg);
        check("a member on 0 HP is knocked out, the fight goes on", [fight.members[1]!.out, fight.resolved ?? false], ["down", false]);
        fight.enemyCurrentHp = 1;
        const end = resolveRound(fight, cfg);
        const got = Object.fromEntries(end.settled.map((r) => [r.member.userId, [r.summary.outcome, r.summary.xpGained, r.summary.goldGained, r.summary.itemsDropped.length]]));
        check("standing members get it all, each with their own drop roll", [got.u, got.c], [["win", 100, 40, 1], ["win", 100, 40, 1]]);
        check("a knocked-out member gets half, no drops", got.b, ["win", 50, 20, 0]);

        // Mixed speeds: the faster member, then the enemy, then the slower one.
        const mixed = handFight({ hp: 1000, atk: 10, spd: 5, moves: [{ moveId: "attack" }] });
        mixed.members[0]!.stats.spd = 1;
        joinFight(mixed, { ...ally("b"), stats: { ...ally("b").stats, spd: 9 } }, cfg);
        mixed.enemyIntent = "attack";
        const who = playTurn(mixed, { u: { kind: "move", moveId: "attack" }, b: { kind: "move", moveId: "attack" } }, cfg).log
            .map((l) => (l.includes("**B**") ? "b" : l.includes("**U**") ? "u" : "foe"));
        check("the enemy acts between a faster and a slower member", who, ["b", "foe", "u"]);

        // Fleeing in a party: you leave and are settled at once; the fight goes on.
        const run = handFight({ hp: 100, atk: 1, spd: 0, moves: [{ moveId: "attack" }] });
        joinFight(run, ally("b"), cfg);
        submitPick(run, "b", "flee", cfg);
        submitPick(run, "u", "move:attack", cfg);
        const fled = resolveRound(run, cfg);
        check("a member who flees leaves alone", [fled.settled.map((r) => [r.member.userId, r.summary.outcome]), run.resolved ?? false], [[["b", "flee"]], false]);

        // Everyone down is a loss for all.
        const wipe = handFight({ hp: 1000, atk: 500, moves: [{ moveId: "attack" }] });
        joinFight(wipe, ally("b", 1), cfg);
        wipe.members[0]!.hp = 1;
        resolveRound(wipe, cfg);
        const last = resolveRound(wipe, cfg);
        check("when nobody is left standing, it's lost", [last.outcome, last.settled.map((r) => r.summary.outcome)], ["loss", ["loss", "loss"]]);
    });

    await test("places: channels map to enemy pools, and chat places fight in threads", async () => {
        const cfg = structuredClone(DEFAULT_GUILD_CONFIG);
        const enemy = (id: string, minLevel: number, maxLevel: number | null, boss = false) =>
            ({ id, name: id, emoji: "👾", hp: 10, atk: 1, def: 0, spd: 1, critChance: 0, critMultiplier: 1, minLevel, maxLevel, xpReward: 0, goldReward: 0, drops: [], boss });
        cfg.combat.enemies = { wolf: enemy("wolf", 1, 10), bear: enemy("bear", 5, null), lich: enemy("lich", 40, null), king: enemy("king", 1, null, true) };
        cfg.combat.places = {
            woods: { id: "woods", name: "Woods", emoji: "🌲", channelIds: ["cat-wild"], enemies: [{ enemyId: "wolf", weight: 3 }, { enemyId: "bear", weight: 1 }, { enemyId: "king" }] },
            crypt: { id: "crypt", name: "Crypt", emoji: "🪦", channelIds: ["crypt"], enemies: [{ enemyId: "lich" }], fights: "channel" },
        };
        check("a channel in a place's category is in that place", placeFor(cfg, ["general", "cat-wild"])?.id, "woods");
        check("a channel listed itself wins over its category", placeFor(cfg, ["crypt", "cat-wild"])?.id, "crypt");
        check("a thread counts as its channel", placeFor(cfg, ["thread-1", "crypt", "cat-wild"])?.id, "crypt");
        check("other channels are in no place", placeFor(cfg, ["tavern", "cat-town"]), null);
        const woods = cfg.combat.places.woods!;
        check("only enemies that suit your level, never a boss", placeEnemies(woods, cfg, 3).map((p) => p.enemy.id), ["wolf"]);
        check("weights pick between them", [pickFromPlace(woods, cfg, 6, undefined, () => 0.7)?.id, pickFromPlace(woods, cfg, 6, undefined, () => 0.8)?.id], ["wolf", "bear"]);
        check("nothing suitable, nothing found", pickFromPlace(cfg.combat.places.crypt!, cfg, 5), null);
        check("places fight in threads unless set otherwise", [fightsInThread(cfg, woods), fightsInThread(cfg, cfg.combat.places.crypt!), fightsInThread(cfg, null)], [true, false, false]);

        cfg.combat.enabled = true;
        cfg.combat.places.empty = { id: "empty", name: "Empty Hall", emoji: "🏚️", channelIds: [], enemies: [{ enemyId: "ghost" }] };
        const noThreads: Access = { channelName: (id) => id, missingIn: (_, perms) => perms.filter((p) => p === "threads"), roleName: () => "Hero", canManageRole: () => true, canManageWebhooks: () => true };
        const health = checkGuild(cfg, noThreads).map((i) => i.message).join("\n");
        check("the health check covers places", [
            health.includes("can't post Woods fights in #cat-wild. Give it Create Public Threads"),
            health.includes("Crypt fights"),
            health.includes("The place Empty Hall isn't tied to any channel yet"),
            health.includes("The place Empty Hall has an enemy that was deleted (ghost)"),
            health.includes("lists the world boss king"),
        ], [true, false, true, true, true]);
    });

    await test("battle scenes draw from images and avatars, alone or in a party", async () => {
        // A 1x1 PNG, so nothing is fetched from the network.
        const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        const enemy = { name: "Ogre", emoji: "", image: png, hp: 40, maxHp: 90, hit: 12 };
        const solo = await renderBattleScene({ place: { colour: "#334455" }, enemy, members: [{ name: "Josh", avatarUrl: png, hp: 80, maxHp: 100, hit: 5 }] });
        const party = await renderBattleScene({
            place: { image: png }, enemy,
            members: [{ name: "Josh", avatarUrl: png, hp: 80, maxHp: 100, targeted: true }, { name: "Sam", hp: 0, maxHp: 100, down: true }, { name: "Ana", avatarUrl: png, hp: 50, maxHp: 120 }],
        });
        const isPng = (b: Buffer) => b.subarray(1, 4).toString() === "PNG" && b.length > 5000;
        check("a solo scene draws", isPng(solo), true);
        check("a party scene draws, with a member down and no avatar", isPng(party), true);

        // The image cache keeps the most recently used 300 and drops the oldest.
        imgCache.clear();
        for (let i = 0; i < 305; i++) await loadCachedImage(`${png}#${i}`);
        check("the image cache stays at 300", imgCache.size, 300);
        check("dropping the least recently used first", [imgCache.has(`${png}#0`), imgCache.has(`${png}#304`)], [false, true]);
    });

    await test("the collection: anything you get is found for good, and can unlock things", async () => {
        const ids = await reset();
        const cfg = structuredClone(ids.config);
        cfg.shop.items = {
            ore: { id: "ore", name: "Ore", emoji: "🪨", categoryId: "", price: 5 },
            shard: { id: "shard", name: "Starmetal Shard", emoji: "🌠", categoryId: "", price: 0, hidden: true },
            blade: { id: "blade", name: "Star Blade", categoryId: "", price: 0, hidden: true },
        } as any;
        cfg.combat.enemies = { wyrm: { id: "wyrm", name: "Wyrm", emoji: "🐉", drops: [{ itemId: "shard", chance: 0.1, quantity: 1 }] } as any };
        cfg.crafting.stations = { smith: { id: "smith", name: "Smithing", emoji: "⚒️", recipes: { blade: { id: "blade", output: { itemId: "blade", quantity: 1 } } } } as any };

        const { profile } = await getOrCreateProfile({ userId: ids.userId, guildId: ids.guildId });
        // Each write starts from the cached profile, the way the bot's writers do.
        const give = async (inventory: Record<string, unknown>) => {
            const { profile: now } = await getOrCreateProfile({ userId: ids.userId, guildId: ids.guildId });
            now.inventory = inventory as any;
            commitProfileChanges({ userId: ids.userId, guildId: ids.guildId, profile: now, changes: { inventory: now.inventory }, baseline: { xp: now.xp, gold: now.gold } });
        };
        const facts = { roleIds: [], joinedAt: null, boosting: false };
        const needsShard = { found: ["shard"] };
        check("a recipe can need a found item", checkRequirements(needsShard, { profile, config: cfg, facts }).message, "Needs to have found 🌠 Starmetal Shard.");

        await give({ shard: { id: "shard", name: "Starmetal Shard", quantity: 1 } });
        const after = (await getOrCreateProfile({ userId: ids.userId, guildId: ids.guildId })).profile;
        check("getting it marks it found", after.user_stats?.found, ["shard"]);
        await give({});
        const later = (await getOrCreateProfile({ userId: ids.userId, guildId: ids.guildId })).profile;
        check("selling it later keeps it found", [later.user_stats?.found, checkRequirements(needsShard, { profile: later, config: cfg, facts }).ok], [["shard"], true]);


        // Owner-made collections: items found and enemies beaten, with milestones.
        cfg.collections = { sets: { star: {
            id: "star", name: "Star Hunt", emoji: "🌠",
            entries: [{ kind: "item", id: "shard" }, { kind: "item", id: "blade" }, { kind: "enemy", id: "wyrm" }, { kind: "item", id: "gone" }],
            milestones: [{ at: 1, actions: [{ type: "giveGold", amount: 10 }] }, { at: 99, actions: [{ type: "giveGold", amount: 500 }] }],
        } } };
        const set = cfg.collections.sets.star!;
        check("a deleted entry doesn't count against you", setProgress(set, later, cfg), { done: 1, total: 3, complete: false });
        const first = await payCollectionMilestones(ids.userId, ids.guildId, cfg);
        check("the first milestone pays, without the whole set", first.map((m) => [m.at, m.complete, m.given]), [[1, false, ["+10 Gold"]]]);
        check("and only once", (await payCollectionMilestones(ids.userId, ids.guildId, cfg)).length, 0);
        check("an unfinished set doesn't unlock things", checkRequirements({ collections: ["star"] }, { profile: later, config: cfg, facts }).message, "Needs to complete 🌠 Star Hunt.");

        const p = (await getOrCreateProfile({ userId: ids.userId, guildId: ids.guildId })).profile;
        p.user_stats = { ...p.user_stats, defeated: ["wyrm"] } as any;
        commitProfileChanges({ userId: ids.userId, guildId: ids.guildId, profile: p, changes: { user_stats: p.user_stats }, baseline: { xp: p.xp, gold: p.gold } });
        // A writer holding an older copy (no "wyrm") gives an item: the defeat must survive.
        profile.inventory = { blade: { id: "blade", name: "Star Blade", quantity: 1 } } as any;
        commitProfileChanges({ userId: ids.userId, guildId: ids.guildId, profile, changes: { inventory: profile.inventory }, baseline: { xp: profile.xp, gold: profile.gold } });
        const done = (await getOrCreateProfile({ userId: ids.userId, guildId: ids.guildId })).profile;
        const last = await payCollectionMilestones(ids.userId, ids.guildId, cfg);
        check("finishing pays the completion reward (a milestone past the size means completing it)", last.map((m) => [m.at, m.complete, m.given]), [[3, true, ["+500 Gold"]]]);
        check("a completed set unlocks things", checkRequirements({ collections: ["star"] }, { profile: done, config: cfg, facts }).ok, true);
    });

    await test("gathering twists: traits, a daily condition, and rules that change the game", async () => {
        const cfg = structuredClone(DEFAULT_GUILD_CONFIG);
        cfg.gathering.conditions = {
            storm: { id: "storm", name: "Storm", emoji: "⛈️", line: "Rain lashes down.", effects: { difficulty: 1, rareLoot: 200, rules: ["timing.falseAlarm"] } },
        };
        const activity = { id: "dig", name: "Digging", game: "grid", locations: {} } as any;
        const location = {
            id: "deep", name: "Deep Veins", emoji: "⛏️", minSkill: 1, skillXp: 10, loot: [],
            traits: [{ name: "Pitch dark", emoji: "🌑", effects: { rules: ["grid.adjacent"], xp: 150 } }],
            conditions: [{ conditionId: "storm", weight: 1 }], calmWeight: 0,
        } as any;
        const day = Date.parse("2026-10-23T12:00:00Z");
        const mods = runMods(cfg, activity, location, day);
        check("the trait and today's condition both apply", [mods.difficulty, mods.rareLoot, mods.xp], [1, 2, 1.5]);
        check("a rule for another game is ignored", [...mods.rules], ["grid.adjacent"]);
        check("both show when a run starts, with when the condition ends", mods.lines, [
            "🌑 **Pitch dark:** You can only open tiles next to ones you've uncovered.",
            `⛈️ **Storm** (ends <t:${Date.parse("2026-10-23T18:00:00Z") / 1000}:R>): Rain lashes down.`,
        ]);
        check("conditions last 6 hours by default, from midnight UTC", conditionSlot(cfg, day).endsAt, Date.parse("2026-10-23T18:00:00Z"));
        cfg.gathering.conditionHours = 24;
        check("or what the owner picks", conditionSlot(cfg, day).endsAt, Date.parse("2026-10-24T00:00:00Z"));
        check("everyone gets the same weather in a stretch", conditionNow(cfg, activity, location, day)?.id === conditionNow(cfg, activity, location, day + 3600_000)?.id, true);
        location.calmWeight = 1_000_000;
        check("a calm stretch has no condition", conditionNow(cfg, activity, location, day), null);

        // Difficulty is read by each game its own way.
        check("grid: a hazard more, a try fewer", [gridRules(location, 1, 0, 1).hazards, gridRules(location, 1, 0, 1).tries], [3, 4]);
        check("timing: a shorter window", timingWindowMs(location, 1, 0, 1), 2600);
        check("find: less time, more look-alikes", [findRules(location, 1, 0, 1).seconds, findRules(location, 1, 0, 1).decoyKinds], [6.5, 4]);

        // Clustered: every find but the first sits next to another, almost always.
        let touching = 0;
        for (let n = 0; n < 50; n++) {
            const cells = makeClusteredGrid({ size: 16, finds: 5, hazards: 2 });
            const finds = cells.map((c, i) => (c === "find" ? i : -1)).filter((i) => i >= 0);
            const near = (a: number, b: number) => Math.abs(a - b) === 4 || (Math.abs(a - b) === 1 && Math.floor(a / 4) === Math.floor(b / 4));
            if (finds.every((a) => finds.some((b) => a !== b && near(a, b)))) touching++;
            check(`clustered grid ${n} keeps its counts`, [finds.length, cells.filter((c) => c === "hazard").length], [5, 2]);
        }
        check("clustered finds touch each other", touching >= 35, true);
    });

    await test("quests can ask for gathering and crafting", async () => {
        const cfg = structuredClone(DEFAULT_GUILD_CONFIG);
        cfg.quests = { enabled: true, quests: {
            ore: { id: "ore", name: "Ore Run", description: "", conditions: { type: "gatherItems", target: 5, itemIds: ["iron"] }, cooldownSeconds: 0 } as any,
            forge: { id: "forge", name: "Forge Work", description: "", conditions: { type: "craftItems", target: 1 }, cooldownSeconds: 0 } as any,
        } } as any;
        // Quests only move once accepted.
        let profile = { user_stats: {}, quests: { ore: { acceptedAt: "2026-01-01" }, forge: { acceptedAt: "2026-01-01" } } } as any;
        const pending = {} as any;
        const ev = (e: any) => applyQuestEvent({ profile, pending, config: cfg, event: { guildId: "g", userId: "u", ...e } });
        let r = ev({ type: "gather", itemId: "copper", quantity: 9 });
        check("other items don't count", r.completedQuestIds, []);
        r = ev({ type: "gather", itemId: "iron", quantity: 5 });
        check("five iron finishes the ore run", r.completedQuestIds, ["ore"]);
        profile = r.profile;
        check("any craft counts when no items are named", ev({ type: "craft", itemId: "sword", quantity: 1 }).completedQuestIds, ["forge"]);
    });

    await test("what's next: the move to unlock, a fairer place, the next location", async () => {
        const cfg = structuredClone(DEFAULT_GUILD_CONFIG);
        cfg.combat.moves = {
            ...DEFAULT_MOVES,
            rend: { id: "rend", name: "Rend", emoji: "🩸", effects: [], players: { requirements: { combatLevel: 5 } } },
            exec: { id: "exec", name: "Execute", emoji: "🗡️", effects: [], players: { requirements: { combatLevel: 10 } } },
            scroll: { id: "scroll", name: "Starfall", emoji: "🌠", effects: [], players: { learned: true, requirements: { combatLevel: 3 } } },
        };
        check("the next move by level", nextFightLine(cfg, 6, false), "-# Next: 🗡️ **Execute** unlocks at Combat 10 (4 levels to go).");
        check("a level-up names the moves it opened, not scroll-only ones", newMoveLines(cfg, 2, 6), ["🆕 **New move: 🩸 Rend.** Pick it in `/moves`."]);
        cfg.combat.enemies = { wolf: { id: "wolf", name: "Wolf", minLevel: 8, maxLevel: 20 } as EnemyConfig };
        cfg.combat.places = { woods: { id: "woods", name: "Darkwood", emoji: "🌲", channelIds: ["c"], enemies: [{ enemyId: "wolf" }] } };
        check("too easy: where the fair fights are", nextFightLine(cfg, 12, true), "-# Next: 🌲 **Darkwood** has enemies more your level.");
        const act = { skillName: "Mining", locations: { a: { name: "Shallows", emoji: "⛏️", minSkill: 1 }, b: { name: "Deep Vein", emoji: "🌑", minSkill: 30 } } } as any;
        check("the next location", nextGatherLine(act, 27), "-# Next: 🌑 **Deep Vein** opens at Mining 30 (3 levels to go).");
        check("nothing left: nothing said", nextGatherLine(act, 40), null);
    });

    await test("enemies below your level pay less XP, gently", async () => {
        const cfg = structuredClone(DEFAULT_GUILD_CONFIG);
        const wolf = { minLevel: 5, maxLevel: 15 } as EnemyConfig;
        check("inside its range: full", easyXpShare(wolf, 15, cfg), 1);
        check("3 over: 70%", easyXpShare(wolf, 18, cfg), 0.7);
        check("never below the floor", easyXpShare(wolf, 60, cfg), 0.25);
        check("no top to its range: always full", easyXpShare({ minLevel: 1, maxLevel: null } as EnemyConfig, 99, cfg), 1);
        // Outside places, a rare elite turns up rarely: weight 0.2 against 1.
        cfg.combat.enemies = { rat: { id: "rat", minLevel: 1, maxLevel: null } as EnemyConfig, elite: { id: "elite", minLevel: 1, maxLevel: null, spawnWeight: 0.2 } as EnemyConfig };
        check("weights decide who turns up", [pickRandomEnemy(cfg, 5, undefined, () => 0.8)?.id, pickRandomEnemy(cfg, 5, undefined, () => 0.9)?.id], ["rat", "elite"]);
        cfg.combat.easyXp = { enabled: false };
        check("owners can turn it off", easyXpShare(wolf, 60, cfg), 1);
    });

    await test("daily stock: a member can buy so many a day, and it restocks", async () => {
        const ids = await reset();
        const cfg = structuredClone(ids.config);
        cfg.shop.items = { draught: { id: "draught", name: "Draught", categoryId: "", price: 5, dailyLimit: 2 } } as any;
        await setGuildConfig(TEST_DISCORD_GUILD, cfg);
        guildConfigCache.clear();
        await getOrCreateProfile({ userId: ids.userId, guildId: ids.guildId });
        await flushDirtyProfiles(true);
        await seed({ discordId: TEST_DISCORD_USER, userId: ids.userId } as any, ids.guildId, {}, 100);
        const buy = (quantity: number) => purchaseItem({ userId: ids.userId, guildId: ids.guildId, discordGuildId: TEST_DISCORD_GUILD, itemId: "draught", quantity });
        check("buying under the limit works", (await buy(2)).success, true);
        const third = await buy(1);
        check("past it is refused", [third.success, !third.success && third.message.startsWith("You've bought today's 2 Draught")], [false, true]);
        const row = (await getOrCreateProfile({ userId: ids.userId, guildId: ids.guildId })).profile;
        check("bought items count as found", row.user_stats?.found?.includes("draught"), true);
        const yesterday = { boughtToday: { day: "2000-01-01", items: { draught: 2 } } } as any;
        check("a new day restocks", leftToday({ id: "draught", dailyLimit: 2 }, yesterday), 2);
        check("no limit, no cap", leftToday({ id: "x" }, row.user_stats), Infinity);
    });

    await test("the activity log keeps 90 days", async () => {
        const ids = await reset();
        await query(`DELETE FROM events WHERE event_type = 'smoke-prune'`);
        const add = (daysAgo: number) => query(
            `INSERT INTO events (guild_id, discord_guild_id, user_id, category, event_type, "timestamp")
             VALUES ($1, $2, $3, 'xp', 'smoke-prune', NOW() - make_interval(days => $4))`,
            [ids.guildId, TEST_DISCORD_GUILD, ids.userId, daysAgo],
        );
        await add(120);
        await add(91);
        await add(10);
        await pruneOldEvents();
        const left = await query(`SELECT count(*)::int AS n FROM events WHERE event_type = 'smoke-prune'`);
        check("older rows go, recent ones stay", left.rows[0]?.n, 1);
    });

    await test("tips show once per member, and Quiet stops pings", async () => {
        const ids = await reset();
        const cfg = structuredClone(ids.config);
        const first = await tipOnce(ids.userId, ids.guildId, cfg, "firstFight");
        check("a member's first fight gets the tip", first?.includes("The headline is what the enemy does next"), true);
        check("only once", await tipOnce(ids.userId, ids.guildId, cfg, "firstFight"), null);
        cfg.style.tips = false;
        check("owners can turn tips off", await tipOnce(ids.userId, ids.guildId, cfg, "firstWin"), null);

        check("members are pinged by default", await mentionsFor(TEST_DISCORD_GUILD, TEST_DISCORD_USER, { users: [TEST_DISCORD_USER] }), { users: [TEST_DISCORD_USER] });
        const { profile } = await getOrCreateProfile({ userId: ids.userId, guildId: ids.guildId });
        profile.settings = { ...profile.settings, quiet: true };
        check("Quiet names them without a ping, keeping role pings", await mentionsFor(TEST_DISCORD_GUILD, TEST_DISCORD_USER), { parse: ["roles", "everyone"] });
    });

    await test("HP comes back over two hours, and a loss leaves you at 25%", async () => {
        const cfg = structuredClone(DEFAULT_GUILD_CONFIG);
        const stats = { maxHp: 100, atk: 1, def: 0, spd: 1, critChance: 0, critMultiplier: 1 };
        const hour = 60 * 60_000;
        const at = (hp: number, ago: number) => ({ user_stats: storeHp(hp, Date.now() - ago) }) as any;
        check("defaults: full in 2 hours, respawn at 25%", hpRules(cfg), { regenMinutes: 120, respawnPercent: 25, woundedMinutes: 10, woundedStatusId: "wounded" });
        check("an hour brings back half", resolveCurrentHp(at(20, hour), stats, cfg), 70);
        check("and never past full", resolveCurrentHp(at(20, 3 * hour), stats, cfg), 100);
        check("HP stored before regen counts as full", resolveCurrentHp({ user_stats: { currentHp: 5 } } as any, stats, cfg), 100);
        check("the wait to full is shown in minutes", minutesToFull(70, stats, cfg), 36);
        check("a loss respawns at 25%", respawnHp(stats, cfg), 25);
        // Wounded: −20% ATK and DEF for 10 minutes after a loss, then gone.
        const lost = { user_stats: afterLoss(stats, cfg) } as any;
        const fresh = calculateStats({ user_stats: {} } as any, cfg, {});
        const hurt = calculateStats(lost, cfg, {});
        check("a loss leaves you wounded: lower ATK and DEF", [hurt.atk < fresh.atk, hurt.def <= fresh.def, hurt.maxHp === fresh.maxHp], [true, true, true]);
        check("and it wears off", woundedUntil(lost, cfg, Date.now() + 11 * 60_000), null);
        cfg.combat.hp = { woundedMinutes: 0 };
        check("an owner can turn it off", "woundedUntil" in afterLoss(stats, cfg), false);
        cfg.combat.hp = { regenMinutes: 0 };
        check("an owner can turn regen off", resolveCurrentHp(at(20, 3 * hour), stats, cfg), 20);
    });

    await test("crafting: what a member can make, and making it", async () => {
        const ids = await reset();
        const config = ids.config;
        config.shop = { ...config.shop, items: {
            ore: { id: "ore", name: "Ore", categoryId: "", price: 0 },
            sword: { id: "sword", name: "Sword", categoryId: "", price: 0 },
            fine: { id: "fine", name: "Fine Sword", categoryId: "", price: 0 },
        } } as any;
        const station = { id: "smith", name: "Smithing", emoji: "⚒️", skillName: "Smithing", enabled: true, style: "simple", recipes: {} } as any;
        const recipe = { id: "sword", inputs: [{ itemId: "ore", quantity: 3 }], gold: 5, output: { itemId: "sword", quantity: 1 }, minSkill: 1, skillXp: 40 } as any;
        const p = (await getOrCreateProfile({ userId: ids.userId, guildId: ids.guildId })).profile;
        p.inventory = { ore: { id: "ore", name: "Ore", quantity: 4 } } as any;
        p.gold = "10";

        check("one craft's worth is affordable", recipeState(recipe, p, config, 1, []).affordable, true);
        check("a skill gate locks it", recipeState({ ...recipe, minSkill: 5 }, p, config, 1, []).locked, "skill");
        check("a hidden recipe stays locked until known", recipeState({ ...recipe, hidden: true }, p, config, 1, []).locked, "hidden");
        check("a missing output item breaks it", recipeState({ ...recipe, output: { itemId: "gone", quantity: 1 } }, p, config, 1, []).locked, "broken");

        const made = await craftOnce({ userId: ids.userId, guildId: ids.guildId, config, station, recipe, roll: () => 0.99 });
        const after = (await getOrCreateProfile({ userId: ids.userId, guildId: ids.guildId })).profile;
        check("crafting gives the output", after.inventory.sword?.quantity, 1);
        check("crafting takes the inputs", after.inventory.ore?.quantity, 1);
        check("crafting takes the gold", after.gold, "5");
        check("crafting gives skill XP", after.user_stats.crafting?.smith?.xp, 40);
        check("the craft reports success", made.ok, true);

        const again = await craftOnce({ userId: ids.userId, guildId: ids.guildId, config, station, recipe });
        check("not enough ore refuses, and takes nothing", `${again.ok}|${(await getOrCreateProfile({ userId: ids.userId, guildId: ids.guildId })).profile.inventory.ore?.quantity}`, "false|1");

        // A masterwork roll picks from the table.
        const lucky = { ...station, masterworkChance: 100 };
        const fresh = (await getOrCreateProfile({ userId: ids.userId, guildId: ids.guildId })).profile;
        fresh.inventory = { ...fresh.inventory, ore: { id: "ore", name: "Ore", quantity: 3 } } as any;
        fresh.gold = "5";
        const mw = await craftOnce({ userId: ids.userId, guildId: ids.guildId, config, station: lucky, recipe: { ...recipe, masterwork: [{ itemId: "fine", chance: 1, quantity: 1 }] } });
        check("a masterwork gives the table's item", mw.ok && !mw.ruined && mw.masterwork && mw.gave.itemId, "fine");

        // Forge: a ruined strike loses half of each ingredient (rounded down), no gold, no XP.
        const forge = { ...station, style: "forge" } as any;
        const before = (await getOrCreateProfile({ userId: ids.userId, guildId: ids.guildId })).profile;
        before.inventory = { ...before.inventory, ore: { id: "ore", name: "Ore", quantity: 3 } } as any;
        const goldBefore = before.gold;
        const xpBefore = before.user_stats.crafting?.smith?.xp;
        const ruined = await craftOnce({ userId: ids.userId, guildId: ids.guildId, config, station: forge, recipe: { ...recipe, gold: 0 }, outcome: "ruin" });
        const afterRuin = (await getOrCreateProfile({ userId: ids.userId, guildId: ids.guildId })).profile;
        check("a ruin loses half the ingredients", `${ruined.ok && ruined.ruined}|${afterRuin.inventory.ore?.quantity}`, "true|2");
        check("a ruin keeps the gold and gives no XP", `${afterRuin.gold === goldBefore}|${afterRuin.user_stats.crafting?.smith?.xp === xpBefore}`, "true|true");

        // The bar: zone 5 of 15 at skill 1, 8 at the top; the centre sits inside it.
        check("forge zone at skill 1", forgeRules(forge, 1, 50).zone, 5);
        check("forge zone at the top skill", forgeRules(forge, 50, 50).zone, 8);
        const spot = placeForge({ zone: 5, centre: 1 }, () => 0);
        check("forge judging", [2, 0, 5].map((cell) => judgeForge(cell, spot)).join(","), "perfect,made,ruin");
    });

    await test("shop categories follow their sort order, hidden flag and roles", async () => {
        const cfg = { shop: { categories: {
            b: { id: "b", name: "B", sortOrder: 2 },
            a: { id: "a", name: "A", sortOrder: 1 },
            secret: { id: "secret", name: "Secret", hidden: true },
            vip: { id: "vip", name: "VIP", sortOrder: 0, roleRequiredIds: ["r1"] },
        } } } as any;
        check("members see unhidden categories in order", visibleCategories(cfg, []).map(([id]) => id).join(","), "a,b");
        check("a role opens its category", visibleCategories(cfg, ["r1"]).map(([id]) => id).join(","), "vip,a,b");
    });

    await test("gathering: skill curve, weighted loot and the grid", async () => {
        const cfg = { ...DEFAULT_GUILD_CONFIG, shop: { items: { ore: { id: "ore", name: "Ore" }, gem: { id: "gem", name: "Gem" } } } } as any;
        // About 25 runs of 20 skill XP to skill 10, 400 to the cap of 50.
        check("skill 10 after ~25 runs", skillLevel(25 * 20, cfg), 10);
        check("skill 50 after ~400 runs", skillLevel(400 * 20, cfg), 50);

        const loot = [{ itemId: "ore", chance: 90, min: 1, max: 1 }, { itemId: "gone", chance: 1000, min: 1, max: 1 }];
        check("a deleted item never drops", rollLoot(loot, cfg)?.itemId, "ore");
        check("an empty table gives nothing", rollLoot([], cfg), null);

        const grid = makeGrid({ size: 16, finds: 5, hazards: 2 });
        check("grid has 5 finds", grid.filter(c => c === "find").length, 5);
        check("grid has 2 hazards", grid.filter(c => c === "hazard").length, 2);
        const loc = { difficulty: { finds: 5, hazards: 3, tries: 5 } } as any;
        check("skill 50 adds tries", gridRules(loc, 50).tries, 9);
        check("skill eases hazards to a floor of 1", gridRules(loc, 50).hazards, 1);

        // Timing: the window grows with skill but never drops under 2.5 s; rarer finds fight back.
        check("timing window at skill 1", timingWindowMs({ difficulty: {} } as any, 1), 3000);
        check("timing window floor", timingWindowMs({ difficulty: { windowMs: 1000 } } as any, 1), 2500);
        check("a rare find pulls twice", pullRounds({ difficulty: {} } as any, 1, "rare"), 2);
        check("skill 25 drops a pull, but rares keep one", pullRounds({ difficulty: {} } as any, 30, "rare"), 1);
        check("find gets more time with skill", findRules({ difficulty: {} } as any, 50).seconds, 13);

        // Energy is worked out on read: no timers, partial refills carry over, never over the max.
        const act = { id: "m", energyMax: 10, energyRefillSeconds: 360 } as any;
        const t0 = Date.parse("2026-10-19T00:00:00Z");
        let e: any;
        for (let i = 0; i < 4; i++) e = spentEnergy(e, act, t0 + i * 1000);
        check("four runs leave six", energyNow(e, act, t0 + 5000).energy, 6);
        check("a point refills every 6 minutes", energyNow(e, act, t0 + 13 * 60_000).energy, 8);
        check("energy never passes the max", energyNow(e, act, t0 + 86_400_000).energy, 10);
        check("spending mid-refill keeps the refill's progress", spentEnergy(e, act, t0 + 13 * 60_000).energyAt, new Date(t0 + 720_000).toISOString());
    });

    await test("an item card reads the same lines as the dashboard tooltip", async () => {
        const sword: shopItemConfig = {
            id: "blade", name: "Ashfang Blade", rarity: "epic", categoryId: "weapons",
            price: 1200, sellPrice: 300, equipable: true, equipSlot: "weapon",
            minLevel: 10, maxPerUser: 1, description: "Still remembers the fire.",
            effects: { stats: { atk: 12, crit: 5 }, boosts: { goldMultiplier: 1.1 } },
        };
        const lines = itemCardLines(sword).map(l => l.text);

        check("name leads", lines[0], "Ashfang Blade");
        check("unique cap", lines.includes("Unique"), true);
        check("slot is capitalised", lines.includes("Weapon"), true);
        check("stats are signed", lines.includes("+12 Attack"), true);
        check("crit reads as an equip line", lines.includes("Equip: +5% critical strike chance."), true);
        check("gold boost as a percentage", lines.includes("Equip: Fights award 10% more gold."), true);
        check("flavour text is quoted", lines.includes('"Still remembers the fire."'), true);
        check("level requirement reads as Combat", lines.includes("Requires Combat 10"), true);
        check("sell price", lines.includes("Sell Price: 300 gold"), true);

        // A 1.0 multiplier is not a bonus, so it must not show as one.
        const inert: shopItemConfig = {
            id: "rock", name: "Rock", categoryId: "misc", price: 1,
            effects: { stats: { atk: 5 }, boosts: { xpMultiplier: 1 } },
        };
        const inertLines = itemCardLines(inert).map(l => l.text);
        check("no line for a 1x multiplier", inertLines.some(l => l.includes("award")), false);
        // Equip bonuses are read off equipped items, so on anything else they do nothing.
        check("warns that stats on unequipable items are dead", inertLines.includes("Not equipable, so these bonuses never apply."), true);

        const useOnly: shopItemConfig = {
            id: "potion", name: "Potion", categoryId: "misc", price: 1,
            actions: { 0: { type: "giveStat", statId: "hp", amount: 25 } },
        };
        check("actions read as use lines", itemCardLines(useOnly).map(l => l.text).includes("Use: Gives 25 hp."), true);
    });

    await test("encounters spawn by chance, respect cooldown and channels, and go to the first click", async () => {
        const { config } = await reset();
        config.combat.enabled = true;
        config.combat.enemies = {
            slime: {
                id: "slime", name: "Slime", emoji: "🟢", hp: 20, atk: 1, def: 0, spd: 1, critChance: 0, critMultiplier: 1,
                minLevel: 0, maxLevel: null, xpReward: 5, goldReward: 5, drops: [],
            },
        };
        config.combat.encounters = { enabled: true, chancePercent: 100, cooldownSeconds: 600, fleeSeconds: 60 };
        await setGuildConfig(TEST_DISCORD_GUILD, config);
        guildConfigCache.clear();

        const sent: unknown[] = [];
        const message = (guildId: string, channelId: string, canSend = true) => ({
            guildId, channelId,
            guild: { members: { me: {} } },
            channel: {
                isSendable: () => true,
                permissionsFor: () => ({ has: () => canSend }),
                send: async (payload: unknown) => { sent.push(payload); return { id: `enc-${sent.length}`, edit: async () => null }; },
            },
        }) as any;

        await maybeSpawnEncounter(message(TEST_DISCORD_GUILD, "c1", false), config, 1);
        check("a channel the bot can't post in is skipped", sent.length, 0);
        await maybeSpawnEncounter(message(TEST_DISCORD_GUILD, "c1"), config, 1);
        check("a 100% roll spawns", sent.length, 1);
        await maybeSpawnEncounter(message(TEST_DISCORD_GUILD, "c1"), config, 1);
        check("the cooldown holds the next one back", sent.length, 1);

        const elsewhere = { ...config, combat: { ...config.combat, encounters: { ...config.combat.encounters, channelIds: ["c-other"] } } };
        await maybeSpawnEncounter(message("smoke-guild-b", "c1"), elsewhere, 1);
        check("channels outside the list never spawn", sent.length, 1);
        const never = { ...config, combat: { ...config.combat, encounters: { ...config.combat.encounters, chancePercent: 0 } } };
        await maybeSpawnEncounter(message("smoke-guild-c", "c1"), never, 1);
        check("a 0% chance never spawns", sent.length, 1);

        // Two clicks at once: exactly one turns the encounter into a fight.
        const updates: unknown[] = [];
        const replies: unknown[] = [];
        const click = () => handleEncounterButton({
            inCachedGuild: () => true,
            message: { id: "enc-1" },
            user: { id: TEST_DISCORD_USER, username: "smoke-test", displayAvatarURL: () => "" },
            member: { displayName: "smoke-test" },
            guildId: TEST_DISCORD_GUILD,
            channelId: "c1",
            reply: async (p: unknown) => { replies.push(p); },
            deferUpdate: async () => {},
            editReply: async (p: unknown) => { updates.push(p); },
            followUp: async () => {},
        } as any);
        await Promise.all([click(), click()]);
        check("one click gets the fight", updates.length, 1);
        check("the other is turned away", replies.length, 1);
        await click();
        check("a late click finds it gone", replies.length, 2);
    });

    await test("world bosses pick their next move, healing only when hurt", async () => {
        const cfg = structuredClone(DEFAULT_GUILD_CONFIG);
        cfg.combat.moves = { ...DEFAULT_MOVES, feast: { id: "feast", name: "Feast", emoji: "🍷", effects: [{ type: "heal", percent: 10 }] } };
        const enemy = { id: "king", hp: 1000, moves: [{ moveId: "feast", weight: 1000 }, { moveId: "attack", weight: 1 }] } as EnemyConfig;
        check("at full HP it never heals", Array.from({ length: 20 }, () => nextIntent({ enemy, hp: 1000 }, cfg)).includes("feast"), false);
        check("hurt, it does", nextIntent({ enemy, hp: 300 }, cfg), "feast");
    });

    await test("world bosses split rewards by damage and fall exactly once", async () => {
        const boss = {
            id: "dragon", name: "Dragon", emoji: "🐉", hp: 30, atk: 1, def: 0, spd: 1, critChance: 0, critMultiplier: 1,
            minLevel: 0, maxLevel: null, xpReward: 1000, goldReward: 200, boss: true,
            drops: [{ itemId: "scale", chance: 0.5, quantity: 1 }],
        };
        const fighters = new Map([
            ["a", { username: "a", damage: 90, taken: 0, hits: 3 }],
            ["b", { username: "b", damage: 10, taken: 0, hits: 1 }],
            ["c", { username: "c", damage: 0.1, taken: 0, hits: 1 }],
        ]);
        const pay = Object.fromEntries(splitBossRewards(boss, fighters, () => 0.1).map(p => [p.discordUserId, p]));
        check("most damage, most XP", pay.a?.xp, 899);
        check("a share of the gold", pay.b?.gold, 20);
        check("a single hit still pays the floor", pay.c?.xp, 50);
        check("only the top damage dealer rolls drops", `${pay.a?.drops.length}/${pay.b?.drops.length}`, "1/0");

        // A live boss: two clicks attack at once with a cooldown in place. The
        // encounter test above left this member mid-fight, which blocks attacking.
        const { userId, guildId, config } = await reset();
        clearActiveFight(TEST_DISCORD_USER, TEST_DISCORD_GUILD);
        const xpBefore = BigInt((await getOrCreateProfile({ userId, guildId })).profile.xp);
        config.combat.enabled = true;
        config.combat.enemies = { dragon: boss };
        config.combat.bosses = { attackCooldownSeconds: 60 };
        await setGuildConfig(TEST_DISCORD_GUILD, config);
        guildConfigCache.clear();

        const edits: unknown[] = [];
        const channel = { send: async () => ({ id: "1001", channelId: "1000", edit: async (p: unknown) => { edits.push(p); return null; } }) } as any;
        const live = await spawnBoss(channel, TEST_DISCORD_GUILD, config, { ...boss, hp: 1 });
        const replies: string[] = [];
        const attack = () => handleBossButton({
            inCachedGuild: () => true,
            message: { id: "1001" },
            user: { id: TEST_DISCORD_USER, username: "smoke-test", displayAvatarURL: () => "" },
            member: { displayName: "smoke-test" },
            guildId: TEST_DISCORD_GUILD,
            reply: async (p: { content: string }) => { replies.push(p.content); },
        } as any);
        await Promise.all([attack(), attack()]);
        check("one killing blow", replies.filter(r => r.includes("killing blow")).length, 1);
        check("the other click is held back", replies.length, 2);
        check("the boss is gone", liveBoss(TEST_DISCORD_GUILD), null);
        check("the message shows it fell", JSON.stringify(edits.at(-1)).includes("has fallen"), true);
        check("the fighter's damage counted", live.fighters.get(TEST_DISCORD_USER)?.damage, 1);
        const after = (await getOrCreateProfile({ userId, guildId })).profile;
        check("the whole pool went to the only fighter, as Combat XP", `${BigInt(after.xp) - xpBefore}|${after.user_stats?.combat?.xp}`, "0|1000");
        const leftover = await query(`SELECT 1 FROM live_bosses WHERE discord_guild_id = $1`, [TEST_DISCORD_GUILD]);
        check("a fallen boss leaves no saved row", leftover.rowCount, 0);
    });

    await test("a manager can send a world boss away", async () => {
        const { config } = await reset();
        config.combat.enabled = true;
        check("nothing to dismiss", await dismissBoss(TEST_DISCORD_GUILD), null);
        let shown: any = null;
        const message = { id: "3001", channelId: "3000", edit: async (p: any) => { shown = p; return null; } };
        const boss = {
            id: "golem", name: "Golem", emoji: "🗿", hp: 500, atk: 1, def: 0, spd: 1, critChance: 0, critMultiplier: 1,
            minLevel: 0, maxLevel: null, xpReward: 10, goldReward: 10, drops: [], boss: true,
        };
        await spawnBoss({ send: async () => message } as any, TEST_DISCORD_GUILD, config, boss);
        check("it's gone", [(await dismissBoss(TEST_DISCORD_GUILD))?.enemy.id, liveBoss(TEST_DISCORD_GUILD)], ["golem", undefined]);
        check("and its message says so, with no rewards", [shown.embeds[0].data.title, shown.components], ["🗿 Golem was sent away", []]);
        const saved = await query(`SELECT 1 FROM live_bosses WHERE discord_guild_id = $1`, [TEST_DISCORD_GUILD]);
        check("and it won't come back after a restart", saved.rowCount, 0);
    });

    await test("a live world boss survives a restart", async () => {
        const { config } = await reset();
        config.combat.enabled = true;
        const boss = {
            id: "golem", name: "Golem", emoji: "🗿", hp: 500, atk: 1, def: 0, spd: 1, critChance: 0, critMultiplier: 1,
            minLevel: 0, maxLevel: null, xpReward: 10, goldReward: 10, drops: [], boss: true,
        };
        const message = { id: "2001", channelId: "2000", edit: async () => null };
        const spawned = await spawnBoss({ send: async () => message } as any, TEST_DISCORD_GUILD, config, boss);
        spawned.hp = 321;
        spawned.fighters.set(TEST_DISCORD_USER, { username: "smoke-test", damage: 179, taken: 4, hits: 9 });
        await saveLiveBosses();

        // A fresh process: the restored boss comes from the table, not memory.
        const client = {
            channels: { fetch: async (id: string) => id === "2000"
                ? { isTextBased: () => true, messages: { fetch: async (m: string) => (m === "2001" ? message : null) } }
                : null },
        } as any;
        check("one boss restored", await restoreBosses(client), 1);
        const back = liveBoss(TEST_DISCORD_GUILD);
        check("it is a new object", back !== spawned, true);
        check("its HP came back", back?.hp, 321);
        check("its damage leaderboard came back", back?.fighters.get(TEST_DISCORD_USER)?.damage, 179);
        check("its escape time is unchanged", back?.endsAt, spawned.endsAt);

        await query(`DELETE FROM live_bosses WHERE discord_guild_id = $1`, [TEST_DISCORD_GUILD]);
    });

    await test("/help pages render, respect switched-off features, and hide the owner page", async () => {
        const { config } = await reset();
        config.combat.enabled = false;
        await setGuildConfig(TEST_DISCORD_GUILD, config);
        guildConfigCache.clear();

        const shown: any[] = [];
        const base = (owner: boolean) => ({
            inCachedGuild: () => true,
            guildId: TEST_DISCORD_GUILD,
            memberPermissions: { has: () => owner },
            reply: async (p: any) => { shown.push(p); },
            update: async (p: any) => { shown.push(p); },
        });
        const text = (p: any) => p.embeds[0].data.description as string;
        // Tabs span two rows; every row's buttons count.
        const tabs = (p: any) => p.components.flatMap((r: any) => r.components.map((b: any) => b.data.custom_id));

        await helpCommand(base(false) as any);
        check("opens on getting started, privately", `${shown[0].embeds[0].data.title}|${!!shown[0].flags}`, "🌱 Getting started|true");
        check("members get no owner tab", tabs(shown[0]).includes("help:owner"), false);

        for (const page of ["combat", "gathering", "items", "social"]) {
            await handleHelpButton({ ...base(false), customId: `help:${page}` } as any);
            const body = text(shown.at(-1));
            check(`${page} page has content`, body.length > 0 && body.length < 4096, true);
        }
        await handleHelpButton({ ...base(false), customId: "help:combat" } as any);
        check("combat page says combat is off", text(shown.at(-1)).includes("turned off"), true);

        await handleHelpButton({ ...base(false), customId: "help:owner" } as any);
        check("a member asking for the owner page gets the start page", shown.at(-1).embeds[0].data.title, "🌱 Getting started");
        await handleHelpButton({ ...base(true), customId: "help:owner" } as any);
        check("owners get the owner page", shown.at(-1).embeds[0].data.title, "🛠️ For server owners");
        check("owners get a dashboard link under the tabs", shown.at(-1).components.at(-1).components[0].data.style, 5);
        check("every tab row fits Discord's five buttons", shown.at(-1).components.every((r: any) => r.components.length <= 5), true);
    });

    await test("level 1 starts at 0 XP, so the bar, the level and total XP agree", async () => {
        const { config } = await reset();
        config.levels.curveType = "linear";
        config.levels.curveParams = { rate: 100 };
        config.levels.xpOverrides = {};
        config.levels.maxLevel = null;
        check("a new member is level 1", levelFromXp(0, config), 1);
        check("99 XP is still level 1", levelFromXp(99, config), 1);
        check("level 1 starts at 0", levelStartXp(1, config), 0);
        // Level 1 is one step of the curve like every other level; it used to span two.
        check("level 2 starts at 100", levelStartXp(2, config), 100);
        check("100 XP reaches level 2", levelFromXp(100, config), 2);
        check("115 XP is level 2", levelFromXp(115, config), 2);
        // The card's numbers for 115 total XP: 15 into level 2's 100.
        const into = 115 - levelStartXp(2, config);
        const span = levelStartXp(3, config) - levelStartXp(2, config);
        check("the bar reads 15 / 100 into level 2", `${into} / ${span}`, "15 / 100");
        // /set level writes the XP its level begins at; it used to write 0.
        check("/set level 10 gives the XP level 10 starts at", levelStartXp(10, config), 900);
        check("and that XP is level 10", levelFromXp(levelStartXp(10, config), config), 10);
    });

    await test("a log channel the bot can't post in doesn't fail the command, and the event is still recorded", async () => {
        const { guildId, userId, config } = await reset();
        config.logging = {
            ...config.logging, enabled: true, mainChannelId: "123",
            allowedCategories: { ...config.logging.allowedCategories, economy: null } as Record<EventCategory, string | false | null>,
        };
        const guild = {
            channels: { fetch: async () => ({
                isTextBased: () => true,
                isSendable: () => true,
                send: async () => { throw Object.assign(new Error("Missing Access"), { code: 50001 }); },
            }) },
        } as any;
        let threw = false;
        await logAndBroadcastEvent(guild, {
            guildId, discordGuildId: TEST_DISCORD_GUILD, userId, category: "economy", eventType: "duel", source: "smokeLogCheck",
            timestamp: new Date(),
        }, config).catch(() => { threw = true; });
        await new Promise((r) => setTimeout(r, 50));
        check("logging did not throw", threw, false);
        await flushLogsForTest();
        const rows = await query(`SELECT 1 FROM events WHERE guild_id = $1 AND source = 'smokeLogCheck'`, [guildId]);
        check("the event row was still written", (rows.rowCount ?? 0) > 0, true);
    });

    await test("nobody can duel at 0 HP, and no gold moves", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, {}, 1000);
        await seed(fx.b, g, {}, 1000);
        await query(
            `UPDATE user_guild_profiles SET user_stats = COALESCE(user_stats, '{}'::jsonb) || jsonb_build_object('currentHp', 0, 'hpAt', $3::text)
             WHERE user_id = $1 AND guild_id = $2`,
            [fx.b.userId, g, new Date().toISOString()],
        );
        userGuildProfileCache.delete(profileKey(g, fx.b.userId));

        const config = mergeConfig(fx.guild.config);
        config.combat.enabled = true;
        config.logging.enabled = false;
        config.combat.pvp = { enabled: true, maxRounds: 50 };

        const outcome = await resolveDuel({
            guildId: g,
            challenger: { userId: fx.a.userId, discordUserId: fx.a.discordId, displayName: "A" },
            opponent: { userId: fx.b.userId, discordUserId: fx.b.discordId, displayName: "B" },
            wager: 100n,
            config,
        });
        check("the duel is refused", outcome.success, false);
        check("it says to heal", !outcome.success && outcome.message.includes("0 HP"), true);
        check("no gold moved", `${await goldOf(fx.a, g)}/${await goldOf(fx.b, g)}`, "1000/1000");
    });

    await test("/me shows level progress, HP, stats and what each piece of gear adds", async () => {
        const { userId, guildId, config } = await reset();
        config.combat.enabled = true;
        config.levels.curveType = "linear";
        config.levels.curveParams = { rate: 100 };
        config.levels.xpOverrides = {};
        config.shop.items = {
            ...config.shop.items,
            sword: { id: "sword", name: "Iron Sword", emoji: "🗡️", categoryId: "gear", price: 10, equipable: true, equipSlot: "weapon",
                effects: { stats: { atk: 8, def: 2 } } },
        };
        const { profile } = await getOrCreateProfile({ userId, guildId });
        profile.xp = "115";
        profile.equips = { weapon: "sword" };
        profile.inventory = { sword: { id: "sword", name: "Iron Sword", emoji: "🗡️", description: "", quantity: 1 } };

        const json = (parts: any[]) => JSON.stringify(parts.map((p) => p.toJSON()));
        const own = json(renderSheet(profile, config, "Tester", TEST_DISCORD_USER, true));
        check("level and progress from XP", own.includes("Level 2") && own.includes("15 / 100"), true);
        check("HP line present", own.includes("**HP**"), true);
        check("gear lists its bonus", own.includes("Iron Sword") && own.includes("+8 ATK, +2 DEF"), true);
        check("empty slots say so", own.includes("Head · _empty_"), true);
        check("your own sheet has inventory buttons", own.includes("inventory:gear:"), true);
        check("it shows your moves, and a Moves button", own.includes("**Moves** ⚔️ Attack") && own.includes("me:moves"), true);
        check("no collections, no Collection button", own.includes("me:collection"), false);
        config.shop.items.sword!.effects = { ...config.shop.items.sword!.effects, cosmetic: { title: "the Bold" } } as any;
        profile.user_stats = { ...profile.user_stats, ...afterLoss(calculateStats(profile, config, config.shop.items), config) } as any;
        const hurt = json(renderSheet(profile, config, "Tester", TEST_DISCORD_USER, true));
        check("gear's title follows the name, and Wounded says so", [hurt.includes("## Tester *the Bold*"), hurt.includes("Wounded")], [true, true]);
        check("with a pane, the picture leads the sheet", json(renderSheet(profile, config, "Tester", TEST_DISCORD_USER, true, undefined, true)).includes("attachment://me.png"), true);
        const png = await renderCharacterPane({ name: "Tester", combatLevel: 3, xp: 0.5, hp: 10, maxHp: 20, left: [{ label: "Head" }], right: [{ label: "Weapon" }] });
        check("the pane draws as a PNG", png.subarray(1, 4).toString(), "PNG");

        const theirs = json(renderSheet(profile, config, "Tester", TEST_DISCORD_USER, false));
        check("someone else's sheet has no buttons", theirs.includes("inventory:"), false);

        config.combat.enabled = false;
        const noCombat = json(renderSheet(profile, config, "Tester", TEST_DISCORD_USER, true));
        check("no HP or stats when combat is off", noCombat.includes("**HP**"), false);
    });

    await test("/setup in Discord: questions to a set-up server", async () => {
        // Setup rewrites the whole config; the tests after this one need it back as it was.
        const before = structuredClone((await reset()).config);
        let shown: any = null;
        const click = (customId: string, extra: Record<string, unknown> = {}) => handleSetupInteraction({
            customId, guildId: TEST_DISCORD_GUILD, guild: {}, user: { id: TEST_DISCORD_USER },
            memberPermissions: { has: () => true },
            isButton: () => !("values" in extra), isStringSelectMenu: () => "values" in extra && !extra.channel,
            isChannelSelectMenu: () => !!extra.channel, isModalSubmit: () => false,
            reply: async (p: any) => { shown = p; }, update: async (p: any) => { shown = p; },
            ...extra,
        } as any);
        const title = () => shown.embeds[0].data.description?.split("\n").find((l: string) => l.startsWith("**")) ?? shown.embeds[0].data.title;

        await click("setup:start");
        check("it starts by asking about leveling", title(), "**Who handles leveling here?**");
        await click("setup:lvl:other");
        check("with another leveling bot, pace is skipped", title(), "**What world should it start with?**");
        await click("setup:world", { values: ["classic-fantasy"] });
        await click("setup:names:keep");
        check("and so are level-up channels", shown.components[0].components[0].data.label, "Set it up");
        await click("setup:apply");
        const after = (await getOrCreateGuildConfig({ discordGuildId: TEST_DISCORD_GUILD })).config;
        check("the pack is in, leveling is off, the RPG is on", [Object.keys(after.combat.enemies ?? {}).length > 0, after.xp.enabled, after.combat.enabled], [true, false, true]);

        await setGuildConfig(TEST_DISCORD_GUILD, structuredClone(before));
        await click("setup:start");
        await click("setup:lvl:own");
        await click("setup:pace:relaxed");
        await click("setup:world", { values: ["blank"] });
        await click("setup:names:save", { isModalSubmit: () => true, isButton: () => false, isFromMessage: () => true, fields: { getTextInputValue: (id: string) => (id === "gold" ? "credits" : "rep") } });
        await click("setup:channel", { values: ["123"], channel: true });
        await click("setup:apply");
        const blank = (await getOrCreateGuildConfig({ discordGuildId: TEST_DISCORD_GUILD })).config;
        check("blank adds nothing and leaves the RPG off", [Object.keys(blank.combat.enemies ?? {}).length, blank.combat.enabled], [Object.keys(before.combat.enemies ?? {}).length, false]);
        check("the pace, names and channel are set", [blank.xp.basePerMessage, blank.style.gold.name, blank.style.xp.name, blank.levels.announceLevelUpInChannelId], [20, "credits", "rep", "123"]);
        check("and the pace sets Combat's curve too (Relaxed: twice as fast)", blank.combat.curve?.curveParams?.factor, 7.5);
        check("and it says where to build", shown.components[0].components[0].data.label, "Open the Library");

        // Blank on a server that's already playing leaves its switches alone.
        await setGuildConfig(TEST_DISCORD_GUILD, { ...structuredClone(before), combat: { ...before.combat, enabled: true }, shop: { ...before.shop, enabled: true } });
        await click("setup:start");
        await click("setup:lvl:own");
        await click("setup:pace:standard");
        await click("setup:world", { values: ["blank"] });
        await click("setup:names:keep");
        await click("setup:channel:skip");
        await click("setup:apply");
        const kept = (await getOrCreateGuildConfig({ discordGuildId: TEST_DISCORD_GUILD })).config;
        check("re-running setup with Blank keeps combat and the shop on", [kept.combat.enabled, kept.shop.enabled], [true, true]);
        await setGuildConfig(TEST_DISCORD_GUILD, before);
    });

    await test("balanced presets land near Classic Fantasy's own numbers", async () => {
        const cf = STARTER_PACKS.find((p) => p.id === "classic-fantasy")!.content as any;
        const near = (got: number, want: number, within = 0.3) => Math.abs(got - want) <= want * within;
        for (const [id, role] of [["grey-wolf", "normal"], ["roadside-bandit", "normal"], ["dire-wolf", "elite"], ["bandit-captain", "elite"], ["bridge-troll", "tough"], ["stone-golem", "tough"], ["hollow-king", "boss"]] as const) {
            const e = cf.combat.enemies[id];
            const p = enemyPreset(e.boss ? 1 : e.minLevel, role);
            check(`${role} at Combat ${e.minLevel} is about a ${e.name}`, [near(p.hp, e.hp), near(p.atk, e.atk), near(p.xpReward, e.xpReward)], [true, true, true]);
        }
        check("elites are rare, bosses are bosses", [enemyPreset(10, "elite").spawnWeight, enemyPreset(10, "boss").boss], [0.2, true]);
        for (const [id, slot, rarity] of [["knights-chainmail", "body", "rare"], ["knights-helm", "head", "rare"], ["iron-kite-shield", "shield", "uncommon"]] as const) {
            const it = cf.shop.items[id];
            const g = gearPreset(slot, it.minLevel, rarity);
            check(`${rarity} ${slot} at ${it.minLevel} is about ${it.name}`, [near(g.stats.def!, it.effects.stats.def), near(g.price, it.price, 0.4)], [true, true]);
        }
        check("stronger with level", enemyPreset(30, "normal").hp > enemyPreset(10, "normal").hp && gearPreset("weapon", 30, "rare").stats.atk! > gearPreset("weapon", 10, "rare").stats.atk!, true);
    });

    await test("characters: the game's posts under an owner-made name and picture", async () => {
        const cfg = structuredClone(DEFAULT_GUILD_CONFIG);
        cfg.characters = { list: {
            bram: { id: "bram", name: "Old Bram", avatar: "💰", lines: ["Fine wares!"] },
            king: { id: "king", name: "The Hollow King", avatar: "https://example.com/king.png" },
        }, shopkeeperId: "bram" };
        check("an emoji becomes a picture", speaker(cfg, "bram")?.avatarUrl?.endsWith(".png"), true);
        check("a link is used as is", speaker(cfg, "king")?.avatarUrl, "https://example.com/king.png");
        check("an unknown or unset character is nobody", [speaker(cfg, "gone"), speaker(cfg, undefined), announcer(cfg)], [null, null, null]);
        check("their line, quoted", lineOf(speaker(cfg, "bram")), "*“Fine wares!”*");
        let sent: any = null;
        const channel = { send: async (p: any) => { sent = p; return p; } } as any;
        await speak(channel, shopkeeper(cfg), { content: "✨ a rare find!" });
        check("without a webhook, their name leads the text", sent.content, "**Old Bram:** ✨ a rare find!");
        await speak(channel, speaker(cfg, "king"), { embeds: [new EmbedBuilder().setTitle("WORLD BOSS")] });
        check("or tops the embed, with their picture", [sent.embeds[0].data.author.name, sent.embeds[0].data.author.icon_url], ["The Hollow King", "https://example.com/king.png"]);
        await speak(channel, null, { content: "plain" });
        check("nobody: the bot posts as it always has", sent.content, "plain");
        // A /fight board is a command reply: Discord gives it the app's id as a webhook id. It's still the bot's to edit.
        let edited: any = null;
        const reply = { webhookId: "app-1", applicationId: "app-1", client: { application: { id: "app-1" } }, edit: async (p: any) => { edited = p; return p; } } as any;
        await editSpoken(reply, { content: "round 2" });
        check("a command reply is edited as the bot's own message", edited?.content, "round 2");
    });

    await test("unlocks: earn a role by progressing, and the channel behind it opens", async () => {
        const { userId, guildId, config } = await reset();
        config.combat.places = { crypt: { id: "crypt", name: "The Crypt", emoji: "⚰️", channelIds: ["c1"], enemies: [] } } as any;
        config.unlocks = { list: {
            crypt: { id: "crypt", roleId: "r-crypt", placeId: "crypt", requirements: { combatLevel: 5 } },
            unset: { id: "unset", roleId: "", requirements: {} },
        } };
        const profile = (await getOrCreateProfile({ userId, guildId })).profile;
        const fakeMember = (roles: string[]) => ({ roles }) as any; // the raw member shape: role ids in a list
        check("not yet at Combat 5", earned(config, profile, fakeMember([])).length, 0);
        addCombatXp(profile, config, combatXpForLevel(5, config));
        check("now they've earned it", earned(config, profile, fakeMember([])).map((u) => u.id), ["crypt"]);
        check("an unlock with no role earns nothing, and a held role isn't given twice", earned(config, profile, fakeMember(["r-crypt"])), []);

        let added: string | null = null;
        let said: any = null;
        const member = { roles: { add: async (r: string) => { added = r; } } };
        const client = {
            guilds: { cache: new Map([[TEST_DISCORD_GUILD, { members: { fetch: async () => member } }]]) },
            channels: { fetch: async () => ({ isTextBased: () => true, isSendable: () => true, send: async (p: any) => { said = p; } }) },
        } as any;
        await checkUnlocks({ client, config, discordUserId: TEST_DISCORD_USER, discordGuildId: TEST_DISCORD_GUILD, fallbackChannelId: "c1" });
        check("the role is given and the place announced", [added, said?.content], ["r-crypt", `🗺️ <@${TEST_DISCORD_USER}> unlocked **⚰️ The Crypt**!`]);
    });

    await test("a threaded fight's thread leaves the channel list when it ends", async () => {
        let line: any = null;
        let archived = false;
        const client = { channels: { fetch: async (id: string) => id === "chat"
            ? { isTextBased: () => true, messages: { edit: async (_: string, p: any) => { line = p; } } }
            : { isThread: () => true, archived: false, setArchived: async (on: boolean) => { archived = on; } } } } as any;
        await postResultLine(client, { channelId: "thread", origin: { channelId: "chat", messageId: "m" } } as any, "🏆 won");
        check("the result line is posted and the thread archived", [line?.content, archived], ["🏆 won", true]);
    });

    await test("re-adding a pack updates what the owner never touched, and keeps what they changed", async () => {
        const pack = STARTER_PACKS.find((p) => p.id === "classic-fantasy")!;
        const cf = pack.content as any;
        // A server that added Classic Fantasy before the retune: old prices, one renamed, one repriced by hand.
        const server: any = { shop: { items: {
            "knights-chainmail": { ...cf.shop.items["knights-chainmail"], price: 900, name: "Grandpa's Mail" },
            "knights-helm": { ...cf.shop.items["knights-helm"], price: 1500 },
        } } };
        const { updates, kept } = packChanges(server, pack);
        check("the untouched old price updates; the renamed name and the hand-set price don't", [updates.map((u) => `${u.id}.${u.field}`), kept], [["knights-chainmail.price"], 2]);
        const { config } = applyPack(server, pack);
        const items = (config.shop as any).items;
        check("after adding: the new price, their own name, their own price", [items["knights-chainmail"].price, items["knights-chainmail"].name, items["knights-helm"].price], [cf.shop.items["knights-chainmail"].price, "Grandpa's Mail", 1500]);
        check("adding again changes nothing more", packChanges(config, pack).updates.length, 0);
        check("values compare whatever their key order", stableJson({ b: 1, a: [{ d: 2, c: 3 }] }), stableJson({ a: [{ c: 3, d: 2 }], b: 1 }));
    });

    await test("gear upgrades: costs, chances, the strike, and a failure never takes the item", async () => {
        const { userId, guildId, config } = await reset();
        config.shop.items = { ...config.shop.items,
            sword: { id: "sword", name: "Iron Sword", emoji: "🗡️", categoryId: "gear", price: 250, equipable: true, equipSlot: "weapon", effects: { stats: { atk: 8 } } },
            ore: { id: "ore", name: "Ore", categoryId: "gear", price: 0 },
        } as any;
        const items = config.shop.items!;
        const sword = items.sword!;
        check("+1 costs a quarter of its value, always works, adds +1 ATK", nextStep(sword, 0, config), { to: 1, chance: 100, gold: 60, material: null, gain: { atk: 1 } });
        check("+4 and +5 are riskier, and +5 is the top", [nextStep(sword, 3, config)?.chance, nextStep(sword, 4, config)?.chance, nextStep(sword, 5, config)], [75, 50, null]);
        check("+5 on 8 ATK adds 5 (at least +1 a level)", upgradeBonus({ atk: 8 }, 5, 10), { atk: 5 });
        check("a perfect strike adds 15%, a miss takes 15% off", [chanceAfterStrike(50, "perfect", config), chanceAfterStrike(50, "ruin", config), chanceAfterStrike(100, "perfect", config)], [65, 35, 100]);

        const p = (await getOrCreateProfile({ userId, guildId })).profile;
        p.gold = "1000"; p.equips = { weapon: "sword" }; p.inventory = { sword: { id: "sword", name: "Iron Sword", quantity: 1 } } as any;
        const before = calculateStats(p, config, items).atk;
        const up = await attemptUpgrade({ userId, guildId, config, itemId: "sword", outcome: "made", roll: () => 0 });
        // A commit can hand back a fresh profile object: always read the cached one.
        const now = async () => (await getOrCreateProfile({ userId, guildId })).profile;
        const after = await now();
        check("a success raises the level and spends the gold", [up.ok && up.success, upgradeLevel(after, "sword"), after.gold], [true, 1, "940"]);
        check("and fights see it", calculateStats(after, config, items).atk, before + 1);
        check("and /me says +9 ATK for an 8 ATK sword at +1", JSON.stringify(renderSheet(after, config, "T", TEST_DISCORD_USER, true).map((x: any) => x.toJSON())).includes("Iron Sword +1** (+9 ATK)"), true);

        after.user_stats = { ...after.user_stats, upgrades: { sword: 3 } } as any;
        const fail = await attemptUpgrade({ userId, guildId, config, itemId: "sword", outcome: "made", roll: () => 0.99 });
        const failed = await now();
        check("a failure spends the cost but keeps the item and its level", [fail.ok && fail.success, upgradeLevel(failed, "sword"), failed.inventory?.sword?.quantity, failed.equips?.weapon], [false, 3, 1, "sword"]);

        config.shop.upgrades = { material: { itemId: "ore", perStep: 2 } };
        check("with a material, each step needs more of it", nextStep(sword, 3, config)?.material, { itemId: "ore", quantity: 8 });
        check("and without it, nothing happens", (await attemptUpgrade({ userId, guildId, config, itemId: "sword", outcome: "made", roll: () => 0 })).ok, false);
        config.shop.upgrades = { enabled: false };
        check("an owner can turn upgrades off", (await attemptUpgrade({ userId, guildId, config, itemId: "sword", outcome: "made" })).ok, false);
    });

    await test("every starter pack is self-contained", async () => {
        for (const pack of STARTER_PACKS) {
            const broken: string[] = [];
            const has = (kind: Kind, id: string) => !!entryOf(pack.content, { kind, id });
            for (const kind of Object.keys(KINDS) as Kind[]) {
                const [section, map] = KINDS[kind];
                for (const [id, entry] of Object.entries(((pack.content as any)[section]?.[map] ?? {}) as Record<string, any>)) {
                    for (const ref of refsOf(kind, entry)) if (!has(ref.kind, ref.id)) broken.push(`${kind}:${id} -> ${ref.kind}:${ref.id}`);
                    // The loose links the library doesn't follow still have to exist inside a pack.
                    if (entry.tool && !has("activities", entry.tool.activityId)) broken.push(`${id} tool -> ${entry.tool.activityId}`);
                    for (const a of Object.values(entry.actions ?? {}) as any[]) {
                        if (a.type === "learnRecipe" && !(pack.content as any).crafting?.stations?.[a.stationId]?.recipes?.[a.recipeId]) broken.push(`${id} teaches ${a.stationId}/${a.recipeId}`);
                        if (a.type === "learnMove" && !has("moves", a.moveId)) broken.push(`${id} teaches ${a.moveId}`);
                    }
                }
            }
            check(`${pack.name}: every reference resolves`, broken, []);
        }
        check("pack ids are unique", new Set(STARTER_PACKS.map((p) => p.id)).size, STARTER_PACKS.length);
    });

    await test("an AI-written world becomes a balanced, self-contained pack", async () => {
        const w = (name: string, emoji = "✨") => ({ name, emoji });
        const skeleton: Skeleton = {
            name: "Drowned City", tagline: "Salvage divers", description: "Under the lighthouse.",
            shopkeeper: w("Old Hesk"), announcer: w("The Keeper"),
            categories: { gear: w("Diving Kit"), potions: w("Tonics"), materials: w("Salvage"), tools: w("Tools") },
            statuses: { poison: w("Brine-sick"), weaken: w("Waterlogged"), enrage: w("Frenzied") },
            moves: [
                { ...w("Snap"), key: "snap", telegraph: "opens its jaws.", kind: "strike" },
                { ...w("Ink Cloud"), key: "ink", telegraph: "puffs up…", kind: "poison" },
                { ...w("Bad Move"), key: "bad", telegraph: "", kind: "explode" as any },
            ],
            materials: [{ ...w("Pearl"), key: "pearl", description: "Shiny." }],
            gear: [
                { ...w("Rusty Harpoon"), key: "h1", description: "", slot: "weapon", level: 1, rarity: "common" },
                { ...w("Deep Harpoon"), key: "h2", description: "", slot: "weapon", level: 99, rarity: "rare", crafted: true },
                { ...w("Rusty Harpoon"), key: "h3", description: "", slot: "head", level: 5, rarity: "common" },
            ],
            potions: [{ ...w("Kelp Tonic"), key: "tonic", description: "", level: 1 }],
            places: [{ ...w("The Shallows"), key: "shallows", arrival: "drifts closer" }, { ...w("Empty Reef"), key: "empty", arrival: "" }],
            enemies: [
                { ...w("Crab"), key: "crab", level: 2, role: "weak", place: "shallows", moves: ["snap", "nope", "bad"], drops: ["pearl", "nope"] },
                { ...w("Eel"), key: "eel", level: 0, role: "elite", place: "nowhere", moves: ["ink"], drops: [] },
                { ...w("The Leviathan"), key: "lev", level: 30, role: "boss", place: "shallows", moves: ["snap"], drops: ["pearl"] },
            ],
            quests: [{ name: "Crab Season", description: "", enemy: "crab", count: 500 }, { name: "Ghosts", description: "", enemy: "ghost", count: 3 }],
            activities: [
                {
                    ...w("Diving"), skillName: "Diving", game: "grid", words: { tile: "🫧", leave: "Surface", hazard: "" },
                    tools: [{ ...w("Lead Weights"), description: "" }],
                    locations: [
                        { ...w("Pier"), finds: [{ ...w("Shell"), key: "shell", description: "" }, { ...w("Rope"), key: "rope", description: "" }, { ...w("Black Pearl"), key: "bp", description: "" }] },
                        { ...w("Wreck"), finds: [{ ...w("Brass"), key: "brass", description: "" }] },
                        { ...w("Trench"), finds: [{ ...w("Ooze"), key: "ooze", description: "" }] },
                    ],
                },
                { ...w("Dancing"), skillName: "", game: "dance", words: {}, tools: [], locations: [] },
            ],
            stations: [{
                ...w("Workbench"), skillName: "Tinkering", style: "forge", words: { craft: "Tinker", forging: "" },
                recipes: [{ makes: "h2", uses: ["brass", "bp", "pearl", "nope"] }, { makes: "h2", uses: ["shell"] }, { makes: "ghost", uses: ["shell"] }, { makes: "tonic", uses: [] }],
            }],
        };
        const pack = buildPack(skeleton, "ai-test");
        const c = pack.content as any;
        const broken: string[] = [];
        for (const kind of Object.keys(KINDS) as Kind[]) {
            const [section, map] = KINDS[kind];
            for (const [id, entry] of Object.entries((c[section]?.[map] ?? {}) as Record<string, any>)) {
                for (const ref of refsOf(kind, entry)) if (!entryOf(c, ref)) broken.push(`${kind}:${id} -> ${ref.kind}:${ref.id}`);
            }
        }
        check("every reference resolves", broken, []);
        check("a move of an unknown kind is dropped", Object.keys(c.combat.moves), ["snap", "ink-cloud"]);
        check("unknown keys are dropped", c.combat.enemies.crab.moves, [{ moveId: "snap", weight: 3 }]);
        check("numbers come from the balance tables", c.combat.enemies.crab.hp, enemyPreset(2, "weak").hp);
        check("levels are clamped", [c.combat.enemies.eel.minLevel, c.shop.items["deep-harpoon"].minLevel], [1, 40]);
        check("names that repeat get their own ids", Object.keys(c.shop.items).filter((k) => k.startsWith("rusty-harpoon")), ["rusty-harpoon", "rusty-harpoon-2"]);
        check("an enemy in an unknown place goes to one by its level", c.combat.places["the-shallows"].enemies.map((e: any) => e.enemyId), ["crab", "eel"]);
        check("the boss lives in no place, and empty places are dropped", Object.keys(c.combat.places), ["the-shallows"]);
        check("a quest for an unknown enemy is dropped, counts clamped", Object.values(c.quests.quests).map((q: any) => q.conditions.target), [20]);
        check("the shop has its characters", [c.characters.shopkeeperId, c.characters.announcerId], ["old-hesk", "the-keeper"]);
        check("it adds like any pack", addEntries(null, c, [{ kind: "enemies", id: "crab" }]).added.length > 1, true);
        const diving = c.gathering.activities.diving;
        check("an unknown minigame is dropped", Object.keys(c.gathering.activities), ["diving"]);
        check("minigame words fill in what the model left out", [diving.words.tile, diving.words.leave, diving.words.hazard, diving.words.verb], ["🫧", "Surface", "💥", "mined"]);
        check("locations take Classic Fantasy's numbers by tier", [diving.locations.pier.minSkill, diving.locations.wreck.minSkill, diving.locations.trench.minSkill], [1, 15, 30]);
        check("a location never needs a better tool than there is", [diving.locations.wreck.minToolTier, diving.locations.trench.minToolTier], [1, undefined]);
        check("the third find is the rare one", diving.locations.pier.loot.map((l: any) => l.chance), [40, 50, 10]);
        check("tools point at their activity", c.shop.items["lead-weights"].tool, { activityId: "diving", tier: 1, bonus: 1 });
        const bench = c.crafting.stations.workbench;
        check("one recipe per output, from known inputs only", Object.keys(bench.recipes), ["deep-harpoon"]);
        check("a rare find is needed once", bench.recipes["deep-harpoon"].inputs, [{ itemId: "brass", quantity: 10 }, { itemId: "black-pearl", quantity: 1 }, { itemId: "pearl", quantity: 5 }]);
        check("crafted-only gear leaves the shop", [c.shop.items["deep-harpoon"].price, c.shop.items["deep-harpoon"].hidden], [0, true]);
        check("station words fill in what's left out", [bench.words.craft, bench.words.forging], ["Tinker", "Forging"]);
        const find = buildPack({ ...skeleton, activities: [{ ...skeleton.activities[0]!, game: "find", words: { prompt: "Look for it!" } }] }, "x").content.gathering!.activities.diving as any;
        check("words that drop a {placeholder} keep the default", find.words.prompt, "Search the undergrowth for the {target}!");
        check("apostrophes don't split ids", Object.keys(buildPack({ ...skeleton, materials: [{ ...w("Keeper's Relic"), key: "r", description: "" }] }, "x").content.shop.items).includes("keepers-relic"), true);
        // Replies aren't schema-checked: wrapped in prose, or missing whole parts, they still build.
        const loose = parseSkeleton('Here you go:\n```json\n{"name":"Tiny","enemies":[{"key":"a","name":"Ant","level":"3","moves":"no"}]}\n```');
        check("a loose reply still builds", Object.keys(buildPack(loose!, "x").content.combat.enemies), ["ant"]);
        check("a reply with no JSON is refused", parseSkeleton("Sorry, I can't."), null);
    });

    await test("the helper's changes are checked, then applied on a copy", async () => {
        const config: any = { combat: { enabled: true, places: { forest: { id: "forest", channelIds: ["1"] } } }, style: "odd" };
        const changes = cleanChanges([
            { path: ["combat", "places", "forest", "channelIds"], value: ["2"] },
            { path: ["unlocks", "list", "vet"], value: { id: "vet", roleId: "9", requirements: { combatLevel: 20 } } },
            { path: ["combat", "enabled"] },
            { path: ["combat"], value: {} },
            { path: ["__proto__", "x"], value: 1 },
            { path: ["style", "x"], value: 1 },
            "nonsense",
        ], config);
        check("bad paths are dropped", changes.map((c) => c.path.join(".")), ["combat.places.forest.channelIds", "unlocks.list.vet", "combat.enabled"]);
        const next: any = applyChanges(config, changes);
        check("a field is set", next.combat.places.forest.channelIds, ["2"]);
        check("a new section is made as needed", next.unlocks.list.vet.requirements.combatLevel, 20);
        check("a missing value deletes", "enabled" in next.combat, false);
        check("the original is untouched", [config.combat.places.forest.channelIds, config.combat.enabled], [["1"], true]);
        check("old values can be shown", valueAt(config, ["combat", "places", "forest", "channelIds"]), ["1"]);
    });

    await test("the content library adds one entry and what it needs", async () => {
        const source = STARTER_PACKS[0]!.content;
        const keys = (refs: Ref[]) => refs.map((r) => `${r.kind}:${r.id}`).sort();
        const wolf = plan(null, source, [{ kind: "enemies", id: "grey-wolf" }]);
        check("an enemy brings its moves, their statuses and its drops", [
            "enemies:grey-wolf", "moves:bite", "moves:howl", "statuses:enraged", "items:wolf-pelt", "items:travelers-boots",
        ].every((k) => keys(wolf).includes(k)), true);
        check("but not other enemies", keys(wolf).filter((k) => k.startsWith("enemies:")), ["enemies:grey-wolf"]);
        const mine = { shop: { items: { "wolf-pelt": { id: "wolf-pelt", name: "My Own Pelt" } } } } as any;
        const again = addEntries(mine, source, [{ kind: "enemies", id: "grey-wolf" }]);
        check("what the server has stays its own", [keys(again.added).includes("items:wolf-pelt"), (again.config.shop!.items as any)["wolf-pelt"].name], [false, "My Own Pelt"]);
        check("and adding it switches combat on", again.config.combat?.enabled, true);
        check("adding twice adds nothing", addEntries(again.config, source, [{ kind: "enemies", id: "grey-wolf" }]).added, []);
        const place = addEntries(null, source, [{ kind: "places", id: "old-road" }]);
        check("a place comes with its enemies, but none of the source's channels", [keys(place.added).includes("enemies:grey-wolf"), (place.config.combat!.places as any)["old-road"].channelIds], [true, []]);
        const smithing = plan(null, source, [{ kind: "stations", id: "smithing" }]);
        check("a station brings its recipes' ingredients and outputs", keys(smithing).includes("items:iron-sword"), true);
        check("requirements pull what they point at", refsOf("recipes" as any, { requirements: { found: ["ghostfin"], collections: ["satchel"] } }), [{ kind: "items", id: "ghostfin" }, { kind: "collections", id: "satchel" }]);
    });

    await test("the changelog post takes only the newest entry", async () => {
        const md = "# Changelog\n\nintro\n\n## v2 · today\n\n### New\n- **thing**\n\n## v1 · before\n\n- old";
        const entry = newestEntry(md);
        check("title is the newest heading", entry?.title, "v2 · today");
        check("sections become bold lines", entry?.body.startsWith("**New**"), true);
        check("older entries are left out", entry?.body.includes("old"), false);
        check("unreleased changes are not posted", newestEntry(md.replace("## v2", "## Unreleased\n\n- wip\n\n## v2"))?.title, "v2 · today");
        check("Discord gets one line per change", shortEntry("Big update. More words here.\n\n**Fights**\n- **Party fights.** Press Join to help.\n- plain"), "Big update.\n\n**Fights**\n- Party fights\n- plain");
        check("the real CHANGELOG.md has an entry", !!newestEntry(readFileSync(new URL("../../CHANGELOG.md", import.meta.url), "utf8")), true);
    });

    await test("the quest log explains each quest and accepts/claims from buttons", async () => {
        const { userId, guildId, config } = await reset();
        config.quests = {
            ...config.quests,
            enabled: true,
            quests: {
                chatter: {
                    id: "chatter", name: "Tavern Talk", description: "Share stories.", active: true, cooldown: 86400,
                    conditions: { type: "messages", target: 25, channelIds: ["111"] },
                    reward: { 0: { xp: 75, gold: 30 }, 1: { itemId: "potion", quantity: 2 } },
                },
            },
        };
        config.shop.items = { ...config.shop.items, potion: { id: "potion", name: "Healing Draught", emoji: "🧪", categoryId: "x", price: 5 } };
        await setGuildConfig(TEST_DISCORD_GUILD, config);
        guildConfigCache.clear();

        check("objective in words", objective(config.quests.quests.chatter!.conditions, config), "Send 25 messages in <#111>");
        const fresh = JSON.stringify(renderQuestLog(config, {}, 0).map((c: any) => c.toJSON()));
        check("shows the description", fresh.includes("Share stories."), true);
        check("shows rewards with item names", fresh.includes("Healing Draught ×2") && fresh.includes("75 Combat XP"), true);
        check("says how often it repeats", fresh.includes("daily"), true);
        check("offers Accept, not a typed id", fresh.includes("quests:accept:chatter:0"), true);

        let shown: any = null;
        const click = (customId: string) => handleQuestsButton({
            customId, guildId: TEST_DISCORD_GUILD, channelId: "c", inGuild: () => true,
            user: { id: TEST_DISCORD_USER, username: "smoke-test", displayAvatarURL: () => "" },
            member: null, client: { guilds: { cache: new Map() } },
            deferUpdate: async () => {}, editReply: async (p: any) => { shown = p; }, reply: async () => {},
        } as any);

        await click("quests:accept:chatter:0");
        let { profile } = await getOrCreateProfile({ userId, guildId });
        check("accepting starts the quest", !!profile.quests?.chatter?.acceptedAt, true);
        check("the log says so", JSON.stringify(shown.components[0].toJSON()).includes("Accepted"), true);

        // Finish it without sending 25 messages.
        profile.quests!.chatter = { ...profile.quests!.chatter!, progress: 25, completedAt: new Date().toISOString() };
        const goldBefore = BigInt(profile.gold);
        await click("quests:claim:chatter:0");
        ({ profile } = await getOrCreateProfile({ userId, guildId }));
        check("claiming pays the gold", (BigInt(profile.gold) - goldBefore).toString(), "30");
        check("and the item", profile.inventory?.potion?.quantity, 2);
        check("the quest resets for next time", `${profile.quests?.chatter?.completedAt}|${!!profile.quests?.chatter?.claimedAt}`, "null|true");
        const after = JSON.stringify(shown.components[0].toJSON());
        check("now on cooldown", after.includes("On cooldown"), true);
    });

    await test("winning fights and duels progresses combat quests", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, {}, 1000);
        await seed(fx.b, g, {}, 1000);
        const config = mergeConfig(fx.guild.config);
        config.combat.enabled = true;
        config.logging.enabled = false;
        config.combat.pvp = { enabled: true, rakePercent: 0, maxRounds: 50 };
        const quest = (id: string, conditions: any) => ({ id, name: id, description: "", active: true, cooldown: 0, conditions, reward: { 0: { gold: 1 } } });
        config.quests = { ...config.quests, enabled: true, quests: {
            wolves: quest("wolves", { type: "defeatEnemies", target: 2, enemyIds: ["wolf"] }),
            duels: quest("duels", { type: "winDuels", target: 1 }),
        } };
        const acceptedAt = new Date().toISOString();
        for (const who of [fx.a, fx.b]) {
            await flushProfileCacheToDb({ userId: who.userId, guildId: g, force: true });
            userGuildProfileCache.delete(profileKey(g, who.userId));
            await query(`UPDATE user_guild_profiles SET quests = $3 WHERE user_id = $1 AND guild_id = $2`,
                [who.userId, g, JSON.stringify({ wolves: { acceptedAt, progress: 0 }, duels: { acceptedAt, progress: 0 } })]);
        }
        const state = async (who: typeof fx.a) => (await getOrCreateProfile({ userId: who.userId, guildId: g })).profile.quests as any;

        const win = { outcome: "win", xpGained: 0, goldGained: 0, goldLost: 0, itemsDropped: [], rounds: 1, totalDamageDealt: 1, totalDamageTaken: 0 } as const;
        const beat = async (enemyId: string) => {
            const { profile } = await getOrCreateProfile({ userId: fx.a.userId, guildId: g });
            await applyFightRewards({ ...win, itemsDropped: [] }, { combatType: "pve", enemy: { id: enemyId } } as any, { hp: 50, stats: { maxHp: 100 } } as any, profile, config);
        };
        await beat("slime");
        check("other enemies don't count", (await state(fx.a)).wolves.progress, 0);
        await beat("wolf");
        await beat("wolf");
        check("two wolves complete it", !!(await state(fx.a)).wolves.completedAt, true);

        const outcome = await resolveDuel({
            guildId: g,
            challenger: { userId: fx.a.userId, discordUserId: fx.a.discordId, displayName: "A" },
            opponent: { userId: fx.b.userId, discordUserId: fx.b.discordId, displayName: "B" },
            wager: 10n,
            config,
        });
        check("duel resolved", outcome.success, true);
        if (!outcome.success || !outcome.result.winnerDiscordId) return;
        const [winner, loser] = outcome.result.winnerDiscordId === fx.a.discordId ? [fx.a, fx.b] : [fx.b, fx.a];
        check("the winner's duel quest is done", !!(await state(winner)).duels.completedAt, true);
        check("the loser's is not", (await state(loser)).duels.progress, 0);
    });

    await test("fights: potions take a turn, walking away keeps your wounds, other actions wait", async () => {
        const fx = await resetTrades();
        const g = fx.guild.id;
        await seed(fx.a, g, {}, 100);
        const config = mergeConfig(fx.guild.config);
        config.combat.enabled = true;
        config.logging.enabled = false;
        config.shop.items = {
            ...config.shop.items,
            draught: { id: "draught", name: "Draught", emoji: "🧪", categoryId: "x", price: 5, permanent: false,
                actions: { 0: { type: "giveStat", statId: "health", amount: 30 } } } as any,
            sword: { id: "sword", name: "Sword", categoryId: "x", price: 5, equipable: true, equipSlot: "weapon", permanent: true } as any,
        };
        await setGuildConfig(fx.guild.discord_guild_id, config);
        guildConfigCache.clear();

        // No attack, so every swing does the minimum 1 damage; too much HP to die.
        const enemy: EnemyConfig = {
            id: "brute", name: "Brute", emoji: "🪨", hp: 100000, atk: 0, def: 0, spd: 1, critChance: 0, critMultiplier: 1,
            minLevel: 0, maxLevel: null, xpReward: 0, goldReward: 0, drops: [], moves: [{ moveId: "attack" }],
        };
        const profile = await row(fx.a, g);
        profile.inventory = { draught: { id: "draught", name: "Draught", quantity: 2 } } as any;
        const fight = startFight({
            discordUserId: fx.a.discordId, discordGuildId: fx.guild.discord_guild_id,
            messageId: "smoke-fight-potion", channelId: "smoke-channel", combatType: "pve", profile, enemy, config, loadout: ["attack"], name: "A",
        });
        fight.members[0]!.hp = 20;

        const row1 = JSON.stringify(buildActionRows(fight.members[0]!, profile, config).map((r) => r.toJSON()));
        check("a potion button shows with its count", row1.includes("fight:potion:draught") && row1.includes("Draught ×2"), true);
        check("gear gets no button", row1.includes("sword"), false);

        const drink = applyAction(fight, "potion:draught", fx.guild, profile, config);
        check("drinking heals, then the enemy still swings", fight.members[0]!.hp, 49);
        check("and it uses the turn", fight.round, 1);
        check("the log says what it did", drink.result.log[0]!.includes("+30 HP"), true);
        check("a non-potion can't be drunk", applyAction(fight, "potion:sword", fx.guild, profile, config).result.log[0], "That isn't one of your moves.");

        // Other HP and gear changes wait; the reply links to the fight.
        const busy = busyFighting(fx.a.discordId, fx.guild.discord_guild_id, "Later.");
        check("other actions are told to wait, with a link", busy?.includes(`/channels/${fx.guild.discord_guild_id}/smoke-channel/smoke-fight-potion`), true);
        const fake = { guild: { id: fx.guild.discord_guild_id }, user: { id: fx.a.discordId } } as any;
        check("/use waits during a fight", (await useItemFromInventory(fake, "draught", 1)).success, false);
        check("/equip waits during a fight", (await equipItemFromInventory(fake, "sword")).success, false);

        // Walking away: a flee that keeps the damage, with no penalty.
        fight.members[0]!.hp = 7;
        const client = { channels: { fetch: async () => null } } as any;
        await abandonFight(fight, client, "timeout");
        await flushDirtyProfiles(true);
        const after = await row(fx.a, g);
        check("the fight is over", getActiveFight(fx.a.discordId, fx.guild.discord_guild_id), null);
        check("the HP lost stays lost", (after.user_stats as any)?.currentHp, 7);
        check("no gold penalty", await goldOf(fx.a, g), "100");
        check("not a loss either", (after.user_stats as any)?.fightsLost ?? 0, 0);
        await abandonFight(fight, client, "restart");
        await flushDirtyProfiles(true);
        check("ending it twice changes nothing", (await row(fx.a, g)).user_stats?.currentHp, 7);
    });

    await test("fight moves: telegraphs, guard and counter, cooldowns, statuses, stuns and drawbacks", async () => {
        const fightWith = (cfg: GuildConfig, enemy: Partial<EnemyConfig>, you: Partial<CombatStats> = {}): ActiveFight => {
            const f = handFight(enemy, you);
            f.enemyIntent = pickIntent(f, cfg);
            return f;
        };
        const base = DEFAULT_GUILD_CONFIG;
        const move = (id: string): PlayerChoice => ({ kind: "move", moveId: id });

        // Plain trade: 20 dealt, 10 taken.
        const plain = fightWith(base, { moves: [{ moveId: "attack" }] });
        check("the enemy's next move is picked and shown", intentLine(plain, base).includes("gets ready to strike"), true);
        playTurn(plain, { u: move("attack") }, base);
        check("attack trades blows", [plain.enemyCurrentHp, plain.members[0]!.hp], [80, 90]);

        // Guard against a heavy hit: 22 x 40% = 9 taken, 30% of that countered back.
        const guarded = fightWith(base, { moves: [{ moveId: "heavy" }] });
        const g1 = playTurn(guarded, { u: move("guard") }, base);
        check("guard blocks most of a heavy hit", guarded.members[0]!.hp, 91);
        check("and counters it", [guarded.enemyCurrentHp, g1.log.some((l) => l.includes("countered"))], [97, true]);
        check("a heavy hit coming turns the message red", intentThreat(fightWith(base, { moves: [{ moveId: "heavy" }] }), base), "danger");

        // Heavy Strike: big hit, your defense drops for the enemy's swing, then a 2-turn cooldown.
        const heavy = fightWith(base, { moves: [{ moveId: "attack" }] }, { def: 10 });
        playTurn(heavy, { u: move("heavy") }, base);
        check("heavy hits 220%", heavy.enemyCurrentHp, 56);
        check("its drawback lowers your defense for the enemy's swing", heavy.members[0]!.hp, 94);
        const heavyMove = moveById(base, "heavy");
        const ready: boolean[] = [usable(heavy.members[0]!.state, heavyMove)];
        playTurn(heavy, { u: move("attack") }, base); ready.push(usable(heavy.members[0]!.state, heavyMove));
        playTurn(heavy, { u: move("attack") }, base); ready.push(usable(heavy.members[0]!.state, heavyMove));
        check("a 2-turn cooldown skips two turns", ready, [false, false, true]);
        const waiting = fightWith(base, { moves: [{ moveId: "attack" }] });
        waiting.members[0]!.state.cooldowns.heavy = 2;
        check("a move on cooldown isn't played", applyAction(waiting, "move:heavy", {} as any, {} as any, base).result.log[0], "⌛ **Heavy Strike** isn't ready yet.");

        // A status, and a move that hits harder against it.
        const custom = {
            ...base,
            combat: {
                ...base.combat,
                moves: {
                    ...DEFAULT_MOVES,
                    idle: { id: "idle", name: "Idle", emoji: "💤", effects: [] },
                    rend: { id: "rend", name: "Rend", emoji: "🩸", effects: [{ type: "hit", power: 0.5 }, { type: "status", statusId: "bleed", turns: 3 }], players: {} },
                    execute: { id: "execute", name: "Execute", emoji: "🗡️", effects: [{ type: "hit", power: 1 }, { type: "hit", power: 1.5, when: { type: "targetHasStatus", statusId: "bleed" } }], players: {} },
                    ritual: { id: "ritual", name: "Dark Ritual", emoji: "🌑", telegraph: "gathers shadow…", charge: 2, effects: [{ type: "hit", power: 3 }] },
                    bash: { id: "bash", name: "Shield Bash", emoji: "🛡️", effects: [{ type: "hit", power: 0.5 }, { type: "stun" }], players: { requirements: { combatLevel: 50 } } },
                    pact: { id: "pact", name: "Blood Pact", emoji: "🩸", effects: [{ type: "hit", power: 2 }, { type: "heal", percent: -500 }], players: {} },
                },
            },
        } as GuildConfig;
        const bleed = fightWith(custom, { moves: [{ moveId: "idle" }] });
        playTurn(bleed, { u: move("rend") }, custom);
        check("rend hits and the bleed ticks at the end of the turn", [bleed.enemyCurrentHp, bleed.foe.statuses.bleed], [85, 2]);
        playTurn(bleed, { u: move("execute") }, custom);
        check("execute hits harder while the target bleeds", bleed.enemyCurrentHp, 30);

        // A wind-up: it fires on the third turn unless it's stunned first.
        const ritual = fightWith(custom, { moves: [{ moveId: "ritual" }] });
        playTurn(ritual, { u: move("attack") }, custom);
        playTurn(ritual, { u: move("attack") }, custom);
        check("the warning says it's about to go off", intentLine(ritual, custom).includes("unleashes **Dark Ritual** this turn"), true);
        playTurn(ritual, { u: move("attack") }, custom);
        check("an unanswered wind-up lands", ritual.members[0]!.hp, 70);
        const stopped = fightWith(custom, { moves: [{ moveId: "ritual" }] });
        playTurn(stopped, { u: move("attack") }, custom);
        playTurn(stopped, { u: move("attack") }, custom);
        const s3 = playTurn(stopped, { u: move("bash") }, custom);
        check("a stun interrupts it", [stopped.members[0]!.hp, !!stopped.foe.charging, s3.log.some((l) => l.includes("interrupted"))], [100, false, true]);

        // Speed decides who goes first: a faster enemy's hit lands before your stun.
        const fast = fightWith(custom, { moves: [{ moveId: "attack" }], spd: 50 });
        check("the footer says who acts first", turnOrderLine(fast, custom), "⚡ Ogre is faster: it acts first");
        const f1 = playTurn(fast, { u: move("bash") }, custom);
        check("the faster side swings first", [f1.log[0]!.startsWith("⚔️ **Ogre**"), fast.members[0]!.hp], [true, 90]);
        const slow = fightWith(custom, { moves: [{ moveId: "attack" }], spd: 1 });
        check("slower enemies wait their turn", turnOrderLine(slow, custom), "You act first");
        playTurn(slow, { u: move("bash") }, custom);
        check("so a stun stops their swing", slow.members[0]!.hp, 100);

        // A drawback that costs HP never kills you.
        const pact = fightWith(custom, { moves: [{ moveId: "idle" }] });
        playTurn(pact, { u: move("pact") }, custom);
        check("losing HP to your own move stops at 1", pact.members[0]!.hp, 1);

        // Plain-language text, with drawbacks apart.
        const said = describeMove(heavyMove, base);
        check("a move describes itself", said, { does: ["Deals 220% damage.", "2-turn cooldown."], drawbacks: ["Your DEF drops 30% this turn."] });

        // What a player brings: requirements, a picked loadout, gear.
        const profile = { level: 1, xp: "0", user_stats: {}, equips: {} } as any;
        const facts = { roleIds: [], joinedAt: null, boosting: false };
        check("a move behind requirements isn't available", loadoutFor(profile, custom, facts).includes("bash"), false);
        profile.user_stats = { moves: { loadout: ["pact"] } };
        check("the picked move goes first", loadoutFor(profile, custom, facts)[0], "pact");
        const geared = { ...custom, shop: { ...custom.shop, items: { shield: { id: "shield", name: "Shield", effects: { moves: ["bash"] } } as any } } } as GuildConfig;
        profile.equips = { offhand: "shield" };
        check("gear gives its move, requirements or not", loadoutFor(profile, geared, facts).includes("bash"), true);

        // The health check names broken references.
        const broken = structuredClone(custom);
        broken.combat.enabled = true;
        broken.combat.enemies = { ogre: { id: "ogre", name: "Ogre", emoji: "👹", hp: 10, atk: 1, def: 0, spd: 1, critChance: 0, critMultiplier: 1, minLevel: 0, maxLevel: null, xpReward: 0, goldReward: 0, drops: [], moves: [{ moveId: "gone" }] } };
        broken.combat.statuses = {};
        broken.shop.items = { blade: { id: "blade", name: "Blade", effects: { moves: ["vanished"] } } as any };
        const allOk: Access = { channelName: () => "general", missingIn: () => [], roleName: () => "Hero", canManageRole: () => true, canManageWebhooks: () => true };
        const health = checkGuild(broken, allOk).map((i) => i.message).join("\n");
        check("the health check finds broken move references", [
            health.includes("The enemy Ogre uses a move that was deleted (gone)"),
            health.includes("The move Rend uses a status that was deleted (bleed)"),
            health.includes("The move Idle does nothing"),
            health.includes("The item Blade gives a move that was deleted (vanished)"),
        ], [true, true, true, true]);
    });

    await test("the health check finds setups that will fail quietly", async () => {
        const base = structuredClone(DEFAULT_GUILD_CONFIG);
        const allOk: Access = { channelName: () => "general", missingIn: () => [], roleName: () => "Hero", canManageRole: () => true, canManageWebhooks: () => true };
        check("a fresh server has nothing to fix", checkGuild(base, allOk).length, 0);

        const c = structuredClone(DEFAULT_GUILD_CONFIG);
        c.levels.announceLevelUpInChannelId = "levels";
        c.levels.levelActions = { 10: [{ type: "assignRole", roleId: "veteran" }] };
        c.logging = { ...c.logging, enabled: true, mainChannelId: "gone" };
        c.combat.enabled = true;
        c.shop.enabled = true;
        c.quests = { ...c.quests, enabled: true, quests: {
            q: { id: "q", name: "Hunt", description: "", active: true, cooldown: 0, conditions: { type: "earnXp", target: 10 }, reward: { 0: { itemId: "ghost" } } },
        } };
        const access: Access = {
            channelName: (id) => (id === "gone" ? null : id),
            missingIn: (id, perms) => (id === "levels" ? perms.filter((p) => p === "files") : []),
            roleName: (id) => (id === "veteran" ? "Veteran" : null),
            canManageRole: () => false,
            canManageWebhooks: () => true,
        };
        const msgs = checkGuild(c, access).map((i) => `${i.severity}:${i.page}:${i.message}`);
        const has = (part: string) => msgs.some((m) => m.includes(part));
        check("a missing permission is named", has("can't post level-up announcements in #levels. Give it Attach Files"), true);
        check("a deleted channel is caught", has("The logs channel was deleted"), true);
        check("a role it can't give is caught", has("can't give @Veteran (the level 10 reward)"), true);
        check("combat with no enemies", has("Combat is on but there are no enemies"), true);
        check("an empty shop", has("The shop is open but has nothing for sale"), true);
        check("a reward pointing at a deleted item", has("The quest Hunt gives an item that no longer exists (ghost)"), true);
        const firstWarning = msgs.findIndex((m) => m.startsWith("warning"));
        check("errors are listed before warnings", msgs.slice(firstWarning).every((m) => m.startsWith("warning")), true);
    });

    await test("using and equipping say what changed, by name", async () => {
        const { userId, guildId, config } = await reset();
        config.combat.enabled = true;
        config.shop.items = {
            ...config.shop.items,
            draught: { id: "draught", name: "Healing Draught", emoji: "🧪", categoryId: "x", price: 5,
                actions: { 0: { type: "giveStat", statId: "health", amount: 50 } } },
            sword: { id: "sword", name: "Iron Sword", emoji: "🗡️", categoryId: "x", price: 5, equipable: true, equipSlot: "weapon",
                effects: { stats: { atk: 8 } } },
        };
        await setGuildConfig(TEST_DISCORD_GUILD, config);
        guildConfigCache.clear();

        const { profile } = await getOrCreateProfile({ userId, guildId });
        profile.inventory = {
            draught: { id: "draught", name: "Healing Draught", emoji: "🧪", description: "", quantity: 2 },
            sword: { id: "sword", name: "Iron Sword", emoji: "🗡️", description: "", quantity: 1 },
        };
        profile.user_stats = { ...profile.user_stats, ...storeHp(20) };

        const interaction = {
            guild: { id: TEST_DISCORD_GUILD, members: { fetch: async () => null } },
            user: { id: TEST_DISCORD_USER }, client: {}, channelId: "c",
        } as any;

        const used = await useItemFromInventory(interaction, "draught", 1);
        check("use succeeds", used.success, true);
        check("names the item", used.message.includes("🧪 **Healing Draught**"), true);
        check("shows the HP change", /❤️ 20 → 70 \/ \d+ HP/.test(used.message), true);
        check("says how many are left", used.message.includes("1 left."), true);
        check("no raw ids", used.message.includes("`draught`"), false);

        const equipped = await equipItemFromInventory(interaction, "sword");
        check("equip names the item and slot", equipped.message.startsWith("Equipped 🗡️ **Iron Sword** (weapon)"), true);
        check("equip shows the attack change", /⚔️ ATK \d+ → \d+/.test(equipped.message), true);

        const off = await equipItemFromInventory(interaction, "", "weapon");
        check("unequip shows the attack going back down", off.message.startsWith("Took off 🗡️ **Iron Sword**") && /⚔️ ATK/.test(off.message), true);
    });

    console.log(`\n${"─".repeat(60)}`);
    console.log(`${passed} passed, ${failed} failed`);
    await closePool();
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
    console.error(err);
    await closePool().catch(() => null);
    process.exit(1);
});
