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
 *   npm --workspace rpgbot run smoke
 *
 * See scripts/setup-test-db.sh for creating the scratch schema.
 */
// MUST be first: it loads DATABASE_URL before db/index.ts builds its Pool.
import "./loadTestEnv.js";
import { upsertUser } from "../src/db/users.js";
import { upsertGuild, setGuildConfig, mergeConfig, getGuildByDiscordId } from "../src/db/guilds.js";
import { addMessageXp, grantDailyXp, getUserGuildProfile, upsertUserGuildProfile } from "../src/db/userGuildProfiles.js";
import { getOrCreateProfile, flushProfileCacheToDb } from "../src/cache/profileService.js";
import { flushDirtyProfiles, userGuildProfileCache, profileKey, guildConfigCache } from "../src/cache/caches.js";
import { query, closePool } from "../src/db/index.js";
import { createTrade, acceptTrade, denyTrade, cancelTrade } from "../src/db/trade.js";
import { updateInventory } from "../src/player/inventory.js";
import type { DbGuild, GuildConfig } from "../src/types/guild.js";
import type { DbUserGuildProfile, item } from "../src/types/userprofile.js";
import type { shopItemConfig } from "../src/types/economy.js";

// ─── Tiny assertion harness ───────────────────────────────────────────────────

let passed = 0;
let failed = 0;

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
