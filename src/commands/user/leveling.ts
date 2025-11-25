import type { ChatInputCommandInteraction, ColorResolvable } from "discord.js";
import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { getOrCreateProfile } from "../../cache/profileService.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { calculateTotalXpForLevel } from "../../leveling/levels.js";


export const data = new SlashCommandBuilder()
    .setName("levels")
    .setDescription("View info about levels and XP")

    .addSubcommand(sub =>
        sub
            .setName("info")
            .setDescription("View server info about levels and XP")
    )

    .addSubcommand(sub =>
        sub.setName("calculate")
            .setDescription("Calculate XP needed for a level")
            .addIntegerOption(option =>
                option.setName("level")
                    .setDescription("The level to calculate XP for")
                    .setRequired(true)
            )
    )

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply("This command can only be used in a server.");
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

    const subcommand = interaction.options.getSubcommand();

    await interaction.deferReply();

    switch (subcommand) {
        case "info": {
            const themeColor = config.style.mainThemeColor || 0x00AE86;

            const embed = new EmbedBuilder()
                .setTitle(`Level and XP Info for ${interaction.guild?.name ?? "this server"}`)
                .addFields(
                    { name: "Max Level", value: `${config.levels.maxLevel}`, inline: true },
                    { name: "Curve Type", value: `${config.levels.curveType}`, inline: true },
                    { name: "Curve Params", value: `\`${JSON.stringify(config.levels.curveParams)}\``, inline: false },
                )
                .setColor(themeColor as ColorResolvable);

            await interaction.editReply({ embeds: [embed] });
            break;
        }

        case "calculate": {
            const level = interaction.options.getInteger("level", true);

            const xpForLevel = calculateTotalXpForLevel(level, config);
            const currentXp = Number(profile.xp);

            const themeColor = config.style.mainThemeColor || 0x00AE86;

            const embed = new EmbedBuilder()
                .setTitle(`XP Calculation for Level ${level}`)
                .setColor(themeColor as ColorResolvable)
                .addFields(
                    { name: "XP Required", value: `${xpForLevel}`, inline: true },
                    { name: "Your Current XP", value: `${currentXp}`, inline: true },
                    { name: "Additional XP Needed", value: `${Math.max(0, xpForLevel - currentXp)}`, inline: true },
                );

            await interaction.editReply({ embeds: [embed] });
            break;
        }

        default:
            await interaction.editReply("Unknown subcommand.");
    }

}
