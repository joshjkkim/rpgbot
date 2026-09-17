import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags, GuildMember, ContainerBuilder, SectionBuilder, TextDisplayBuilder } from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateProfile, commitProfileChanges } from "../../cache/profileService.js";
import { calculateLevelFromXp } from "../../leveling/levels.js";
import { purchaseItem } from "../../db/shop.js";
import { ownerSetupRows } from "../../ui/dashboardLinks.js";
import { accentColor, pageOf, pagerButtons } from "../../ui/pager.js";
import { updateUserStats } from "../../db/userGuildProfiles.js";
import { logAndBroadcastEvent } from "../../db/events.js";
import { applyAchievementSideEffects, runAchievementPipeline } from "../../player/achievements.js";
import type { PendingProfileChanges } from "../../types/cache.js";
import type { GuildConfig } from "../../types/guild.js";

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

    await interaction.editReply({
        components: await renderShop(interaction, "home", "", 0),
        flags: MessageFlags.IsComponentsV2,
    });
}

/** The front counter (`view` "home") or one category's shelf. */
async function renderShop(interaction: ChatInputCommandInteraction | ButtonInteraction, view: "home" | "category", categoryId: string, page: number, status?: string) {
    const { user: dbUser } = await getOrCreateDbUser({
        discordUserId: interaction.user.id,
        username: interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL(),
    });
    const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId! });
    const { profile } = await getOrCreateProfile({ userId: dbUser.id, guildId: dbGuild.id });

    const goldIcon = config.style.gold.icon || "💰";
    const balance = `You have **${profile.gold || 0} ${goldIcon}**.`;
    const container = new ContainerBuilder().setAccentColor(accentColor(config.style.mainThemeColor));
    if (status) container.addTextDisplayComponents(t => t.setContent(`-# ${status}`));

    const categories = config.shop?.categories ?? {};
    const category = categories[categoryId];

    if (view === "category" && category && config.shop?.enabled) {
        return renderCategory(container, config, categoryId, page, balance);
    }

    container.addTextDisplayComponents(t => t.setContent(`## 🛒 ${interaction.guild?.name ?? "Server"} Shop\n${balance}`));

    if (!config.shop?.enabled) {
        container.addTextDisplayComponents(t => t.setContent("**Shop Closed**\nThe shopkeeper hasn't opened for business yet."));
        return [container, ...ownerSetupRows(interaction, "shop", "Open the shop on the dashboard")];
    }

    if (Object.keys(categories).length === 0) {
        container.addTextDisplayComponents(t => t.setContent("The shelves are bare. Nothing has been stocked yet."));
        return [container, ...ownerSetupRows(interaction, "shop", "Stock the shop on the dashboard")];
    }

    const items = Object.values(config.shop.items ?? {});
    const list = Object.entries(categories);
    const shelf = pageOf(list, page);

    container.addSeparatorComponents(s => s);
    for (const [id, cat] of shelf.items) {
        const count = items.filter(i => i.categoryId === id && !i.hidden).length;
        container.addSectionComponents(new SectionBuilder()
            .addTextDisplayComponents(t => t.setContent(
                `**${cat.icon || "📦"} ${cat.name}** · ${count} item${count === 1 ? "" : "s"}` +
                (cat.description ? `\n-# ${cat.description}` : "")
            ))
            .setButtonAccessory(b => b
                .setCustomId(`shop:category:${id}:0`)
                .setLabel("Browse")
                .setStyle(ButtonStyle.Primary)));
    }

    const pager = pagerButtons(p => `shop:home::${p}`, shelf.page, shelf.pages);
    return pager.length ? [container, new ActionRowBuilder<ButtonBuilder>().addComponents(...pager)] : [container];
}

function renderCategory(container: ContainerBuilder, config: GuildConfig, categoryId: string, page: number, balance: string) {
    const goldIcon = config.style.gold.icon || "💰";
    const category = config.shop!.categories![categoryId]!;
    const items = Object.values(config.shop!.items ?? {}).filter(i => i.categoryId === categoryId && !i.hidden);
    const shelf = pageOf(items, page);

    container
        .addTextDisplayComponents(t => t.setContent(
            `## ${category.icon || "📦"} ${category.name}\n` +
            (category.description ? `${category.description}\n` : "") +
            balance
        ))
        .addSeparatorComponents(s => s);

    if (items.length === 0) {
        container.addTextDisplayComponents(t => t.setContent("_Nothing on this shelf yet._"));
    }

    for (const item of shelf.items) {
        const soldOut = item.stock === 0;
        const details = [
            item.stock != null ? `Stock: ${item.stock}` : "",
            item.minLevel ? `Level ${item.minLevel}+` : "",
            item.requiresRoleIds?.length ? "Role required" : "",
        ].filter(Boolean).join(" · ");

        container.addSectionComponents(new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**${item.emoji || "•"} ${item.name}**` +
                (item.description ? `\n-# ${item.description.length > 150 ? item.description.slice(0, 147) + "..." : item.description}` : "") +
                (details ? `\n-# ${details}` : "")
            ))
            .setButtonAccessory(b => b
                .setCustomId(`shop:buy:${categoryId}:${shelf.page}:${item.id}`)
                .setLabel(soldOut ? "Sold out" : `Buy · ${item.price} ${goldIcon}`)
                .setStyle(ButtonStyle.Success)
                .setDisabled(soldOut)));
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...pagerButtons(p => `shop:category:${categoryId}:${p}`, shelf.page, shelf.pages),
        new ButtonBuilder()
            .setCustomId("shop:home::0")
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
    );

    return [container, row];
}

export async function handleShopButton(interaction: ButtonInteraction) {
    // shop:home::{page} | shop:category:{categoryId}:{page} | shop:buy:{categoryId}:{page}:{itemId}
    const [, action, categoryId = "", pageStr, ...rest] = interaction.customId.split(":");

    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply({ content: "This interaction can only be used in a server.", flags: MessageFlags.Ephemeral });
        return;
    }

    // Menus from before this layout used shop:category:{id} (new message) and a typed-ID modal.
    if (pageStr === undefined) {
        await interaction.reply({ content: "This menu has expired. Run /shop again.", flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferUpdate();

    const status = action === "buy" ? await buyItem(interaction, rest.join(":"), 1) : undefined;
    const view = action === "home" ? "home" : "category";

    await interaction.editReply({
        components: await renderShop(interaction, view, categoryId, Number(pageStr), status),
        flags: MessageFlags.IsComponentsV2,
    });
}

/** Buys `quantity` of `itemId` for the clicking user and returns a status line. */
async function buyItem(interaction: ButtonInteraction, itemId: string, quantity: number): Promise<string> {
    const { user: dbUser } = await getOrCreateDbUser({
        discordUserId: interaction.user.id,
        username: interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL(),
    });

    const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId! });

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
        return "❌ This item does not exist.";
    }

    if (configItem.requiresRoleIds && configItem.requiresRoleIds.length > 0) {
        const member = await interaction.guild?.members.fetch(interaction.user.id);
        const hasRequiredRole = configItem.requiresRoleIds.some(roleId => member?.roles.cache.has(roleId));
        if (!hasRequiredRole) {
            return "❌ You do not have the required role to purchase this item.";
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
        return `❌ ${purchase.message}`;
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
            discordGuildId: interaction.guildId!,
            discordUserId: interaction.user.id,
            member: interaction.member instanceof GuildMember ? interaction.member : null,
            channelIdHint: interaction.channelId,
            config,
            unlocked: ach.unlocked,
            rewards: ach.rewards ? { grantedRoles: ach.rewards.grantedRoles, messages: ach.rewards.messages } : null,
        });
    }

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

    return `✅ Bought **${quantity} × ${item.name}** for **${price} ${config.style.gold.icon || "💰"}**.`;
}
