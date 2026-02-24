import type { shopItemConfig } from "../types/economy.js";
import type { DbGuild } from "../types/guild.js";
import type { DbTrade, DbTradeRow, Trade, TradeStatus } from "../types/trading.js";
import { getInventory, updateInventory } from "../player/inventory.js";
import { query } from "./index.js";
import { getOrCreateDbUser } from "../cache/userService.js";

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

export async function acceptTrade(
    tradeId: string,
    acceptorProfile: import("../types/userprofile.js").DbUserGuildProfile,
    guild: DbGuild
): Promise<{ success: boolean; message: string }> {
    // Fetch the trade row
    const tradeRes = await query<DbTradeRow>(`SELECT * FROM trades WHERE id = $1`, [tradeId]);
    const row = tradeRes.rows[0];

    if (!row) return { success: false, message: `Trade \`#${tradeId}\` not found.` };
    if (row.status !== "pending") return { success: false, message: `Trade \`#${tradeId}\` is no longer pending (status: ${row.status}).` };
    if (String(row.receiver_profile_id) !== String(acceptorProfile.id)) return { success: false, message: "You are not the receiver of this trade." };
    if (new Date(row.expires_at) < new Date()) {
        await query(`UPDATE trades SET status = 'expired', updated_at = NOW() WHERE id = $1`, [tradeId]);
        return { success: false, message: "That trade has expired." };
    }

    const { user: askerUser } = await getOrCreateDbUser({ discordUserId:row.asker_discord_id });

    const items = guild.config?.shop?.items ?? {};

    // Re-validate asker inventory
    const askerInventory = await getInventory(askerUser.id, guild.id);
    const askerItems: Record<string, number> = row.asker_items ?? {};
    for (const [itemId, qty] of Object.entries(askerItems)) {
        if (!askerInventory[itemId] || askerInventory[itemId].quantity < qty)
            return { success: false, message: `The sender no longer has enough \`${itemId}\` to complete this trade.` };
    }

    // Re-validate receiver inventory
    const receiverInventory = await getInventory(acceptorProfile.user_id, guild.id);
    const receiverItems: Record<string, number> = row.receiver_items ?? {};
    for (const [itemId, qty] of Object.entries(receiverItems)) {
        if (!receiverInventory[itemId] || receiverInventory[itemId].quantity < qty)
            return { success: false, message: `You no longer have enough \`${itemId}\` to complete this trade.` };
    }

    // Re-validate gold
    const askerGoldRes = await query<{ gold: string }>(`SELECT gold FROM user_guild_profiles WHERE id = $1`, [row.asker_profile_id]);
    const receiverGoldRes = await query<{ gold: string }>(`SELECT gold FROM user_guild_profiles WHERE id = $1`, [row.receiver_profile_id]);
    if (Number(askerGoldRes.rows[0]?.gold ?? 0) < Number(row.asker_gold ?? 0))
        return { success: false, message: "The sender no longer has enough gold." };
    if (Number(receiverGoldRes.rows[0]?.gold ?? 0) < Number(row.receiver_gold ?? 0))
        return { success: false, message: "You no longer have enough gold." };

    // ── Execute swap ──────────────────────────────────────────────────────────

    // Transfer asker items → receiver
    for (const [itemId, qty] of Object.entries(askerItems)) {
        const askerSlot = askerInventory[itemId];
        if (askerSlot) {
            askerSlot.quantity -= qty;
            if (askerSlot.quantity === 0) delete askerInventory[itemId];
        }
        if (receiverInventory[itemId]) {
            receiverInventory[itemId]!.quantity += qty;
        } else {
            const shopItem = (items as Record<string, shopItemConfig>)[itemId];
            receiverInventory[itemId] = {
                id: itemId,
                name: shopItem?.name ?? itemId,
                quantity: qty,
                ...(shopItem?.emoji !== undefined && { emoji: shopItem.emoji }),
                ...(shopItem?.description !== undefined && { description: shopItem.description }),
            };
        }
    }

    // Transfer receiver items → asker
    for (const [itemId, qty] of Object.entries(receiverItems)) {
        const receiverSlot = receiverInventory[itemId];
        if (receiverSlot) {
            receiverSlot.quantity -= qty;
            if (receiverSlot.quantity === 0) delete receiverInventory[itemId];
        }
        if (askerInventory[itemId]) {
            askerInventory[itemId]!.quantity += qty;
        } else {
            const shopItem = (items as Record<string, shopItemConfig>)[itemId];
            askerInventory[itemId] = {
                id: itemId,
                name: shopItem?.name ?? itemId,
                quantity: qty,
                ...(shopItem?.emoji !== undefined && { emoji: shopItem.emoji }),
                ...(shopItem?.description !== undefined && { description: shopItem.description }),
            };
        }
    }

    const askerCurrentGold = Number(askerGoldRes.rows[0]?.gold ?? 0);
    const receiverCurrentGold = Number(receiverGoldRes.rows[0]?.gold ?? 0);
    const askerGoldOffer = Number(row.asker_gold ?? 0);
    const receiverGoldOffer = Number(row.receiver_gold ?? 0);

    await updateInventory(askerUser.id, guild.id, askerInventory, askerCurrentGold - askerGoldOffer + receiverGoldOffer);
    await updateInventory(acceptorProfile.user_id, guild.id, receiverInventory, receiverCurrentGold - receiverGoldOffer + askerGoldOffer);

    await query(`UPDATE trades SET status = 'accepted', updated_at = NOW() WHERE id = $1`, [tradeId]);

    return { success: true, message: `✅ Trade \`#${tradeId}\` accepted! Items and gold have been swapped.` };
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