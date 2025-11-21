import type { ChatInputCommandInteraction, ColorResolvable } from "discord.js";
import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { query } from "../../db/index.js";
import { getGuildConfig } from "../../db/guilds.js";

export const data = new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the leaderboard")

    .addStringOption(option =>
        option.setName("type")
            .setDescription("The type of leaderboard to view")
            .setRequired(false)
            .addChoices(
                { name: "XP", value: "xp" },
                { name: "Gold", value: "gold" },
                { name: "Streaks", value: "streak_count" },
            )
    )

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply("This command can only be used in a server.");
        return;
    }

    await interaction.deferReply();

    const { guild, config } = await getGuildConfig(interaction.guildId);

    const leaderboardType = interaction.options.getString("type", true) ?? "xp";

    const themeColor = config.style.mainThemeColor || 0x00AE86;

    const res = await query(
        `SELECT ugp.*, u.username
         FROM user_guild_profiles ugp
         JOIN users u ON ugp.user_id = u.id
         WHERE ugp.guild_id = $1
         ORDER BY ugp.${leaderboardType} DESC
         LIMIT 10`,
        [guild.id]
    );


    const embed = new EmbedBuilder()
        .setTitle(`${guild.name}'s ${leaderboardType.toUpperCase()} Leaderboard`)
        .addFields(
            res.rows.map((row, index) => ({
                name: `#${index + 1} - ${row.username}`,
                value: `Level: ${row.level} \n${leaderboardType.toUpperCase()}: ${row[leaderboardType as "xp" | "gold"]}`,
                inline: false,
            }))
        )
        .setColor(themeColor as ColorResolvable);

    await interaction.editReply({ embeds: [embed], allowedMentions: { users: [] } });
}   