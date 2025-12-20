import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder, type ColorResolvable } from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateProfile } from "../../cache/profileService.js";
import { getInventory } from "../../player/inventory.js";

export const data = new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("View your inventory");

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

    const inventory = await getInventory(profile.user_id, profile.guild_id);
    const goldIcon = config.style.gold.icon || "💰";
    const themeColor = (config.style.mainThemeColor || "#00AE86") as ColorResolvable;

    const items = Object.entries(inventory || {}).filter(([_, item]) => !!item);

    if (items.length === 0) {
        const emptyEmbed = new EmbedBuilder()
            .setTitle(`${interaction.user.username}'s Inventory`)
            .setColor(themeColor)
            .setDescription("Your inventory is empty.")
            .setFooter({ text: `Gold: ${profile.gold || 0} ${goldIcon}` });

        await interaction.editReply({ embeds: [emptyEmbed] });
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle(`${interaction.user.username}'s Inventory`)
        .setColor(themeColor)
        .setDescription(
            `You currently have **${profile.gold || 0} ${goldIcon}**.\n` +
            `Use \`/use <itemId>\` to activate certain items.`
        );

    items.slice(0, 25).forEach(([itemId, item], index) => {
        const qty = item.quantity ?? 0;
        const emoji = item.emoji || "•";

        const rawDesc = item.description || "No description.";
        const desc = rawDesc.length > 150 ? rawDesc.slice(0, 147) + "..." : rawDesc;

        embed.addFields({
            name: `${index + 1}. ${emoji} ${item.name} \`[${itemId}]\` x${qty}`,
            value: desc,
        });
    });

    await interaction.editReply({ embeds: [embed] });
}