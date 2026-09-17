import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, ContainerBuilder, MessageFlags, SectionBuilder, SlashCommandBuilder, TextDisplayBuilder } from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateProfile } from "../../cache/profileService.js";
import { equipItemFromInventory, useItemFromInventory } from "../../player/inventory.js";
import { calculateStats, resolveCurrentHp, formatStats } from "../../player/combat.js";
import { accentColor, pageOf, pagerButtons } from "../../ui/pager.js";
import type { EquipSlot } from "../../types/economy.js";
import type { GuildConfig } from "../../types/guild.js";
import type { DbUserGuildProfile } from "../../types/userprofile.js";

const SLOT_META: { key: EquipSlot; label: string; emoji: string }[] = [
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
    const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    const { profile } = await getOrCreateProfile({ userId: dbUser.id, guildId: dbGuild.id });

    if (profile.settings && profile.settings.inventoryPrivate && interaction.user.id !== targetUser.id) {
        await interaction.editReply({ content: "This user's inventory is private." });
        return;
    }

    await interaction.editReply({
        components: renderInventory({ ownerId: targetUser.id, ownerName: targetUser.username, canAct: interaction.user.id === targetUser.id, profile, config, page: 0 }),
        flags: MessageFlags.IsComponentsV2,
    });
}

type View = {
    ownerId: string;
    ownerName: string;
    canAct: boolean;
    profile: DbUserGuildProfile;
    config: GuildConfig;
    page: number;
    status?: string | undefined;
};

function renderInventory({ ownerId, ownerName, canAct, profile, config, page, status }: View) {
    const goldIcon = config.style.gold.icon || "💰";
    const shopItems = config.shop?.items ?? {};
    const equippedIds = new Set(Object.values(profile.equips ?? {}).filter(Boolean) as string[]);
    const owned = Object.entries(profile.inventory ?? {}).filter(([, item]) => !!item && item.quantity > 0);
    const view = pageOf(owned, page);

    const container = new ContainerBuilder().setAccentColor(accentColor(config.style.mainThemeColor));
    if (status) container.addTextDisplayComponents(t => t.setContent(`-# ${status}`));
    container
        .addTextDisplayComponents(t => t.setContent(`## 🎒 ${ownerName}'s Inventory\n${profile.gold || 0} ${goldIcon}`))
        .addSeparatorComponents(s => s);

    if (owned.length === 0) {
        container.addTextDisplayComponents(t => t.setContent("_Your bags are empty._"));
    }

    for (const [itemId, item] of view.items) {
        const def = shopItems[itemId];
        const rawDesc = item.description || def?.description || "";
        const desc = rawDesc.length > 150 ? rawDesc.slice(0, 147) + "..." : rawDesc;
        const text = new TextDisplayBuilder().setContent(
            `**${item.emoji || "•"} ${item.name}** ×${item.quantity}${equippedIds.has(itemId) ? " · _Equipped_" : ""}` +
            (desc ? `\n-# ${desc}` : "")
        );

        // One action per item: equipping wins, since gear rarely also has use actions.
        const action = !canAct || !def ? null
            : def.equipable && def.equipSlot ? { id: "equip", label: "Equip" }
            : def.actions && Object.keys(def.actions).length > 0 ? { id: "use", label: "Use" }
            : null;

        if (action) {
            container.addSectionComponents(new SectionBuilder()
                .addTextDisplayComponents(text)
                .setButtonAccessory(b => b
                    .setCustomId(`inventory:${action.id}:${ownerId}:${view.page}:${itemId}`)
                    .setLabel(action.label)
                    .setStyle(ButtonStyle.Primary)));
        } else {
            container.addTextDisplayComponents(text);
        }
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...pagerButtons(p => `inventory:page:${ownerId}:${p}`, view.page, view.pages),
        new ButtonBuilder()
            .setCustomId(`inventory:gear:${ownerId}:${view.page}`)
            .setLabel("Gear")
            .setEmoji("⚔️")
            .setStyle(ButtonStyle.Secondary),
    );

    return [container, row];
}

function renderGear({ ownerId, ownerName, canAct, profile, config, page, status }: View) {
    const shopItems = config.shop?.items ?? {};
    const inventory = profile.inventory ?? {};
    const equips = profile.equips ?? {};

    const container = new ContainerBuilder().setAccentColor(accentColor(config.style.mainThemeColor));
    if (status) container.addTextDisplayComponents(t => t.setContent(`-# ${status}`));
    container
        .addTextDisplayComponents(t => t.setContent(`## ⚔️ ${ownerName}'s Gear`))
        .addSeparatorComponents(s => s);

    for (const { key, label, emoji } of SLOT_META) {
        const itemId = equips[key];
        if (!itemId) {
            container.addTextDisplayComponents(t => t.setContent(`${emoji} **${label}** · _empty_`));
            continue;
        }
        const name = inventory[itemId]?.name ?? shopItems[itemId]?.name ?? itemId;
        const itemEmoji = inventory[itemId]?.emoji ?? shopItems[itemId]?.emoji ?? "";
        const text = new TextDisplayBuilder().setContent(`${emoji} **${label}** · ${itemEmoji} ${name}`);

        if (canAct) {
            container.addSectionComponents(new SectionBuilder()
                .addTextDisplayComponents(text)
                .setButtonAccessory(b => b
                    .setCustomId(`inventory:unequip:${ownerId}:${page}:${key}`)
                    .setLabel("Unequip")
                    .setStyle(ButtonStyle.Secondary)));
        } else {
            container.addTextDisplayComponents(text);
        }
    }

    const effectLines: string[] = [];
    for (const itemId of Object.values(equips)) {
        const effects = itemId ? shopItems[itemId]?.effects : undefined;
        if (!effects) continue;
        const { cosmetic, boosts } = effects;
        if (cosmetic?.title) effectLines.push(`🏷️ Title: **${cosmetic.title}**`);
        if (cosmetic?.nameEmoji) effectLines.push(`✏️ Name emoji: ${cosmetic.nameEmoji}`);
        if (boosts?.xpMultiplier && boosts.xpMultiplier !== 1) effectLines.push(`⚡ XP ×${boosts.xpMultiplier}`);
        if (boosts?.goldMultiplier && boosts.goldMultiplier !== 1) effectLines.push(`💰 Gold ×${boosts.goldMultiplier}`);
    }
    if (effectLines.length > 0) {
        container.addSeparatorComponents(s => s)
            .addTextDisplayComponents(t => t.setContent(`**Active Effects**\n${effectLines.join("\n")}`));
    }

    if (config.combat?.enabled) {
        const stats = calculateStats(profile, config, shopItems);
        container.addSeparatorComponents(s => s)
            .addTextDisplayComponents(t => t.setContent(`**Combat Stats**\n${formatStats(stats, resolveCurrentHp(profile, stats))}`));
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`inventory:page:${ownerId}:${page}`)
            .setLabel("Back to Inventory")
            .setEmoji("🎒")
            .setStyle(ButtonStyle.Secondary),
    );

    return [container, row];
}

// ─── Buttons ──────────────────────────────────────────────────────────────────

export async function handleInventoryButton(interaction: ButtonInteraction) {
    // inventory:{page|gear}:{ownerId}:{page}
    // inventory:{use|equip|unequip}:{ownerId}:{page}:{itemId|slot}
    const [, action, ownerId, pageStr, ...rest] = interaction.customId.split(":");
    const target = rest.join(":");

    // Menus from before this layout carried a profile id here, not a Discord id.
    if (!interaction.guildId || !ownerId || !/^\d{17,20}$/.test(ownerId)) {
        await interaction.reply({ content: "This menu has expired. Run /inventory again.", flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferUpdate();

    const canAct = ownerId === interaction.user.id;
    let status: string | undefined;

    if (action === "use" || action === "equip" || action === "unequip") {
        if (!canAct) return;
        const res = action === "use" ? await useItemFromInventory(interaction, target, 1)
            : action === "equip" ? await equipItemFromInventory(interaction, target)
            : await equipItemFromInventory(interaction, "", target as EquipSlot);
        status = `${res.success ? "✅" : "❌"} ${res.message}`;
    }

    const owner = canAct ? interaction.user : await interaction.client.users.fetch(ownerId);
    const { user: dbUser } = await getOrCreateDbUser({ discordUserId: ownerId });
    const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    const { profile } = await getOrCreateProfile({ userId: dbUser.id, guildId: dbGuild.id });

    const view: View = { ownerId, ownerName: owner.username, canAct, profile, config, page: Number(pageStr), status };
    const showGear = action === "gear" || action === "unequip";

    await interaction.editReply({
        components: showGear ? renderGear(view) : renderInventory(view),
        flags: MessageFlags.IsComponentsV2,
    });
}
