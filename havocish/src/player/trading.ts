import type { GuildConfig } from "../types/guild.js";
import type { DbUserGuildProfile, item } from "../types/userprofile.js";
import type { shopItemConfig } from "../types/economy.js";
import { withTransaction } from "../db/index.js";
import { moveItem } from "../db/trade.js";
import { flushProfileCacheToDb } from "../cache/profileService.js";
import { profileKey, userGuildProfileCache } from "../cache/caches.js";

/** Row shape when we lock a profile inside the gift transaction. */
type LockedInventory = {
    id: string;
    inventory: Record<string, item> | null;
};

/**
 * Hands `quantity` of `itemId` from one player to another.
 *
 * Runs as a single locked transaction for the same reason acceptTrade does: the
 * old version applied the two sides as separate unguarded cache writes, so two
 * concurrent gifts of the same stack could both pass validation and hand out
 * more items than the giver owned.
 */
export async function transferItem(
    giver: DbUserGuildProfile,
    receiver: DbUserGuildProfile,
    itemId: string,
    quantity: number,
    config: GuildConfig
): Promise<{success: boolean, message: string}> {
    const shopItems = (config.shop?.items ?? {}) as Record<string, shopItemConfig>;

    if (!shopItems[itemId]) {
        return { success: false, message: "Item does not exist in the shop." };
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
        return { success: false, message: "Quantity must be a positive whole number." };
    }

    // Both sides are read as separate rows below, so gifting to yourself would
    // credit a copy that the debit never sees and duplicate the stack.
    if (String(giver.id) === String(receiver.id)) {
        return { success: false, message: "You cannot gift an item to yourself." };
    }

    // Inventory writes are buffered in the write-back cache, so the rows can lag
    // reality by up to 30s. Push both sides down before the transaction treats
    // the database as authoritative.
    await flushProfileCacheToDb({ userId: giver.user_id, guildId: giver.guild_id, force: true });
    await flushProfileCacheToDb({ userId: receiver.user_id, guildId: receiver.guild_id, force: true });

    let moved = false;

    try {
        const result = await withTransaction(async (client) => {
            // Ascending id order, matching acceptTrade, so a gift and a trade
            // touching the same two profiles cannot deadlock against each other.
            const [firstId, secondId] = [String(giver.id), String(receiver.id)]
                .sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));

            const locked = new Map<string, LockedInventory>();
            for (const profileId of [firstId, secondId]) {
                const res = await client.query<LockedInventory>(
                    `SELECT id, inventory FROM user_guild_profiles WHERE id = $1 FOR UPDATE`,
                    [profileId]
                );
                const lockedRow = res.rows[0];
                if (!lockedRow) {
                    return { success: false, message: "One of you no longer has a profile in this server." };
                }
                locked.set(String(lockedRow.id), lockedRow);
            }

            const giverRow = locked.get(String(giver.id))!;
            const receiverRow = locked.get(String(receiver.id))!;

            const giverInventory = giverRow.inventory ?? {};
            const receiverInventory = receiverRow.inventory ?? {};

            // Re-validate against the locked row, not the caller's snapshot.
            const slot = giverInventory[itemId];
            if (!slot || slot.quantity < quantity) {
                return { success: false, message: "Giver does not have enough of the specified item." };
            }

            moveItem(giverInventory, receiverInventory, itemId, quantity, shopItems);

            await client.query(
                `UPDATE user_guild_profiles SET inventory = $2, updated_at = NOW() WHERE id = $1`,
                [giverRow.id, JSON.stringify(giverInventory)]
            );
            await client.query(
                `UPDATE user_guild_profiles SET inventory = $2, updated_at = NOW() WHERE id = $1`,
                [receiverRow.id, JSON.stringify(receiverInventory)]
            );

            moved = true;
            return { success: true, message: "Item transferred successfully." };
        });

        // The transaction wrote behind the cache's back, so drop both entries and
        // let the next read pull the committed state.
        if (moved) {
            userGuildProfileCache.delete(profileKey(giver.guild_id, giver.user_id));
            userGuildProfileCache.delete(profileKey(receiver.guild_id, receiver.user_id));
        }

        return result;
    } catch (err) {
        console.error(`Gift of ${quantity}x ${itemId} failed and was rolled back:`, err);
        return { success: false, message: "Something went wrong sending that gift. Nothing was transferred." };
    }
}
