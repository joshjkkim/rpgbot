import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder, type ColorResolvable } from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateProfile } from "../../cache/profileService.js";
import { getInventory } from "../../player/inventory.js";
import { calculateStats, resolveCurrentHp, formatStats } from "../../player/combat.js";

const SLOT_META: { key: keyof NonNullable<import("../../types/userprofile.js").DbUserGuildProfile["equips"]>; label: string; emoji: string }[] = [
    { key: "head",      label: "Head",      emoji: "👑" },
    { key: "body",      label: "Body",      emoji: "👕" },
    { key: "legs",      label: "Legs",      emoji: "👖" },
    { key: "feet",      label: "Feet",      emoji: "👟" },
    { key: "hands",     label: "Hands",     emoji: "🧤" },
    { key: "weapon",    label: "Weapon",    emoji: "⚔️" },
    { key: "shield",    label: "Shield",    emoji: "🛡️" },
    { key: "accessory", label: "Accessory", emoji: "💍" },
    { key: "aura",      label: "Aura",      emoji: "✨" },
];

export const data = new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("View your inventory")

    .addUserOption(opt =>
        opt.setName("user")
            .setDescription("The user whose inventory you want to view")
            .setRequired(false)
    );

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply("This command can only be used in a server.");
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const targetUser = interaction.options.getUser("user") || interaction.user;

    const { user: dbUser } = await getOrCreateDbUser({
        discordUserId: targetUser.id,
        username: targetUser.username,
        avatarUrl: targetUser.displayAvatarURL(),
    });

    const { guild: dbGuild, config } = await getOrCreateGuildConfig({
        discordGuildId: interaction.guildId,
    });

    const { profile } = await getOrCreateProfile({
        userId: dbUser.id,
        guildId: dbGuild.id,
    });

    if (profile.settings && profile.settings.inventoryPrivate && interaction.user.id !== targetUser.id) {
        await interaction.editReply({ content: "This user's inventory is private." });
        return;
    }

    const inventory = await getInventory(profile.user_id, profile.guild_id);
    const goldIcon = config.style.gold.icon || "💰";
    const themeColor = (config.style.mainThemeColor || "#00AE86") as ColorResolvable;
    const equips = profile.equips ?? {};
    const equippedIds = new Set(Object.values(equips).filter(Boolean) as string[]);

    const items = Object.entries(inventory || {}).filter(([_, item]) => !!item);

    const gearButton = new ButtonBuilder()
        .setCustomId(`inventory:gear:${profile.id}`)
        .setLabel("View Gear")
        .setEmoji("⚔️")
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(gearButton);

    if (items.length === 0) {
        const emptyEmbed = new EmbedBuilder()
            .setTitle(`${interaction.user.username}'s Inventory`)
            .setColor(themeColor)
            .setDescription("Your inventory is empty.")
            .setFooter({ text: `Gold: ${profile.gold || 0} ${goldIcon}` });

        await interaction.editReply({ embeds: [emptyEmbed], components: [row] });
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle(`${interaction.user.username}'s Inventory`)
        .setColor(themeColor)
        .setDescription(
            `You currently have **${profile.gold || 0} ${goldIcon}**.\n` +
            `Use \`/use <itemId>\` to activate certain items.`
        );

    items.slice(0, 25).forEach(([itemId, item]) => {
        const qty = item.quantity ?? 0;
        const emoji = item.emoji || "•";
        const equipped = equippedIds.has(itemId);

        const rawDesc = item.description || "No description.";
        const desc = rawDesc.length > 150 ? rawDesc.slice(0, 147) + "..." : rawDesc;

        embed.addFields({
            name: `${emoji} ${item.name} \`[${itemId}]\` ×${qty}${equipped ? "  🟢 **Equipped**" : ""}`,
            value: desc,
        });
    });

    await interaction.editReply({ embeds: [embed], components: [row] });
}

// ─── Button: gear sheet + back ────────────────────────────────────────────────

export async function handleInventoryButton(interaction: ButtonInteraction) {
    // customId: inventory:gear:{profileId} | inventory:back:{profileId}
    const [, action] = interaction.customId.split(":");

    await interaction.deferUpdate();

    const { user: dbUser } = await getOrCreateDbUser({ discordUserId: interaction.user.id });
    const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId! });
    const { profile } = await getOrCreateProfile({ userId: dbUser.id, guildId: dbGuild.id });

    const themeColor = (config.style.mainThemeColor || "#00AE86") as ColorResolvable;
    const inventory = await getInventory(profile.user_id, profile.guild_id);
    const equips = profile.equips ?? {};

    if (action === "gear") {
        const shopItems = config.shop?.items ?? {};
        const equippedSet = new Set(Object.values(equips).filter(Boolean) as string[]);

        const slotLines = SLOT_META.map(({ key, label, emoji }) => {
            const itemId = equips[key];
            if (!itemId) return `${emoji} **${label}** — \`empty\``;
            const invItem = inventory[itemId];
            const name = invItem?.name ?? shopItems[itemId]?.name ?? itemId;
            const itemEmoji = invItem?.emoji ?? shopItems[itemId]?.emoji ?? "";
            return `${emoji} **${label}** — ${itemEmoji} ${name} \`[${itemId}]\``;
        });

        const effectLines: string[] = [];
        for (const itemId of Object.values(equips)) {
            if (!itemId) continue;
            const shopItem = shopItems[itemId];
            if (!shopItem?.effects) continue;
            const { cosmetic, boosts } = shopItem.effects;
            if (cosmetic?.title) effectLines.push(`🏷️ Title: **${cosmetic.title}**`);
            if (cosmetic?.nameEmoji) effectLines.push(`✏️ Name emoji: ${cosmetic.nameEmoji}`);
            if (boosts?.xpMultiplier && boosts.xpMultiplier !== 1) effectLines.push(`⚡ XP ×${boosts.xpMultiplier}`);
            if (boosts?.goldMultiplier && boosts.goldMultiplier !== 1) effectLines.push(`💰 Gold ×${boosts.goldMultiplier}`);
        }

        // Combat stats
        const combatStats = config.combat?.enabled
            ? calculateStats(profile, config, shopItems)
            : null;
        const currentHp = combatStats ? resolveCurrentHp(profile, combatStats) : null;

        const description =
            slotLines.join("\n") +
            (effectLines.length > 0 ? `\n\n**Active Effects**\n${effectLines.join("\n")}` : "") +
            (combatStats && currentHp !== null
                ? `\n\n**Combat Stats**\n${formatStats(combatStats, currentHp)}`
                : "");

        const gearEmbed = new EmbedBuilder()
            .setTitle(`⚔️ ${interaction.user.username}'s Gear`)
            .setColor(themeColor)
            .setDescription(description)
            .setFooter({ text: "Use /equip and /unequip to manage your gear" });

        const backButton = new ButtonBuilder()
            .setCustomId(`inventory:back:${profile.id}`)
            .setLabel("Back to Inventory")
            .setEmoji("📦")
            .setStyle(ButtonStyle.Secondary);

        await interaction.editReply({
            embeds: [gearEmbed],
            components: [new ActionRowBuilder<ButtonBuilder>().addComponents(backButton)],
        });

    } else if (action === "back") {
        const goldIcon = config.style.gold.icon || "💰";
        const equippedIds = new Set(Object.values(equips).filter(Boolean) as string[]);
        const items = Object.entries(inventory || {}).filter(([, item]) => !!item);

        const gearButton = new ButtonBuilder()
            .setCustomId(`inventory:gear:${profile.id}`)
            .setLabel("View Gear")
            .setEmoji("⚔️")
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(gearButton);

        if (items.length === 0) {
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(`${interaction.user.username}'s Inventory`)
                    .setColor(themeColor)
                    .setDescription("Your inventory is empty.")
                    .setFooter({ text: `Gold: ${profile.gold || 0} ${goldIcon}` })],
                components: [row],
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle(`${interaction.user.username}'s Inventory`)
            .setColor(themeColor)
            .setDescription(
                `You currently have **${profile.gold || 0} ${goldIcon}**.\n` +
                `Use \`/use <itemId>\` to activate certain items.`
            );

        items.slice(0, 25).forEach(([itemId, item]) => {
            const qty = item.quantity ?? 0;
            const emoji = item.emoji || "•";
            const equipped = equippedIds.has(itemId);
            const rawDesc = item.description || "No description.";
            const desc = rawDesc.length > 150 ? rawDesc.slice(0, 147) + "..." : rawDesc;
            embed.addFields({
                name: `${emoji} ${item.name} \`[${itemId}]\` ×${qty}${equipped ? "  🟢 **Equipped**" : ""}`,
                value: desc,
            });
        });

        await interaction.editReply({ embeds: [embed], components: [row] });
    }
}