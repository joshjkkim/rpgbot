import type { ButtonInteraction, ChatInputCommandInteraction, ColorResolvable } from "discord.js";
import { EmbedBuilder, SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction } from "discord.js";
import { setGuildConfig } from "../../db/guilds.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateProfile } from "../../cache/profileService.js";
import { updateInventory } from "../../player/inventory.js";
import type { item } from "../../db/userGuildProfiles.js";
import { logAndBroadcastEvent } from "../../db/events.js";

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

    const { user: dbUser } = await getOrCreateDbUser({
        discordUserId: interaction.user.id,
        username: interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL(),
    });

    const { guild: dbGuild, config } = await getOrCreateGuildConfig({
        discordGuildId: interaction.guildId,
    });

    const { profile } = await getOrCreateProfile({
        userId: dbUser.id,
        guildId: dbGuild.id,
    });

    const goldIcon = config.style.gold.icon || "💰";
    const themeColor = (config.style.mainThemeColor || "#00AE86") as ColorResolvable;

    const embed = new EmbedBuilder()
        .setTitle(`🛒 ${interaction.guild?.name} Shop`)
        .setColor(themeColor)
        .setDescription(
            [
                `You currently have **${profile.gold || 0} ${goldIcon}**.`,
                "",
                "Use the buttons below to browse different shop categories.",
            ].join("\n")
        );

    const buttons: ButtonBuilder[] = [];
    let components: ActionRowBuilder<ButtonBuilder>[] = [];

    if (config.shop?.enabled) {
        const categories = config.shop.categories || {};
        const items = config.shop.items || {};

        const itemsByCategoryCount: Record<string, number> = {};
        for (const item of Object.values(items)) {
            if (item.hidden) continue;
            itemsByCategoryCount[item.categoryId] =
                (itemsByCategoryCount[item.categoryId] || 0) + 1;
        }

        if (Object.keys(categories).length === 0) {
            embed.addFields({
                name: "No Categories",
                value: "No shop categories have been configured yet.",
            });
        } else {
            for (const [categoryId, category] of Object.entries(categories)) {
                const count = itemsByCategoryCount[categoryId] || 0;
                const icon = category.icon || "📦";

                embed.addFields({
                    name: `${icon} ${category.name}`,
                    value:
                        (category.description || "_No description provided._") +
                        `\n**Items:** ${count}`,
                });

                buttons.push(
                    new ButtonBuilder()
                        .setCustomId(`shop:category:${categoryId}`)
                        .setLabel(category.name)
                        .setStyle(ButtonStyle.Primary)
                );
            }

            embed.setFooter({ text: "Tip: Use /use <itemId> after buying to activate consumables." });
        }
    } else {
        embed.addFields({
            name: "Shop Disabled",
            value: "The shop is currently disabled in this server.",
        });
    }

    if (buttons.length > 0) {
        components = chunkButtons(buttons);
    }

    await interaction.editReply({ embeds: [embed], components });
}


export async function handleMainShopButton(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("shop:")) return;

    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply({
            content: "This interaction can only be used in a server.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const [, action, categoryId] = interaction.customId.split(":");

    if (action !== "category" || !categoryId) {
        await interaction.editReply({
            content: "Invalid shop category.",
        });
        return;
    }

    const { guild: dbGuild, config } = await getOrCreateGuildConfig({
        discordGuildId: interaction.guildId,
    });

    const category = config.shop?.categories?.[categoryId];
    if (!category) {
        await interaction.editReply({
            content: "This category does not exist.",
        });
        return;
    }

    const goldIcon = config.style.gold.icon || "💰";
    const themeColor = (config.style.mainThemeColor || "#00AE86") as ColorResolvable;

    const embed = new EmbedBuilder()
        .setTitle(`${category.icon || "📦"} ${category.name}`)
        .setColor(themeColor)
        .setDescription(
            [
                category.description || "_No description provided._",
                "",
                "Use the **Buy an Item** button below and enter the item ID + quantity.",
            ].join("\n")
        );

    const items = config.shop?.items || {};
    const categoryItems = Object.values(items).filter(
        (item) => item.categoryId === categoryId && item.hidden !== true
    );

    if (categoryItems.length === 0) {
        embed.addFields({
            name: "No Items",
            value: "There are no items in this category yet.",
        });
    } else {
        for (const item of categoryItems) {
            const stockLabel =
                item.stock === null || item.stock === undefined
                    ? "∞"
                    : item.stock.toString();

            const requirements: string[] = [];

            if (item.minLevel) {
                requirements.push(`Level ${item.minLevel}+`);
            }
            if (item.requiresRoleIds && item.requiresRoleIds.length > 0) {
                requirements.push(`${item.requiresRoleIds.length} role(s) required`);
            }

            embed.addFields({
                name: `${item.emoji || "•"} ${item.name} \`[${item.id}]\``,
                value: [
                    item.description || "_No description._",
                    "",
                    `**Price:** ${item.price} ${goldIcon}`,
                    `**Stock:** ${stockLabel}`,
                    requirements.length > 0
                        ? `**Requires:** ${requirements.join(" • ")}`
                        : "",
                ]
                    .filter(Boolean)
                    .join("\n"),
            });
        }
    }

    embed.setFooter({ text: `Category ID: ${categoryId}` });

    const buttons = [
        new ButtonBuilder()
            .setCustomId(`shop:buy:${categoryId}`)
            .setLabel("Buy an Item")
            .setStyle(ButtonStyle.Primary),
    ];

    await interaction.editReply({
        embeds: [embed],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)],
    });
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

    const { user: dbUser } = await getOrCreateDbUser({
        discordUserId: interaction.user.id,
        username: interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL(),
    });

    const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });

    const { profile } = await getOrCreateProfile({
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
        if (item.stock < quantity || item.stock <= 0) {
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
        };
    }

    newInventory[itemId].quantity += quantity;
    const newGoldBalance = balance - price;

    await updateInventory(profile.user_id, profile.guild_id, newInventory, newGoldBalance);
    await setGuildConfig(interaction.guildId, newConfig);

    await interaction.editReply({ content: `You have purchased **${quantity} x ${item.name}** for **${item.price * quantity} ${config.style.gold.icon || "💰"}**!` });


    await logAndBroadcastEvent(interaction, {
        guildId: dbGuild.id,
        userId: dbUser.id,
        category: "economy",
        eventType: "buy",
        source: "shop",
        goldDelta: -price,
        itemId: item.id,
        itemQuantity: quantity,
        metaData: { actorDiscordId: interaction.user.id, itemId, quantity },
        timestamp: new Date(),
    }, config);

}