import type { ButtonInteraction, ChatInputCommandInteraction, ColorResolvable } from "discord.js";
import { EmbedBuilder, SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction } from "discord.js";
import { upsertUserGuildProfile } from "../../db/userGuildProfiles.js";
import { upsertUser } from "../../db/users.js";
import { getGuildConfig, setGuildConfig } from "../../db/guilds.js";
import { updateInventory } from "../../inventory/inventory.js";
import type { item } from "../../db/userGuildProfiles.js";

function chunkButtons(buttons: ButtonBuilder[], size = 5) {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += size) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...buttons.slice(i, i + size)
    );
    rows.push(row);
  }
  return rows;
}

export const data = new SlashCommandBuilder()
    .setName("shop")
    .setDescription("View the shop and your balance")
    ;

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply("This command can only be used in a server.");
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const dbUser = await upsertUser({
        discordUserId: interaction.user.id,
        username: interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL(),
    });

    const { guild: dbGuild, config } = await getGuildConfig(interaction.guildId);

    const profile = await upsertUserGuildProfile({
        userId: dbUser.id,
        guildId: dbGuild.id,
    });


    const themeColor = config.style.mainThemeColor || "#00AE86";
    let buttons: ButtonBuilder[] = []

    const embed = new EmbedBuilder()
        .setTitle(`${interaction.guild?.name} Shop`)
        .setColor(themeColor as ColorResolvable)
        .setDescription(`You have **${profile.gold || 0} ${config.style.gold.icon || "💰"}** to spend!`)
        ;

    if (config.shop?.enabled) {
        const categories = config.shop.categories || {};

        for (const [categoryId, category] of Object.entries(categories)) {
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`shop:category:${categoryId}`) 
                    .setLabel(category.name)
                    .setStyle(ButtonStyle.Primary)
            )

            embed.addFields({
                name: `${category.icon || ""} ${category.name}`,
                value: category.description || "No description provided.",
            });
        }

    } else {
        embed.addFields({
            name: "Shop Disabled",
            value: "The shop is currently disabled in this server.",
        });
    }


    let components: (ActionRowBuilder<ButtonBuilder>)[] = [];
    if(buttons.length > 0) {
        components = chunkButtons(buttons);
    }

    await interaction.editReply({ embeds: [embed], components });
}   

export async function handleMainShopButton(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("shop:")) return;

    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply({ content: "This interaction can only be used in a server.", flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const [, , categoryId] = interaction.customId.split(":");

    if (!categoryId) {
        await interaction.reply({ content: "Invalid shop category.", flags: MessageFlags.Ephemeral });
        return;
    }

    const { guild: dbGuild, config } = await getGuildConfig(interaction.guildId);

    const category = config.shop?.categories?.[categoryId];
    if (!category) {
        await interaction.reply({ content: "This category does not exist.", flags: MessageFlags.Ephemeral });
        return;
    }

    const themeColor = config.style.mainThemeColor || "#00AE86";
    
    const embed = new EmbedBuilder()
        .setTitle(`${category.icon || ""} ${category.name} - Shop Category`)
        .setColor(themeColor as ColorResolvable)
        .setDescription(category.description || "No description provided.")
        ;

    const items = config.shop?.items || {};
    const categoryItems = Object.values(items).filter(item => item.categoryId === categoryId && item.hidden !== true);
    
    if (categoryItems.length === 0) {
        embed.addFields({
            name: "No Items",
            value: "There are no items in this category.",
        });
    } else {
        for (const item of categoryItems) {
            embed.addFields({
                name: `${item.emoji || ""} ${item.name} (ID: \`${item.id}\`) - ${item.price} ${config.style.gold.icon || "💰"}`,
                value: item.description || "No description.",
            });
        }
    }

    let buttons = [
        new ButtonBuilder()
            .setCustomId(`shop:buy:${categoryId}`) 
            .setLabel("Buy an Item")
            .setStyle(ButtonStyle.Primary),
    ]

    await interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] });
}

export async function handleBuyItemButton(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("shop:buy:")) return;

    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply({ content: "This interaction can only be used in a server.", flags: MessageFlags.Ephemeral });
        return;
    }

    const [, , categoryId] = interaction.customId.split(":");

    if (!categoryId) {
        await interaction.reply({ content: "Invalid shop category.", flags: MessageFlags.Ephemeral });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`shop:purchase:item`)
        .setTitle("Purchase Item");

    const itemIdInput = new TextInputBuilder()
        .setCustomId("shop-purchase-item-id-input")
        .setLabel("Item ID to Purchase")
        .setPlaceholder("e.g. sword_of_power")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const quantityIdInput = new TextInputBuilder()
        .setCustomId("shop-purchase-quantity-input")
        .setLabel("Quantity to Purchase")
        .setPlaceholder("e.g. 1")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const itemIdRow = new ActionRowBuilder<TextInputBuilder>().addComponents(itemIdInput);
    const quantityIdRow = new ActionRowBuilder<TextInputBuilder>().addComponents(quantityIdInput);

    modal.addComponents(itemIdRow, quantityIdRow); 

    await interaction.showModal(modal);
}

export async function handlePurchaseItemModal(interaction: ModalSubmitInteraction) {
    if (interaction.customId !== "shop:purchase:item") return;

    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply({ content: "This interaction can only be used in a server.", flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const itemId = interaction.fields.getTextInputValue("shop-purchase-item-id-input");
    const quantityStr = interaction.fields.getTextInputValue("shop-purchase-quantity-input");
    const quantity = parseInt(quantityStr, 10);

    if (isNaN(quantity) || quantity <= 0) {
        await interaction.editReply({ content: "Invalid quantity specified."});
        return;
    }

    const dbUser = await upsertUser({
        discordUserId: interaction.user.id,
        username: interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL(),
    });

    const { guild: dbGuild, config } = await getGuildConfig(interaction.guildId);

    const profile = await upsertUserGuildProfile({
        userId: dbUser.id,
        guildId: dbGuild.id,
    });

    const newConfig = { ...config };

    const item = newConfig.shop?.items?.[itemId];
    if (!item) {
        await interaction.editReply({ content: "This item does not exist."});
        return;
    }

    const price = item.price * quantity;
    const balance = Number(profile.gold || 0);

    if (balance < price) {
        await interaction.editReply({ content: "You do not have enough gold to make this purchase."});
        return;
    }

    if (item.minLevel !== undefined && profile.level < item.minLevel) {
        await interaction.editReply({ content: `You need to be at least level ${item.minLevel} to purchase this item.`});
        return;
    }

    if (item.requiresRoleIds && item.requiresRoleIds.length > 0) {
        const member = await interaction.guild?.members.fetch(interaction.user.id);
        const hasRequiredRole = item.requiresRoleIds.some(roleId => member?.roles.cache.has(roleId));
        if (!hasRequiredRole) {
            await interaction.editReply({ content: "You do not have the required role to purchase this item."});
            return;
        }
    }

    if (item.stock !== undefined && item.stock !== null) {
        if (item.stock < quantity) {
            await interaction.editReply({ content: "There is not enough stock to complete your purchase."});
            return;
        }
        newConfig.shop!.items![itemId]!.stock! -= quantity;
        item.stock -= quantity;
    }

    const newInventory: Record<string, item> = { ...profile.inventory };
    if (!newInventory[itemId]) {
        newInventory[itemId] = {
            id: item.id,
            name: item.name,
            ...(item.emoji ? { emoji: item.emoji } : {}),
            ...(item.description !== undefined && { description: item.description }),
            quantity: 0,
            ...(item.maxPerUser !== undefined && { maxPerUser: item.maxPerUser }),
            ...(item.actions !== undefined && { actions: item.actions }),
        };
    }

    newInventory[itemId].quantity += quantity;
    const newGoldBalance = balance - price;

    await updateInventory(profile.user_id, profile.guild_id, newInventory, newGoldBalance);
    await setGuildConfig(interaction.guildId, newConfig);

    await interaction.editReply({ content: `You have purchased **${quantity} x ${item.name}** for **${item.price * quantity} ${config.style.gold.icon || "💰"}**!` });

}