import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder, type ColorResolvable } from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateProfile } from "../../cache/profileService.js";
import { getInventory } from "../../inventory/inventory.js";

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

    const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });

    const {profile} = await getOrCreateProfile({
        userId: dbUser.id,
        guildId: dbGuild.id,
    });

    const inventory = await getInventory(profile.user_id, profile.guild_id);

    if (Object.keys(inventory).length === 0) {
        await interaction.editReply("Your inventory is empty.");
        return;
    }

    const themeColor = config.style.mainThemeColor || 0x00AE86;

    const embed = new EmbedBuilder()
        .setTitle(`${interaction.user.username}'s Inventory`)
        .setColor(themeColor as ColorResolvable)
        .setDescription(
            Object.values(inventory).map((item, index) => {
                if (!item) return "";
                return `**${index + 1}. ${item.emoji || ""} ${item.name}** x${item.quantity} - ${item.description || "No description"}`;
            }).join("\n")
        );

    await interaction.editReply({ embeds: [embed] });

}