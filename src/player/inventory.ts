import { query } from "../db/index.js";
import { addMessageXp, updateUserStats, type item } from "../db/userGuildProfiles.js";
import { getOrCreateDbUser } from "../cache/userService.js";
import { getOrCreateGuildConfig } from "../cache/guildService.js";
import { getOrCreateProfile } from "../cache/profileService.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { logAndBroadcastEvent } from "../db/events.js";
import { applyRoleWithTemp } from "./roles.js";
import { profileKey, userGuildProfileCache, type PendingProfileChanges } from "../cache/caches.js";

export async function updateInventory(userId: number, guildId: number, inventory: Record<string, item>, newGoldBalance: number): Promise<void> {
    const cached = await getOrCreateProfile({ userId, guildId });
    let profile = cached.profile;
    let pendingChanges: Record<string, any> = cached.pendingChanges ?? {};

    profile.inventory = inventory;
    pendingChanges = {
        ...pendingChanges,
        inventory,
    }

    if (!isNaN(newGoldBalance)) {
        profile.gold = newGoldBalance.toString();
        pendingChanges.gold = newGoldBalance;
    }

    const key = profileKey(guildId, userId);
    userGuildProfileCache.set(key, {
        profile,
        pendingChanges,
        dirty: true,
        lastWroteToDb: cached.lastWroteToDb,
        lastLoaded: Date.now(),
    });
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

    const admin = interaction.user.id

    const { user: adminUser } = await getOrCreateDbUser({ discordUserId: admin });
    const { user: dbUser } = await getOrCreateDbUser({ discordUserId: targetUserId });
    const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guild.id });
    const { profile } = await getOrCreateProfile({ userId: dbUser.id, guildId: dbGuild.id });
    await updateInventory(profile.user_id, profile.guild_id, {}, profile.gold ? Number(profile.gold) : 0);

    await interaction.editReply({ content: `Cleared inventory for <@${targetUserId}>.` });

    await logAndBroadcastEvent(interaction, {
        guildId: dbGuild.id,
        userId: adminUser.id,
        targetUserId: dbUser.id,
        category: "admin",
        eventType: "clearinventory",
        source: "clearInventory",
        itemId: null,
        itemQuantity: null,
        metaData: { actorDiscordId: interaction.user.id, targetDiscordId: targetUserId },
        timestamp: new Date(),
    }, config
    );
}

export async function handleRemoveItem(interaction: ChatInputCommandInteraction, targetUserId: string, itemId: string, quantity?: number): Promise<void> {
    if(interaction.guild === null) {
        await interaction.editReply({ content: "This command can only be used in a server." });
        return;
    }

    const admin = interaction.user.id
    const { user: adminUser } = await getOrCreateDbUser({ discordUserId: admin });
    const { user: dbUser } = await getOrCreateDbUser({ discordUserId: targetUserId });
    const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guild.id });
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

    await logAndBroadcastEvent(interaction, {
        guildId: dbGuild.id,
        userId: adminUser.id,
        targetUserId: dbUser.id,
        category: "admin",
        eventType: "removeitem",
        source: "removeItem",
        itemId: itemId,
        itemQuantity: quantity ?? null,
        metaData: { actorDiscordId: interaction.user.id, targetDiscordId: targetUserId },
        timestamp: new Date(),
    }, config
    );
}

export async function handleGiveItem(interaction: ChatInputCommandInteraction, targetUserId: string, itemId: string, quantity: number): Promise<void> {
    if(interaction.guild === null) {
        await interaction.editReply({ content: "This command can only be used in a server." });
        return;
    }

    const guildId = interaction.guild.id;

    const admin = interaction.user.id
    const { user: adminUser } = await getOrCreateDbUser({ discordUserId: admin });

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
        };

        inventory[itemId] = newItem;
    }

    await updateInventory(dbUser.id, dbGuild.id, inventory, profile.gold ? parseInt(profile.gold) : 0);
    await interaction.editReply({ content: `Gave ${quantity} of item \`${itemId}\` to <@${targetUserId}>.` });

    await logAndBroadcastEvent(interaction, {
        guildId: dbGuild.id,
        userId: adminUser.id,
        targetUserId: dbUser.id,
        category: "admin",
        eventType: "giveitem",
        source: "giveItem",
        itemId: itemId,
        itemQuantity: quantity ?? null,
        metaData: { actorDiscordId: interaction.user.id, targetDiscordId: targetUserId },
        timestamp: new Date(),
    }, config
    );
}   

export async function useItemFromInventory(interaction: ChatInputCommandInteraction, itemId: string, quantity: number): Promise<{success: boolean, message: string}> {
    if(interaction.guild === null) {
        return { success: false, message: "This command can only be used in a server." };
    }

    const { user: dbUser } = await getOrCreateDbUser({ discordUserId: interaction.user.id });
    const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guild.id });
    const { profile } = await getOrCreateProfile({ userId: dbUser.id, guildId: dbGuild.id });
    const inventory = profile.inventory;
    const items = config.shop?.items;

    if (!items || !items[itemId]) {
        return { success: false, message: `Item with ID \`${itemId}\` does not exist in the shop.` };
    }

    if (!inventory[itemId]) {
        return { success: false, message: `Item with ID \`${itemId}\` not found in your inventory.` };
    }

    if (inventory[itemId].quantity < quantity) {
        return { success: false, message: `You do not have enough of item \`${itemId}\` to use. You have ${inventory[itemId].quantity}, but tried to use ${quantity}.`};
    }
    
    if (!items[itemId].actions || Object.keys(items[itemId].actions).length === 0) {
        return { success: false, message: `Item \`${itemId}\` cannot be used.`  };
    }

    if (items[itemId].minLevel && profile.level < items[itemId].minLevel) {
        return { success: false, message: `You are underleveled to use item \`${itemId}\`.` };
    }

    if (items[itemId].requiresRoleIds && items[itemId].requiresRoleIds.length > 0) {
        const memberRoles = interaction.member?.roles;
        if (memberRoles && typeof memberRoles !== 'string' && !Array.isArray(memberRoles)) {
            if (items[itemId].requiresRoleIds.some(roleId => !memberRoles.cache.has(roleId))) {
                return { success: false, message: `You do not have the required roles to use item \`${itemId}\`.` };
            }
        }
    }

    let xpGained = 0;
    let goldGained = 0;

    for (let i = 0; i < quantity; i++) {
        for (const actionKey in items[itemId].actions) {
            const action = items[itemId].actions[parseInt(actionKey)];
            if (!action) continue;
            if (action.type === "sendMessage" && action.message && action.channelId) {
                const channel = interaction.guild.channels.cache.get(action.channelId);
                if (channel && channel.isTextBased()) {
                    await channel.send(action.message.replace("{user}", `<@${interaction.user.id}>`));
                }
                continue;
            }

            if (action.type === "assignRole" && action.roleId) {
                const member = interaction.guild.members.cache.get(interaction.user.id);
                if (member) {
                    await member.roles.add(action.roleId);
                }

                if (config.xp.roleTemp && config.xp.roleTemp[action.roleId]) {
                    await applyRoleWithTemp({
                        member: member!,
                        roleId: action.roleId,
                        source: "item",
                        sourceId: itemId,
                    });
                }
                continue;
            }

            if (action.type === "removeRole" && action.roleId) {
                const member = interaction.guild.members.cache.get(interaction.user.id);
                if (member) {
                    await member.roles.remove(action.roleId);
                }
                continue;
            }

            if (action.type === "giveStat" && action.statId && action.amount) {
                switch (action.statId) {
                    case "gold": {
                        const cached = await getOrCreateProfile({ userId: profile.user_id, guildId: profile.guild_id });
                        let p = cached.profile;
                        let pending: PendingProfileChanges = cached.pendingChanges ?? {} as PendingProfileChanges;

                        const currentGold = p.gold ? BigInt(p.gold) : 0n;
                        const newGoldBig = currentGold + BigInt(action.amount);
                        p.gold = newGoldBig.toString();
                        goldGained += action.amount;

                        pending = {
                            ...pending,
                            gold: p.gold,
                        };

                        const key = profileKey(p.guild_id, p.user_id);
                        userGuildProfileCache.set(key, {
                            profile: p,
                            pendingChanges: Object.keys(pending).length > 0 ? pending : undefined,
                            dirty: true,
                            lastWroteToDb: cached.lastWroteToDb,
                            lastLoaded: Date.now(),
                        });

                        break;
                    }

                    case "xp": {
                        xpGained += action.amount;
                        await addMessageXp({
                            userId: profile.user_id,
                            guildId: profile.guild_id,
                            config: config,
                            amount: action.amount,
                        });
                        break; 
                    }

                    default:
                        break;
                }
            }
        }
    }

    await updateUserStats(profile.user_id, profile.guild_id, {
        goldEarned: (profile.user_stats?.goldEarned ?? 0) + goldGained,
        goldFromItems: (profile.user_stats?.goldFromItems ?? 0) + goldGained,
        xpFromItems: (profile.user_stats?.xpFromItems ?? 0) + xpGained,
        itemsUsed: (profile.user_stats?.itemsUsed ?? 0) + quantity,
    });

    await logAndBroadcastEvent(interaction, {
        guildId: dbGuild.id,
        userId: dbUser.id,
        category: "inventory",
        eventType: "use",
        source: "useCommand",
        itemId: itemId,
        itemQuantity: quantity ?? null,
        metaData: { actorDiscordId: interaction.user.id },
        timestamp: new Date(),
        }, config
    );

    inventory[itemId].quantity -= quantity;
    if (inventory[itemId].quantity <= 0) {
        delete inventory[itemId];
    }

    await updateInventory(profile.user_id, profile.guild_id, inventory, profile.gold ? parseInt(profile.gold) : 0);

    return { success: true, message: `Successfully used ${quantity} of item \`${itemId}\`.` };
}