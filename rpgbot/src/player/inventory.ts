import { query } from "../db/index.js";
import { addMessageXp } from "../db/userGuildProfiles.js";
import { getOrCreateDbUser } from "../cache/userService.js";
import { getOrCreateGuildConfig } from "../cache/guildService.js";
import { getOrCreateProfile } from "../cache/profileService.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { logAndBroadcastEvent } from "../db/events.js";
import { applyRoleWithTemp } from "./roles.js";
import { profileKey, userGuildProfileCache } from "../cache/caches.js";
import type { item } from "../types/userprofile.js";
import type { PendingProfileChanges } from "../types/cache.js";
import { runAchievementPipeline, applyAchievementSideEffects } from "./achievements.js";

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
    const { profile } = await getOrCreateProfile({ userId, guildId });
    if (!profile.inventory) {
        return {};
    }

    return profile.inventory;
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

    if (items[itemId].requiresRoleIds?.length) {
        const ok = items[itemId].requiresRoleIds.some(rid => member?.roles.cache.has(rid));
        if (!ok) return { success: false, message: `You do not have the required roles to use item \`${itemId}\`.` };
    }

    let xpGained = 0;
    let goldGained = 0;
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

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
                if (member && member.roles.cache.has(action.roleId) === false) {
                    await member.roles.add(action.roleId);
                }

                if (member && config.xp.roleTemp && config.xp.roleTemp[action.roleId]) {
                    await applyRoleWithTemp({
                        member: member,
                        roleId: action.roleId,
                        source: "item",
                        sourceId: itemId,
                    });
                }
                continue;
            }

            if (action.type === "removeRole" && action.roleId) {
                if (member && member.roles.cache.has(action.roleId)) {
                    await member.roles.remove(action.roleId);
                }
                continue;
            }

            if (action.type === "giveStat" && action.statId && action.amount) {
                switch (action.statId) {
                    case "gold": {
                        const cached = await getOrCreateProfile({ userId: dbUser.id, guildId: dbGuild.id });
                        let p = cached.profile;
                        let pending: PendingProfileChanges = cached.pendingChanges ?? {} as PendingProfileChanges;

                        const currentGold = p.gold ? BigInt(p.gold) : 0n;
                        const newGoldBig = currentGold + BigInt(action.amount);
                        p.gold = newGoldBig.toString();
                        profile.gold = p.gold;
                        goldGained += action.amount;

                        pending = {
                            ...pending,
                            gold: p.gold,
                        };

                        const key = profileKey(dbGuild.id, dbUser.id);
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
                            client: interaction.client,
                            discordGuildId: interaction.guild.id,
                            discordUserId: interaction.user.id,
                            member: member ?? null,

                            userId: dbUser.id,
                            guildId: dbGuild.id,
                            channelId: interaction.channelId,
                            config: config,
                            roleIds: member?.roles.cache.map(r => r.id) ?? [],
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

    const cached2 = await getOrCreateProfile({ userId: dbUser.id, guildId: dbGuild.id });
    let p2 = cached2.profile;
    let pending2: PendingProfileChanges = cached2.pendingChanges ?? ({} as PendingProfileChanges);

    const s2 = (p2.user_stats ?? {}) as any;
    s2.goldEarned = (s2.goldEarned ?? 0) + goldGained;
    s2.goldFromItems = (s2.goldFromItems ?? 0) + goldGained;
    s2.xpFromItems = (s2.xpFromItems ?? 0) + xpGained;
    s2.itemsUsed = (s2.itemsUsed ?? 0) + quantity;
    p2.user_stats = s2;

    const inv2 = { ...(p2.inventory ?? {}) };
    if (inv2[itemId]) {
        inv2[itemId].quantity -= quantity;
        if (inv2[itemId].quantity <= 0) delete inv2[itemId];
    }
    p2.inventory = inv2;

    pending2 = { ...pending2, user_stats: p2.user_stats, inventory: p2.inventory };
    const ach = await runAchievementPipeline({ profile: p2, pending: pending2, config });
    p2 = ach.profile;
    pending2 = ach.pending;

    userGuildProfileCache.set(profileKey(dbGuild.id, dbUser.id), {
        profile: p2,
        pendingChanges: Object.keys(pending2).length ? pending2 : undefined,
        dirty: true,
        lastWroteToDb: cached2.lastWroteToDb,
        lastLoaded: Date.now(),
    });

    const hasEffects =
    ach.unlocked.length > 0 ||
    Boolean(ach.rewards?.messages?.length) ||
    Boolean(ach.rewards?.grantedRoles?.length);

    if (hasEffects) {
    await applyAchievementSideEffects({
        client: interaction.client,
        discordGuildId: interaction.guild.id,
        discordUserId: interaction.user.id,
        member: member,
        channelIdHint: interaction.channelId,
        config,
        unlocked: ach.unlocked,
        rewards: ach.rewards
        ? { grantedRoles: ach.rewards.grantedRoles, messages: ach.rewards.messages }
        : null,
    });
    }

    return { success: true, message: `Successfully used ${quantity} of item \`${itemId}\`.` };
}
