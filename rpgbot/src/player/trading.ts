import type { GuildConfig } from "../types/guild.js";
import type { DbUserGuildProfile } from "../types/userprofile.js";
import { getInventory, updateInventory } from "../player/inventory.js"; // adjust import path as needed
import type { item } from "../types/userprofile.js"; // adjust import path as needed

export async function transferItem(
    giver: DbUserGuildProfile,
    receiver: DbUserGuildProfile,
    itemId: string,
    quantity: number,
    config: GuildConfig
): Promise<{success: boolean, message: string}> {
    const items = config.shop?.items ?? {};

    if (!items[itemId]) {
        return { success: false, message: "Item does not exist in the shop." };
    }

    const giverInventory = await getInventory(giver.user_id, giver.guild_id);
    const receiverInventory = await getInventory(receiver.user_id, receiver.guild_id);

    const giverItem = giverInventory[itemId];
    if (!giverItem || giverItem.quantity < quantity) {
        return { success: false, message: "Giver does not have enough of the specified item." };
    }

    giverItem.quantity -= quantity;
    if (giverItem.quantity === 0) {
        delete giverInventory[itemId];
    }

    if (receiverInventory[itemId]) {
        receiverInventory[itemId].quantity += quantity;
    } else {
        const shopItem = items[itemId];
        const newItem: item = {
            id: itemId,
            name: shopItem.name,
            quantity,
            ...(shopItem.emoji !== undefined && { emoji: shopItem.emoji }),
            ...(shopItem.description !== undefined && { description: shopItem.description }),
        };
        receiverInventory[itemId] = newItem;
    }

    console.log(giverInventory, receiverInventory);

    await updateInventory(giver.user_id, giver.guild_id, giverInventory, giver.gold ? parseInt(giver.gold) : 0);
    await updateInventory(receiver.user_id, receiver.guild_id, receiverInventory, receiver.gold ? parseInt(receiver.gold) : 0);

    return { success: true, message: "Item transferred successfully." };
}