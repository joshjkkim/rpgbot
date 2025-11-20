import type { ChatInputCommandInteraction, ColorResolvable } from "discord.js";
import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { upsertUserGuildProfile } from "../../db/userGuildProfiles.js";
import { upsertUser } from "../../db/users.js";
import { getGuildConfig, upsertGuild } from "../../db/guilds.js";


export const data = new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your profile");

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply("This command can only be used in a server.");
        return;
    }

    await interaction.deferReply();

    const dbUser = await upsertUser({
        discordUserId: interaction.user.id,
        username: interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL(),
    });

    const { guild: dbGuild } = await getGuildConfig(interaction.guildId);

    const profile = await upsertUserGuildProfile({
        userId: dbUser.id,
        guildId: dbGuild.id,
    });

    const color = dbGuild.config.style.mainThemeColor || 0x00AE86;

    const embed = new EmbedBuilder()
        .setTitle(`${interaction.user.username}'s Profile`)
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
            { name: "Level", value: profile.level.toString(), inline: true },
            { name: "XP", value: profile.xp.toString(), inline: true },
            { name: "Gold", value: profile.gold.toString(), inline: true },
            { name: "Streak Count", value: profile.streak_count.toString(), inline: true },
        )
        .setColor(color as ColorResolvable);

    await interaction.editReply({ embeds: [embed] });

}
