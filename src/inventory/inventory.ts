import { query } from "../db/index.js";
import type { item } from "../db/userGuildProfiles.js";
import { getOrCreateDbUser } from "../cache/userService.js";
import { getOrCreateGuildConfig } from "../cache/guildService.js";
import { getOrCreateProfile } from "../cache/profileService.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { get } from "http";

export async function updateInventory(userId: number, guildId: number, inventory: Record<string, item>, newGoldBalance: number): Promise<void> {
    await query(
        `
        UPDATE user_guild_profiles
        SET inventory = $3, gold = $4, updated_at = NOW()
        WHERE user_id = $1 AND guild_id = $2;
        `,
        [userId, guildId, JSON.stringify(inventory), newGoldBalance]
    );
}

export async function getInventory(userId: number, guildId: number): Promise<Record<string, item>> {
    const result = await query<{ inventory: Record<string, item> }>(
        `
        SELECT inventory FROM user_guild_profiles
        WHERE user_id = $1 AND guild_id = $2;
        `,
        [userId, guildId]
    );

    if (result.rows.length === 0 || !result.rows[0] || !result.rows[0].inventory) {
        return {};
    }

    return result.rows[0].inventory;
}   

export async function handleViewInventory(interaction: ChatInputCommandInteraction, targetUserId: string): Promise<void> {
    if(interaction.guild === null) {
        await interaction.editReply({ content: "This command can only be used in a server." });
        return;
    }

    const { user: dbUser } = await getOrCreateDbUser({ discordUserId: targetUserId });
    const { guild: dbGuild } = await getOrCreateGuildConfig({ discordGuildId: interaction.guild.id });
    const { profile } = await getOrCreateProfile({ userId: dbUser.id, guildId: dbGuild.id });
    const inventory = await getInventory(profile.user_id, profile.guild_id);

    if (Object.keys(inventory).length === 0) {
        await interaction.editReply({ content: `<@${targetUserId}>'s inventory is empty.` });
        return;
    }

    const inventoryLines = Object.entries(inventory).map(([itemId, itemData]) => {
        return `• **${itemData.name}** (ID: \`${itemId}\`) x${itemData.quantity}`;
    });

    const inventoryMessage = `Inventory for <@${targetUserId}>:\n\n` + inventoryLines.join("\n");

    await interaction.editReply({ content: inventoryMessage });
}

export async function handleClearInventory(interaction: ChatInputCommandInteraction, targetUserId: string): Promise<void> {
    if(interaction.guild === null) {
        await interaction.editReply({ content: "This command can only be used in a server." });
        return;
    }

    const { user: dbUser } = await getOrCreateDbUser({ discordUserId: targetUserId });
    const { guild: dbGuild } = await getOrCreateGuildConfig({ discordGuildId: interaction.guild.id });
    const { profile } = await getOrCreateProfile({ userId: dbUser.id, guildId: dbGuild.id });
    await updateInventory(profile.user_id, profile.guild_id, {}, profile.gold ? Number(profile.gold) : 0);

    await interaction.editReply({ content: `Cleared inventory for <@${targetUserId}>.` });
}

export async function handleRemoveItem(interaction: ChatInputCommandInteraction, targetUserId: string, itemId: string, quantity?: number): Promise<void> {
    if(interaction.guild === null) {
        await interaction.editReply({ content: "This command can only be used in a server." });
        return;
    }

    const { user: dbUser } = await getOrCreateDbUser({ discordUserId: targetUserId });
    const { guild: dbGuild } = await getOrCreateGuildConfig({ discordGuildId: interaction.guild.id });
    const { profile } = await getOrCreateProfile({ userId: dbUser.id, guildId: dbGuild.id });
    const inventory = await getInventory(profile.user_id, profile.guild_id);

    if (!inventory[itemId]) {
        await interaction.editReply({ content: `Item with ID \`${itemId}\` not found in <@${targetUserId}>'s inventory.` });
        return;
    }

    if (quantity === undefined || quantity >= inventory[itemId].quantity) {
        delete inventory[itemId];
        await interaction.editReply({ content: `Removed all of item \`${itemId}\` from <@${targetUserId}>'s inventory.` });
    } else {
        inventory[itemId].quantity -= quantity;
        await interaction.editReply({ content: `Removed ${quantity} of item \`${itemId}\` from <@${targetUserId}>'s inventory.` });
    }

    await updateInventory(profile.id, dbGuild.id, inventory, 0);
    await interaction.editReply({ content: `Updated <@${targetUserId}>'s inventory.` });
}

export async function handleGiveItem(interaction: ChatInputCommandInteraction, targetUserId: string, itemId: string, quantity: number): Promise<void> {
    if(interaction.guild === null) {
        await interaction.editReply({ content: "This command can only be used in a server." });
        return;
    }

    const guildId = interaction.guild.id;

    const { user: dbUser } = await getOrCreateDbUser({ discordUserId: targetUserId });

    const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: guildId });

    const { profile } = await getOrCreateProfile({ userId: dbUser.id, guildId: dbGuild.id });
    const inventory = await getInventory(profile.user_id, profile.guild_id);

    if (inventory[itemId]) {
        inventory[itemId].quantity += quantity;
    } else {
        
        const itemToAdd = config.shop?.items?.[itemId];
        if (!itemToAdd) {
            await interaction.editReply({ content: `Item with ID \`${itemId}\` does not exist in the shop.` });
            return;
        }

        const newItem: item = {
            id: itemToAdd.id,
            name: itemToAdd.name,
            quantity: quantity,
            ...(itemToAdd.emoji !== undefined && { emoji: itemToAdd.emoji }),
            ...(itemToAdd.description !== undefined && { description: itemToAdd.description }),
            ...(itemToAdd.maxPerUser !== undefined && { maxPerUser: itemToAdd.maxPerUser }),
            ...(itemToAdd.actions !== undefined && { actions: itemToAdd.actions }),
        };

        inventory[itemId] = newItem;
    }

    await updateInventory(dbUser.id, dbGuild.id, inventory, profile.gold ? parseInt(profile.gold) : 0);
    await interaction.editReply({ content: `Gave ${quantity} of item \`${itemId}\` to <@${targetUserId}>.` });
}   