import type { shopItemConfig } from "../types/economy.js";
import type { DbGuild } from "../types/guild.js";
import type { DbTrade, DbTradeRow, Trade, TradeStatus } from "../types/trading.js";
import type { DbUserGuildProfile, item } from "../types/userprofile.js";
import { query, withTransaction } from "./index.js";
import { flushProfileCacheToDb } from "../cache/profileService.js";
import { profileKey, userGuildProfileCache } from "../cache/caches.js";

export async function createTrade(trade: Trade, guild: DbGuild): Promise<{success: boolean; tradeId: string | null}> {
    const asker = trade.asker;
    const receiver = trade.receiver;

    const items = guild.config?.shop.items || [];

    // asker validation

    const askerInventory = asker.inventory;
    for(const [itemId, quantity] of Object.entries(trade.askerItems)) {
        if(!askerInventory[itemId]) {
            return { success: false, tradeId: null };
        }

        if(trade.askerItems[itemId] && askerInventory[itemId].quantity < quantity) {
            return { success: false, tradeId: null };
        }

        if(!(items as Record<string, shopItemConfig>)[itemId]) {
            return { success: false, tradeId: null };
        }
    }
    const askerGold = trade.askerGold;
    if(askerGold > Number(asker.gold)) {
        return { success: false, tradeId: null };
    }

    // receiver validation

    const receiverInventory = receiver.inventory;
    for(const [itemId, quantity] of Object.entries(trade.receiverItems)) {
        if(!receiverInventory[itemId]) {
            return { success: false, tradeId: null };
        }

        if(trade.receiverItems[itemId] && receiverInventory[itemId].quantity < quantity) {
            return { success: false, tradeId: null };
        }

        if(!(items as Record<string, shopItemConfig>)[itemId]) {
            return { success: false, tradeId: null };
        }
    }
    const receiverGold = trade.receiverGold;
    if(receiverGold > Number(receiver.gold)) {
        return { success: false, tradeId: null };
    }

    const newTradeDb: DbTrade = {
        guildId: String(guild.id),
        discordGuildId: guild.discord_guild_id,
        asker: trade.asker,
        askerDiscordId: trade.askerDiscordId,
        receiver: trade.receiver,
        receiverDiscordId: trade.receiverDiscordId,
        askerItems: trade.askerItems,
        receiverItems: trade.receiverItems,
        askerGold: trade.askerGold,
        receiverGold: trade.receiverGold,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }

    const res = await query(
        `INSERT INTO trades
        (guild_id, discord_guild_id, asker_profile_id, asker_discord_id, receiver_profile_id, receiver_discord_id, asker_items, receiver_items, asker_gold, receiver_gold, status, created_at, updated_at, expires_at)
        VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id`,
        [
            newTradeDb.guildId,
            newTradeDb.discordGuildId,
            newTradeDb.asker.id,
            newTradeDb.askerDiscordId,
            newTradeDb.receiver.id,
            newTradeDb.receiverDiscordId,
            JSON.stringify(newTradeDb.askerItems),
            JSON.stringify(newTradeDb.receiverItems),
            newTradeDb.askerGold,
            newTradeDb.receiverGold,
            newTradeDb.status,
            newTradeDb.createdAt,
            newTradeDb.updatedAt,
            newTradeDb.expiresAt
        ]
    )

    if(!res.rows[0] || !res.rows[0].id) {
        return { success: false, tradeId: null };
    }

    return { success: true, tradeId: res.rows[0].id };
}

export async function viewTrades(args: { guildId: string; status?: TradeStatus; askerId?: string; receiverId?: string }): Promise<DbTradeRow[] | false> {
    const conditions: string[] = [];
    const values: any[] = [];
    let index = 1;

    if (args.guildId) {
        conditions.push(`guild_id = $${index++}`);
        values.push(args.guildId);
    }

    if (args.status) {
        conditions.push(`status = $${index++}`);
        values.push(args.status);
    }

    if (args.askerId) {
        conditions.push(`asker_profile_id = $${index++}`);
        values.push(args.askerId);
    }

    if (args.receiverId) {
        conditions.push(`receiver_profile_id = $${index++}`);
        values.push(args.receiverId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const res = await query(
        `SELECT * FROM trades ${whereClause}`,
        values
    );

    if (!res.rows) {
        return false;
    }

    return res.rows as DbTradeRow[];
}

/** Row shape when we lock a profile inside the trade transaction. */
type LockedProfile = {
    id: string;
    user_id: number;
    guild_id: number;
    gold: string;
    inventory: Record<string, item> | null;
};

/**
 * Moves `qty` of `itemId` out of `from` and into `to`, creating the destination
 * slot from shop metadata when the receiver doesn't own the item yet.
 *
 * Shared with the gifting path. `from` and `to` must be distinct objects, so a
 * caller handing over both sides of the same profile has to reject that first.
 */
export function moveItem(
    from: Record<string, item>,
    to: Record<string, item>,
    itemId: string,
    qty: number,
    shopItems: Record<string, shopItemConfig>,
): void {
    const fromSlot = from[itemId];
    if (fromSlot) {
        fromSlot.quantity -= qty;
        if (fromSlot.quantity <= 0) delete from[itemId];
    }

    const toSlot = to[itemId];
    if (toSlot) {
        toSlot.quantity += qty;
        return;
    }

    const shopItem = shopItems[itemId];
    to[itemId] = {
        id: itemId,
        name: shopItem?.name ?? itemId,
        quantity: qty,
        ...(shopItem?.emoji !== undefined && { emoji: shopItem.emoji }),
        ...(shopItem?.description !== undefined && { description: shopItem.description }),
    };
}

export async function acceptTrade(
    tradeId: string,
    acceptorProfile: DbUserGuildProfile,
    guild: DbGuild
): Promise<{ success: boolean; message: string }> {
    // Profile writes are normally buffered in the write-back cache, so the rows in
    // Postgres can lag reality by up to 30s. Push both sides' pending changes down
    // first so the transaction below can treat the DB as authoritative.
    const partiesRes = await query<{ id: string; user_id: number; guild_id: number }>(
        `SELECT p.id, p.user_id, p.guild_id
         FROM trades t
         JOIN user_guild_profiles p
           ON p.id IN (t.asker_profile_id, t.receiver_profile_id)
         WHERE t.id = $1`,
        [tradeId]
    );

    if (partiesRes.rows.length === 0) {
        return { success: false, message: `Trade \`#${tradeId}\` not found.` };
    }

    for (const party of partiesRes.rows) {
        await flushProfileCacheToDb({ userId: party.user_id, guildId: party.guild_id, force: true });
    }

    const shopItems = (guild.config?.shop?.items ?? {}) as Record<string, shopItemConfig>;

    let touched: Array<{ userId: number; guildId: number }> = [];

    try {
        const result = await withTransaction(async (client) => {
            // Lock the trade first so two accepts of the same offer serialize.
            const tradeRes = await client.query<DbTradeRow>(
                `SELECT * FROM trades WHERE id = $1 FOR UPDATE`,
                [tradeId]
            );
            const row = tradeRes.rows[0];

            if (!row) return { success: false, message: `Trade \`#${tradeId}\` not found.` };
            if (row.status !== "pending") {
                return { success: false, message: `Trade \`#${tradeId}\` is no longer pending (status: ${row.status}).` };
            }
            if (String(row.receiver_profile_id) !== String(acceptorProfile.id)) {
                return { success: false, message: "You are not the receiver of this trade." };
            }
            if (row.expires_at && new Date(row.expires_at) < new Date()) {
                await client.query(`UPDATE trades SET status = 'expired', updated_at = NOW() WHERE id = $1`, [tradeId]);
                return { success: false, message: "That trade has expired." };
            }

            // Lock both profiles in ascending id order. Every trade takes these
            // locks in the same order, so two crossing trades cannot deadlock.
            const [firstId, secondId] = [String(row.asker_profile_id), String(row.receiver_profile_id)]
                .sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));

            const locked = new Map<string, LockedProfile>();
            for (const profileId of [firstId, secondId]) {
                const res = await client.query<LockedProfile>(
                    `SELECT id, user_id, guild_id, gold, inventory
                     FROM user_guild_profiles WHERE id = $1 FOR UPDATE`,
                    [profileId]
                );
                const locked_row = res.rows[0];
                if (!locked_row) {
                    return { success: false, message: "One of the traders no longer has a profile in this server." };
                }
                locked.set(String(locked_row.id), locked_row);
            }

            const asker = locked.get(String(row.asker_profile_id))!;
            const receiver = locked.get(String(row.receiver_profile_id))!;

            const askerInventory = asker.inventory ?? {};
            const receiverInventory = receiver.inventory ?? {};
            const askerItems: Record<string, number> = row.asker_items ?? {};
            const receiverItems: Record<string, number> = row.receiver_items ?? {};

            // Re-validate against the locked rows: the offer may have been made
            // before either side spent the items or gold it promised.
            for (const [itemId, qty] of Object.entries(askerItems)) {
                const slot = askerInventory[itemId];
                if (!slot || slot.quantity < qty) {
                    return { success: false, message: `The sender no longer has enough \`${itemId}\` to complete this trade.` };
                }
            }
            for (const [itemId, qty] of Object.entries(receiverItems)) {
                const slot = receiverInventory[itemId];
                if (!slot || slot.quantity < qty) {
                    return { success: false, message: `You no longer have enough \`${itemId}\` to complete this trade.` };
                }
            }

            const askerGoldOffer = BigInt(row.asker_gold ?? 0);
            const receiverGoldOffer = BigInt(row.receiver_gold ?? 0);
            const askerGold = BigInt(asker.gold ?? 0);
            const receiverGold = BigInt(receiver.gold ?? 0);

            if (askerGold < askerGoldOffer) {
                return { success: false, message: "The sender no longer has enough gold." };
            }
            if (receiverGold < receiverGoldOffer) {
                return { success: false, message: "You no longer have enough gold." };
            }

            // ── Execute the swap ────────────────────────────────────────────
            for (const [itemId, qty] of Object.entries(askerItems)) {
                moveItem(askerInventory, receiverInventory, itemId, qty, shopItems);
            }
            for (const [itemId, qty] of Object.entries(receiverItems)) {
                moveItem(receiverInventory, askerInventory, itemId, qty, shopItems);
            }

            const askerNewGold = askerGold - askerGoldOffer + receiverGoldOffer;
            const receiverNewGold = receiverGold - receiverGoldOffer + askerGoldOffer;

            await client.query(
                `UPDATE user_guild_profiles
                 SET inventory = $2, gold = $3, updated_at = NOW()
                 WHERE id = $1`,
                [asker.id, JSON.stringify(askerInventory), askerNewGold.toString()]
            );
            await client.query(
                `UPDATE user_guild_profiles
                 SET inventory = $2, gold = $3, updated_at = NOW()
                 WHERE id = $1`,
                [receiver.id, JSON.stringify(receiverInventory), receiverNewGold.toString()]
            );

            await client.query(
                `UPDATE trades SET status = 'accepted', updated_at = NOW() WHERE id = $1`,
                [tradeId]
            );

            touched = [
                { userId: asker.user_id, guildId: asker.guild_id },
                { userId: receiver.user_id, guildId: receiver.guild_id },
            ];

            return { success: true, message: `✅ Trade \`#${tradeId}\` accepted! Items and gold have been swapped.` };
        });

        // The transaction wrote behind the cache's back, so drop both entries and
        // let the next read pull the committed state.
        for (const { userId, guildId } of touched) {
            userGuildProfileCache.delete(profileKey(guildId, userId));
        }

        return result;
    } catch (err) {
        console.error(`Trade ${tradeId} failed and was rolled back:`, err);
        return { success: false, message: "Something went wrong completing that trade. No items or gold were moved." };
    }
}

export async function denyTrade(
    tradeId: string,
    receiverProfileId: string
): Promise<{ success: boolean; message: string }> {
    const res = await query<DbTradeRow>(`SELECT * FROM trades WHERE id = $1`, [tradeId]);
    const row = res.rows[0];

    if (!row) return { success: false, message: `Trade \`#${tradeId}\` not found.` };
    if (row.status !== "pending") return { success: false, message: `Trade \`#${tradeId}\` is no longer pending.` };
    if (String(row.receiver_profile_id) !== receiverProfileId) return { success: false, message: "You are not the receiver of this trade." };

    await query(`UPDATE trades SET status = 'denied', updated_at = NOW() WHERE id = $1`, [tradeId]);
    return { success: true, message: `Trade \`#${tradeId}\` denied.` };
}

export async function cancelTrade(
    tradeId: string,
    askerProfileId: string
): Promise<{ success: boolean; message: string }> {
    const res = await query<DbTradeRow>(`SELECT * FROM trades WHERE id = $1`, [tradeId]);
    const row = res.rows[0];

    if (!row) return { success: false, message: `Trade \`#${tradeId}\` not found.` };
    if (row.status !== "pending") return { success: false, message: `Trade \`#${tradeId}\` is no longer pending.` };
    if (String(row.asker_profile_id) !== askerProfileId) return { success: false, message: "You are not the sender of this trade." };

    await query(`UPDATE trades SET status = 'canceled', updated_at = NOW() WHERE id = $1`, [tradeId]);
    return { success: true, message: `Trade \`#${tradeId}\` canceled.` };
}