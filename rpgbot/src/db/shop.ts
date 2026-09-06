import type { shopItemConfig } from "../types/economy.js";
import type { item } from "../types/userprofile.js";
import { withTransaction } from "./index.js";
import { flushProfileCacheToDb } from "../cache/profileService.js";
import { guildConfigCache, profileKey, userGuildProfileCache } from "../cache/caches.js";

export type PurchaseOutcome =
    | { success: true; item: shopItemConfig; price: bigint; newGold: string }
    | { success: false; message: string };

type LockedProfile = {
    id: string;
    gold: string;
    level: number;
    inventory: Record<string, item> | null;
};

/**
 * Buys `quantity` of `itemId` for a player, as one transaction.
 *
 * Previously the handler read the player's gold and the item's stock, decided,
 * and then wrote both back -- a read-modify-write with nothing serializing it.
 * Two purchases arriving together both saw the pre-purchase balance and the
 * pre-purchase stock, so a player could spend the same gold twice and a
 * limited item could sell past zero.
 *
 * The guild row is locked before the profile row. Purchases are the only path
 * that locks both, and they always take them in that order, so they cannot
 * deadlock against each other; trades and gifts lock profiles only.
 *
 * Item price, level requirement and stock are read from the locked guild row
 * rather than the caller's cached config, so a purchase cannot settle at a
 * price an admin has already changed.
 */
export async function purchaseItem(opts: {
    userId: number;
    guildId: number;
    discordGuildId: string;
    itemId: string;
    quantity: number;
}): Promise<PurchaseOutcome> {
    const { userId, guildId, discordGuildId, itemId, quantity } = opts;

    if (!Number.isInteger(quantity) || quantity <= 0) {
        return { success: false, message: "Invalid quantity specified." };
    }

    // Gold and inventory writes are buffered in the write-back cache, so push
    // this player's pending changes down before the transaction reads the row.
    await flushProfileCacheToDb({ userId, guildId, force: true });

    let purchased = false;
    let stockChanged = false;

    try {
        const result = await withTransaction<PurchaseOutcome>(async (client) => {
            const guildRes = await client.query<{ item: shopItemConfig | null }>(
                `SELECT config #> ARRAY['shop', 'items', $2::text] AS item
                 FROM guilds WHERE id = $1 FOR UPDATE`,
                [guildId, itemId]
            );

            const shopItem = guildRes.rows[0]?.item ?? null;
            if (!shopItem) {
                return { success: false, message: "This item does not exist." };
            }

            const price = BigInt(shopItem.price ?? 0) * BigInt(quantity);

            const profileRes = await client.query<LockedProfile>(
                `SELECT id, gold, level, inventory
                 FROM user_guild_profiles WHERE user_id = $1 AND guild_id = $2 FOR UPDATE`,
                [userId, guildId]
            );
            const profile = profileRes.rows[0];
            if (!profile) {
                return { success: false, message: "You do not have a profile in this server yet." };
            }

            if (shopItem.minLevel !== undefined && profile.level < shopItem.minLevel) {
                return { success: false, message: `You need to be at least level ${shopItem.minLevel} to purchase this item.` };
            }

            const gold = BigInt(profile.gold ?? 0);
            if (gold < price) {
                return { success: false, message: "You do not have enough gold to make this purchase." };
            }

            // A null or absent stock means unlimited.
            if (shopItem.stock !== undefined && shopItem.stock !== null) {
                if (shopItem.stock < quantity) {
                    return { success: false, message: "There is not enough stock to complete your purchase." };
                }
                await client.query(
                    `UPDATE guilds
                     SET config = jsonb_set(config, ARRAY['shop', 'items', $2::text, 'stock'], to_jsonb($3::bigint))
                     WHERE id = $1`,
                    [guildId, itemId, String(shopItem.stock - quantity)]
                );
                stockChanged = true;
            }

            const inventory = profile.inventory ?? {};
            const slot = inventory[itemId];
            if (slot) {
                slot.quantity += quantity;
            } else {
                inventory[itemId] = {
                    id: shopItem.id ?? itemId,
                    name: shopItem.name ?? itemId,
                    quantity,
                    ...(shopItem.emoji !== undefined && { emoji: shopItem.emoji }),
                    ...(shopItem.description !== undefined && { description: shopItem.description }),
                };
            }

            const newGold = gold - price;
            await client.query(
                `UPDATE user_guild_profiles
                 SET inventory = $2, gold = $3, updated_at = NOW()
                 WHERE id = $1`,
                [profile.id, JSON.stringify(inventory), newGold.toString()]
            );

            purchased = true;
            return { success: true, item: shopItem, price, newGold: newGold.toString() };
        });

        // The transaction wrote behind both caches' backs.
        if (purchased) userGuildProfileCache.delete(profileKey(guildId, userId));
        if (stockChanged) guildConfigCache.delete(discordGuildId);

        return result;
    } catch (err) {
        console.error(`Purchase of ${quantity}x ${itemId} failed and was rolled back:`, err);
        return { success: false, message: "Something went wrong completing that purchase. Nothing was charged." };
    }
}
