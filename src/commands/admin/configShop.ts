import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, subtext } from "discord.js";
import { setGuildConfig } from "../../db/guilds.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import type { shopCategoryConfig, shopItemAction, shopItemConfig } from "../../db/guilds.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { logAndBroadcastEvent } from "../../db/events.js";

export const data = new SlashCommandBuilder()
    .setName("config-shop")
    .setDescription("Configure the shop settings")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(sub =>
        sub.setName("toggle")
            .setDescription("Enable/disable the shop")
            .addBooleanOption(opt =>
                opt.setName("enabled")
                    .setDescription("Enable or disable the shop")
                    .setRequired(true)
            )
    )

    .addSubcommand(sub =>
        sub.setName("create-category").setDescription("Create a new shop category")
            .addStringOption(opt =>
                opt.setName("id").setDescription("The unique ID for the category (Cannot be changed later)").setRequired(true)
            )
            .addStringOption(opt =>
                opt.setName("name").setDescription("The display name of the category").setRequired(true)
            )
            .addStringOption(opt =>
                opt.setName("icon").setDescription("The icon for the category (emoji or URL)").setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName("description").setDescription("The description of the category").setRequired(false)
            )
            .addBooleanOption(opt =>
                opt.setName("hidden").setDescription("Whether the category is hidden").setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName("role-required-ids").setDescription("Comma-separated role IDs required to access this category").setRequired(false)
            )
    )

    .addSubcommand(sub =>
        sub.setName("delete-category").setDescription("Delete a shop category")
            .addStringOption(opt =>
                opt.setName("id").setDescription("The ID of the category to delete").setRequired(true)
            )
    )

    .addSubcommand(sub =>
        sub.setName("edit-category").setDescription("Edit a shop category")
            .addStringOption(opt =>
                opt.setName("id").setDescription("The ID of the category to edit").setRequired(true)
            )
            .addStringOption(opt =>
                opt.setName("name").setDescription("The new display name of the category").setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName("icon").setDescription("The new icon for the category (emoji or URL)").setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName("description").setDescription("The new description of the category").setRequired(false)
            )
            .addBooleanOption(opt =>
                opt.setName("hidden").setDescription("Whether the category is hidden").setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName("role-required-ids").setDescription("(Overwrites) Comma-separated role IDs required to access this category").setRequired(false)
            )
    )

    .addSubcommand(sub =>
        sub.setName("list-categories").setDescription("List all shop categories")
    )

    .addSubcommand(sub =>
        sub.setName("create-item").setDescription("Create a new shop item (Actions assigned separately")
            .addStringOption(opt =>
                opt.setName("id").setDescription("The unique ID for the item (Cannot be changed later)").setRequired(true)
            )
            .addStringOption(opt =>
                opt.setName("name").setDescription("The display name of the item").setRequired(true)
            )
            .addStringOption(opt =>
                opt.setName("category-id").setDescription("The ID of the category this item belongs to").setRequired(true)
            )
            .addIntegerOption(opt =>
                opt.setName("price").setDescription("The price of the item in gold").setRequired(true)
            )
            .addIntegerOption(opt =>
                opt.setName("sell-price").setDescription("The sell price for the item (leave blank/0 or do not enter for unsellable)").setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName("emoji").setDescription("The emoji for the item").setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName("description").setDescription("The description of the item").setRequired(false)
            )
            .addIntegerOption(opt =>
                opt.setName("min-level").setDescription("The minimum level required to purchase this item").setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName("requires-role-ids").setDescription("Comma-separated role IDs required to purchase this item").setRequired(false)
            )
            .addIntegerOption(opt =>
                opt.setName("max-per-user").setDescription("The maximum number of this item a user can own").setRequired(false)
            )
            .addIntegerOption(opt =>
                opt.setName("stock").setDescription("The stock quantity of this item (leave empty for unlimited)").setRequired(false)
            )
            .addBooleanOption(opt =>
                opt.setName("hidden").setDescription("Whether the item is hidden").setRequired(false)
            )
            .addBooleanOption(opt =>
                opt.setName("permanent").setDescription("Whether the item is permanent (not consumed on use)").setRequired(false)
            )
            .addBooleanOption(opt =>
                opt.setName("tradeable").setDescription("Whether the item is tradeable between users").setRequired(false)
            )
    )

    .addSubcommand(sub =>
        sub.setName("delete-item").setDescription("Delete a shop item")
            .addStringOption(opt =>
                opt.setName("id").setDescription("The ID of the item to delete").setRequired(true)
            )
    )

    .addSubcommand(sub =>
        sub.setName("edit-item").setDescription("Edit a shop item")
            .addStringOption(opt =>
                opt.setName("id").setDescription("The ID of the item to edit").setRequired(true)
            )
            .addStringOption(opt =>
                opt.setName("name").setDescription("The new display name of the item").setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName("emoji").setDescription("The new emoji for the item").setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName("description").setDescription("The new description of the item").setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName("category-id").setDescription("The new category ID this item belongs to").setRequired(false)
            )
            .addIntegerOption(opt =>
                opt.setName("price").setDescription("The new price of the item in gold").setRequired(false)
            )
            .addIntegerOption(opt =>
                opt.setName("min-level").setDescription("The new minimum level required to purchase this item").setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName("requires-role-ids").setDescription("Comma-separated role IDs required to purchase this item").setRequired(false)
            )
            .addIntegerOption(opt =>
                opt.setName("max-per-user").setDescription("The new maximum number of this item a user can own").setRequired(false)
            )
            .addIntegerOption(opt =>
                opt.setName("stock").setDescription("The new stock quantity of this item (put negative for unlimited)").setRequired(false)
            )
            .addBooleanOption(opt =>
                opt.setName("hidden").setDescription("Whether the item is hidden").setRequired(false)
            )
    )

    .addSubcommand(sub =>
        sub.setName("list-items").setDescription("List all shop items")
    )

    .addSubcommand(sub =>
        sub.setName("add-item-action").setDescription("Add an action to a shop item")
            .addStringOption(opt =>
                opt.setName("item-id").setDescription("The ID of the item to add the action to").setRequired(true)
            )
            .addStringOption(opt =>
                opt.setName("action-type").setDescription("The type of action to add").setRequired(true)
                .addChoices(
                    { name: "Assign Role", value: "assignRole" },
                    { name: "Remove Role", value: "removeRole" },
                    { name: "Send Message", value: "sendMessage" },
                    { name: "Run Command", value: "runCommand" },
                    { name: "Give Stat", value: "giveStat" },
                )
            )
            .addRoleOption(opt =>
                opt.setName("role-id").setDescription("The role ID for assign/remove role actions").setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName("message").setDescription("The message to send for send message actions").setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName("channel-id").setDescription("The channel ID to send the message in for send message actions").setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName("command").setDescription("The command to run for run command actions").setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName("stat").setDescription("The stat to give for give stat actions").setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName("amount").setDescription("The amount of the stat to give for give stat actions").setRequired(false)
            )
    )

    .addSubcommand(sub =>
        sub.setName("remove-item-action").setDescription("Remove an action from a shop item")
            .addStringOption(opt =>
                opt.setName("item-id").setDescription("The ID of the item to remove the action from").setRequired(true)
            )
            .addIntegerOption(opt =>
                opt.setName("action-index").setDescription("The index of the action to remove (starting from 0)").setRequired(true)
            )
    )

    .addSubcommand(sub =>
        sub.setName("list-item-actions").setDescription("List all actions for a shop item")
            .addStringOption(opt =>
                opt.setName("item-id").setDescription("The ID of the item to list actions for").setRequired(true)
            )
    );


export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply("This command can only be used in a server.");
        return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: "You do not have permission to use this command.", flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const sub = interaction.options.getSubcommand();

    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    let newConfig = structuredClone(config);

    switch (sub) {
        case "toggle": {
            const enabled = interaction.options.getBoolean("enabled", true);
            newConfig.shop = newConfig.shop || {};
            newConfig.shop.enabled = enabled;

            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply(`Shop has been ${enabled ? "enabled" : "disabled"}.`);
            break;
        }

        case "create-category": {
            const id = interaction.options.getString("id", true);
            const name = interaction.options.getString("name", true);
            const icon = interaction.options.getString("icon", false) || undefined;
            const description = interaction.options.getString("description", false) || undefined;
            const hidden = interaction.options.getBoolean("hidden", false) || false;
            const roleRequiredIdsStr = interaction.options.getString("role-required-ids", false) || "";
            const roleRequiredIds = roleRequiredIdsStr ? roleRequiredIdsStr.split(",").map(s => s.trim()).filter(s => s.length > 0) : undefined;

            newConfig.shop = newConfig.shop || {};
            newConfig.shop.categories = newConfig.shop.categories || {};

            if (newConfig.shop.categories[id]) {
                await interaction.editReply(`A category with ID \`${id}\` already exists.`);
                return;
            }

            const category: shopCategoryConfig = {
                id,
                name,
                hidden,
            };
            
            if (icon !== undefined) category.icon = icon;
            if (description !== undefined) category.description = description;
            if (roleRequiredIds !== undefined) category.roleRequiredIds = roleRequiredIds;
            
            newConfig.shop.categories[id] = category;

            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply(`Category \`${name}\` created with ID \`${id}\`.`);
            break;
        }

        case "delete-category": {
            const id = interaction.options.getString("id", true);

            newConfig.shop = newConfig.shop || {};
            newConfig.shop.categories = newConfig.shop.categories || {};

            if (!newConfig.shop.categories[id]) {
                await interaction.editReply(`No category found with ID \`${id}\`.`);
                return;
            }

            delete newConfig.shop.categories[id];

            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply(`Category with ID \`${id}\` has been deleted.`);
            break;
        }

        case "edit-category": {
            const id = interaction.options.getString("id", true);

            newConfig.shop = newConfig.shop || {};
            newConfig.shop.categories = newConfig.shop.categories || {};

            const category = newConfig.shop.categories[id];
            if (!category) {
                await interaction.editReply(`No category found with ID \`${id}\`.`);
                return;
            }

            const name = interaction.options.getString("name", false);
            const icon = interaction.options.getString("icon", false);
            const description = interaction.options.getString("description", false);
            const hidden = interaction.options.getBoolean("hidden", false);
            const roleRequiredIdsStr = interaction.options.getString("role-required-ids", false);
            const roleRequiredIds = roleRequiredIdsStr ? roleRequiredIdsStr.split(",").map(s => s.trim()).filter(s => s.length > 0) : undefined;

            if (name !== null) category.name = name;
            if (icon !== null) category.icon = icon;
            if (description !== null) category.description = description;
            if (hidden !== null) category.hidden = hidden;
            if (roleRequiredIdsStr !== undefined) {
                if (roleRequiredIds !== undefined) {
                    category.roleRequiredIds = roleRequiredIds;
                } else {
                    delete category.roleRequiredIds;
                }
            }

            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply(`Category with ID \`${id}\` has been updated.`);
            break;  
        }

        case "list-categories": {
            newConfig.shop = newConfig.shop || {};
            newConfig.shop.categories = newConfig.shop.categories || {};

            const categories = Object.values(newConfig.shop.categories);
            if (categories.length === 0) {
                await interaction.editReply("No shop categories configured.");
                return;
            }

            let reply = "Shop Categories:\n";
            for (const category of categories) {
                reply += `• ID: \`${category.id}\`, Name: **${category.name}**${category.hidden ? " (Hidden)" : ""}\n`;
            }

            await interaction.editReply(reply);
            break;
        }

        case "create-item": {
            const id = interaction.options.getString("id", true);
            const name = interaction.options.getString("name", true);
            const emoji = interaction.options.getString("emoji", false) || undefined;
            const description = interaction.options.getString("description", false) || undefined;
            const categoryId = interaction.options.getString("category-id", true);
            const price = interaction.options.getInteger("price", true);
            const minLevel = interaction.options.getInteger("min-level", false) || undefined;
            const requiresRoleIdsStr = interaction.options.getString("requires-role-ids", false) || "";
            const requiresRoleIds = requiresRoleIdsStr ? requiresRoleIdsStr.split(",").map(s => s.trim()).filter(s => s.length > 0) : undefined;
            const maxPerUser = interaction.options.getInteger("max-per-user", false) || undefined;
            const stock = interaction.options.getInteger("stock", false) || undefined;
            const hidden = interaction.options.getBoolean("hidden", false) || false
            const permanent = interaction.options.getBoolean("permanent", false) || false
            const tradeable = interaction.options.getBoolean("tradeable", false) || false
            const sellPrice = interaction.options.getInteger("sell-price", false) || null;

            newConfig.shop = newConfig.shop || {};
            newConfig.shop.items = newConfig.shop.items || {};

            if (newConfig.shop.items[id]) {
                await interaction.editReply(`An item with ID \`${id}\` already exists.`);
                return;
            }

            const item: shopItemConfig = {
                id,
                name,
                categoryId,
                price,
                actions: {},
                hidden,
            };
            
            if (emoji !== undefined) item.emoji = emoji;
            if (description !== undefined) item.description = description;
            if (minLevel !== undefined) item.minLevel = minLevel;
            if (requiresRoleIds !== undefined) item.requiresRoleIds = requiresRoleIds;
            if (maxPerUser !== undefined) item.maxPerUser = maxPerUser;
            if (stock !== undefined) item.stock = stock;
            if (permanent !== undefined) item.permanent = permanent;
            if (tradeable !== undefined) item.tradeable = tradeable;
            if (sellPrice !== null) item.sellPrice = sellPrice;
            
            newConfig.shop.items[id] = item;

            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply(`Item \`${name}\` created with ID \`${id}\`.`);
            break;
        }

        case "delete-item": {
            const id = interaction.options.getString("id", true);

            newConfig.shop = newConfig.shop || {};
            newConfig.shop.items = newConfig.shop.items || {};

            if (!newConfig.shop.items[id]) {
                await interaction.editReply(`No item found with ID \`${id}\`.`);
                return;
            }

            delete newConfig.shop.items[id];

            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply(`Item with ID \`${id}\` has been deleted.`);
            break;
        }

        case "edit-item": {
            const id = interaction.options.getString("id", true);

            newConfig.shop = newConfig.shop || {};
            newConfig.shop.items = newConfig.shop.items || {};

            const item = newConfig.shop.items[id];
            if (!item) {
                await interaction.editReply(`No item found with ID \`${id}\`.`);
                return;
            }

            const name = interaction.options.getString("name", false);
            const emoji = interaction.options.getString("emoji", false);
            const description = interaction.options.getString("description", false);
            const categoryId = interaction.options.getString("category-id", false);
            const price = interaction.options.getInteger("price", false);
            const minLevel = interaction.options.getInteger("min-level", false);
            const requiresRoleIdsStr = interaction.options.getString("requires-role-ids", false);
            const requiresRoleIds = requiresRoleIdsStr ? requiresRoleIdsStr.split(",").map(s => s.trim()).filter(s => s.length > 0) : undefined;
            const maxPerUser = interaction.options.getInteger("max-per-user", false);
            const stock = interaction.options.getInteger("stock", false);
            const hidden = interaction.options.getBoolean("hidden", false);

            if (name !== null) item.name = name;
            if (emoji !== null) item.emoji = emoji;
            if (description !== null) item.description = description;
            if (categoryId !== null) item.categoryId = categoryId;
            if (price !== null) item.price = price;
            if (minLevel !== null) item.minLevel = minLevel;
            if (requiresRoleIdsStr !== undefined) {
                if (requiresRoleIds !== undefined) {
                    item.requiresRoleIds = requiresRoleIds;
                } else {
                    delete item.requiresRoleIds;
                }
            }
            if (maxPerUser !== null) item.maxPerUser = maxPerUser;
            if (stock !== null) item.stock = stock < 0 ? null : stock;
            if (hidden !== null) item.hidden = hidden;

            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply(`Item with ID \`${id}\` has been updated.`);
            break;  
        }

        case "list-items": {
            newConfig.shop = newConfig.shop || {};
            newConfig.shop.items = newConfig.shop.items || {};

            const items = Object.values(newConfig.shop.items);
            if (items.length === 0) {
                await interaction.editReply("No shop items configured.");
                return;
            }

            let reply = "Shop Items:\n";
            for (const item of items) {
                reply += `• ID: \`${item.id}\`, Name: **${item.name}**${item.hidden ? " (Hidden)" : ""}, Price: ${item.price} ${config.style.gold.name || "Gold"}\n`;
            }

            await interaction.editReply(reply);
            break;
        }

        case "add-item-action": {
            const itemId = interaction.options.getString("item-id", true);
            const actionType = interaction.options.getString("action-type", true) as shopItemAction["type"];
            const roleId = interaction.options.getRole("role-id", false)?.id || undefined;
            const message = interaction.options.getString("message", false) || undefined;
            const channelId = interaction.options.getString("channel-id", false) || undefined;
            const command = interaction.options.getString("command", false) || undefined;

            newConfig.shop = newConfig.shop || {};
            newConfig.shop.items = newConfig.shop.items || {};

            const item = newConfig.shop.items[itemId];
            if (!item) {
                await interaction.editReply(`No item found with ID \`${itemId}\`.`);
                return;
            }

            const action: shopItemAction = {
                type: actionType,
            };

            if (actionType === "assignRole" || actionType === "removeRole") {
                if (!roleId) {
                    await interaction.editReply("Role ID is required for assign/remove role actions.");
                    return;
                }
                action.roleId = roleId;
            } else if (actionType === "sendMessage") {
                if (!message) {
                    await interaction.editReply("Message is required for send message actions.");
                    return;
                }
                action.message = message;
                if (channelId) {
                    action.channelId = channelId;
                }
            } else if (actionType === "runCommand") {
                if (!command) {
                    await interaction.editReply("Command is required for run command actions.");
                    return;
                }
                action.command = command;
            } else if (actionType === "giveStat") {
                const stat = interaction.options.getString("stat", false);
                const amountStr = interaction.options.getString("amount", false);
                if (!stat || !amountStr) {
                    await interaction.editReply("Stat and amount are required for give stat actions.");
                    return;
                }
                const amount = parseInt(amountStr, 10);
                if (isNaN(amount)) {
                    await interaction.editReply("Amount must be a valid number for give stat actions.");
                    return;
                }
                action.statId = stat;
                action.amount = amount;
            }

            item.actions = item.actions || [];

            const actionIndex = Object.keys(item.actions).length;
            item.actions[actionIndex] = action;

            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply(`Action added to item with ID \`${itemId}\` at index ${actionIndex}.`);
            break;
        }

        case "remove-item-action": {
            const itemId = interaction.options.getString("item-id", true);
            const actionIndex = interaction.options.getInteger("action-index", true);

            newConfig.shop = newConfig.shop || {};
            newConfig.shop.items = newConfig.shop.items || {};

            const item = newConfig.shop.items[itemId];
            if (!item) {
                await interaction.editReply(`No item found with ID \`${itemId}\`.`);
                return;
            }

            item.actions = item.actions || [];

            if (!item.actions[actionIndex]) {
                await interaction.editReply(`No action found at index ${actionIndex} for item with ID \`${itemId}\`.`);
                return;
            }

            delete item.actions[actionIndex];

            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply(`Action at index ${actionIndex} removed from item with ID \`${itemId}\`.`);
            break;
        }

        case "list-item-actions": {
            const itemId = interaction.options.getString("item-id", true);

            newConfig.shop = newConfig.shop || {};
            newConfig.shop.items = newConfig.shop.items || {};

            const item = newConfig.shop.items[itemId];
            if (!item) {
                await interaction.editReply(`No item found with ID \`${itemId}\`.`);
                return;
            }

            item.actions = item.actions || [];

            const actionEntries = Object.entries(item.actions);
            if (actionEntries.length === 0) {
                await interaction.editReply(`No actions configured for item with ID \`${itemId}\`.`);
                return;
            }

            let reply = `Actions for Item ID \`${itemId}\`:\n`;
            for (const [index, action] of actionEntries) {
                reply += `• Index: ${index}, Type: **${action.type}**\n`;
            }

            await interaction.editReply(reply);
            break;
        }

        default:
            await interaction.editReply("Unknown subcommand.");
            break;
    }

     if (sub !== "list-items" && sub !== "list-categories" && sub !== "list-item-actions" && config.logging.enabled) {
        const { user } = await getOrCreateDbUser({
            discordUserId: interaction.user.id,
            username: interaction.user.username,
            avatarUrl: interaction.user.displayAvatarURL(),
        });

        await logAndBroadcastEvent(interaction, {
            guildId: guild.id,
            userId: user.id,
            category: "config",
            eventType: "configChange",
            source: "shop",
            metaData: { actorDiscordId: interaction.user.id, subcommand: sub },
            timestamp: new Date(),
        }, newConfig);
    }
}