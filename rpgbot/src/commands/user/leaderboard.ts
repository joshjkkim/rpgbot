import type { ChatInputCommandInteraction, ColorResolvable } from "discord.js";
import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { query } from "../../db/index.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";

export const data = new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the server leaderboard")
    .addStringOption(option =>
        option
        .setName("type")
        .setDescription("The type of leaderboard to view")
        .setRequired(false)
        .addChoices(
            { name: "Levels", value: "xp" },
            { name: "Currency", value: "gold" },
            { name: "Streaks", value: "streak_count" },
        ),
    );

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply("This command can only be used in a server.");
        return;
    }

    await interaction.deferReply();

    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });

    const leaderboardType = interaction.options.getString("type") ?? "xp";

    const prettyLabel: Record<string, string> = {
        xp: `Total ${config.style.xp.name || "XP"}`,
        gold: `Total ${config.style.gold.name || "Gold"}`,
        streak_count: "Streak",
    };

    const icon: Record<string, string> = {
        xp: config.style.xp.icon || "⭐",
        gold: config.style.gold.icon || "💰",
        streak_count: "🔥",
    };

    const typeLabel = prettyLabel[leaderboardType] ?? leaderboardType.toUpperCase();
    const typeIcon = icon[leaderboardType] ?? "⭐";

    const res = await query(
        `SELECT ugp.*, u.username, u.discord_user_id
        FROM user_guild_profiles ugp
        JOIN users u ON ugp.user_id = u.id
        WHERE ugp.guild_id = $1
        ORDER BY ugp.${leaderboardType} DESC
        LIMIT 10`,
        [guild.id],
    );

    if (res.rows.length === 0) {
        await interaction.editReply("No data yet for this server’s leaderboard.");
        return;
    }

    const lines = res.rows.map((row: any, index: number) => {
        const rank =
        index === 0 ? "🥇"
        : index === 1 ? "🥈"
        : index === 2 ? "🥉"
        : `#${index + 1}`;

        const value =
        leaderboardType === "xp"
            ? row.xp
            : leaderboardType === "gold"
            ? row.gold
            : row.streak_count;

        return `${rank} **<@${row.discord_user_id}>** — Lvl ${row.level} • ${typeIcon} \`${value}\``;
    });

    const me = res.rows.find((row: any) => row.discord_user_id === interaction.user.id);

    const themeColor = (config.style.mainThemeColor || "#00AE86") as ColorResolvable;

    console.log(guild)

    const embed = new EmbedBuilder()
        .setTitle(`${guild.name}'s ${typeLabel} Leaderboard`)
        .setDescription(lines.join("\n"))
        .setColor(themeColor)
        .setThumbnail(guild.icon_url ?? null);

    if (me) {
        const meValue =
        leaderboardType === "xp"
            ? me.xp
            : leaderboardType === "gold"
            ? me.gold
            : me.streak_count;

        embed.setFooter({
        text: `${interaction.user.username}'s ${typeLabel}: ${meValue} • Level ${me.level}`,
        });
    }

    await interaction.editReply({
        embeds: [embed],
        allowedMentions: { users: [] }, // keeps it from pinging if you ever swap to mentions
    });
}
