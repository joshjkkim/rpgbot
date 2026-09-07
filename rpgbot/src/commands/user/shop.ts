import type { ButtonInteraction, ChatInputCommandInteraction, ColorResolvable } from "discord.js";
import { EmbedBuilder, SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction, GuildMember } from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateProfile, commitProfileChanges } from "../../cache/profileService.js";
import { calculateLevelFromXp } from "../../leveling/levels.js";
import { purchaseItem } from "../../db/shop.js";
import { updateUserStats } from "../../db/userGuildProfiles.js";
import { logAndBroadcastEvent } from "../../db/events.js";
import { applyAchievementSideEffects, runAchievementPipeline } from "../../player/achievements.js";
import type { PendingProfileChanges } from "../../types/cache.js";

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

    // Ensures the profile row exists; purchaseItem locks it rather than reading
    // anything from this snapshot.
    await getOrCreateProfile({
        userId: dbUser.id,
        guildId: dbGuild.id,
    });

    // Role gating needs the Discord member, so it stays here. Everything that
    // depends on mutable state -- price, level, gold, stock -- is re-checked
    // against locked rows inside purchaseItem.
    const configItem = config.shop?.items?.[itemId];
    if (!configItem) {
        await interaction.editReply({ content: "This item does not exist."});
        return;
    }

    if (configItem.requiresRoleIds && configItem.requiresRoleIds.length > 0) {
        const member = await interaction.guild?.members.fetch(interaction.user.id);
        const hasRequiredRole = configItem.requiresRoleIds.some(roleId => member?.roles.cache.has(roleId));
        if (!hasRequiredRole) {
            await interaction.editReply({ content: "You do not have the required role to purchase this item."});
            return;
        }
    }

    const purchase = await purchaseItem({
        userId: dbUser.id,
        guildId: dbGuild.id,
        discordGuildId: dbGuild.discord_guild_id,
        itemId,
        quantity,
    });

    if (!purchase.success) {
        await interaction.editReply({ content: purchase.message });
        return;
    }

    const item = purchase.item;
    const price = Number(purchase.price);

    const cached2 = await getOrCreateProfile({ userId: dbUser.id, guildId: dbGuild.id });
    let prof2 = cached2.profile;
    let pending2 = cached2.pendingChanges ?? ({} as PendingProfileChanges);
    const baseline = { xp: prof2.xp, gold: prof2.gold };

    const ach = await runAchievementPipeline({ profile: prof2, pending: pending2, config });
    prof2 = ach.profile;
    pending2 = ach.pending;

    commitProfileChanges({
        userId: dbUser.id,
        guildId: dbGuild.id,
        profile: prof2,
        changes: pending2,
        baseline,
        recomputeLevel: (xp) => calculateLevelFromXp(Number(xp), config),
    });

    if (ach.unlocked.length || ach.rewards?.messages?.length || ach.rewards?.grantedRoles?.length) {
        await applyAchievementSideEffects({
            client: interaction.client,
            discordGuildId: interaction.guildId,
            discordUserId: interaction.user.id,
            member: interaction.member instanceof GuildMember ? interaction.member : null,
            channelIdHint: interaction.channelId,
            config,
            unlocked: ach.unlocked,
            rewards: ach.rewards ? { grantedRoles: ach.rewards.grantedRoles, messages: ach.rewards.messages } : null,
        });
    }

    await interaction.editReply({ content: `You have purchased **${quantity} x ${item.name}** for **${item.price * quantity} ${config.style.gold.icon || "💰"}**!` });

    await updateUserStats(dbUser.id, dbGuild.id, {
        itemsPurchased: (prof2.user_stats?.itemsPurchased ?? 0) + quantity,
        goldSpent: (prof2.user_stats?.goldSpent ?? 0) + price,
    });

    await logAndBroadcastEvent(interaction, {
        guildId: dbGuild.id,
        discordGuildId: dbGuild.discord_guild_id,
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