import type { ChatInputCommandInteraction, ColorResolvable } from "discord.js";
import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { upsertUserGuildProfile } from "../../db/userGuildProfiles.js";
import { upsertUser } from "../../db/users.js";
import { getGuildConfig } from "../../db/guilds.js";
import { calculateLevelFromXp, calculateTotalXpForLevel } from "../../leveling/levels.js";

function createProgressBar(current: number, max: number, length: number = 10): string {
    const progress = Math.min(current / max, 1);
    const filledBars = Math.floor(progress * length);
    const emptyBars = length - filledBars;
    
    const filled = '█'.repeat(filledBars);
    const empty = '░'.repeat(emptyBars);
    
    return `${filled}${empty}`;
}

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
    
    const currentLevelXp = calculateTotalXpForLevel(profile.level, dbGuild.config);
    const nextLevelXp = calculateTotalXpForLevel(profile.level + 1, dbGuild.config);
    const xpInCurrentLevel = Number(profile.xp) - currentLevelXp;
    const xpNeededForNext = nextLevelXp - currentLevelXp;
    const progressBar = createProgressBar(xpInCurrentLevel, xpNeededForNext, 15);
    const percentage = Math.floor((xpInCurrentLevel / xpNeededForNext) * 100);

    const embed = new EmbedBuilder()
        .setTitle(`✨ ${interaction.user.username}'s Profile`)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setDescription(`**Level ${profile.level}** • ${percentage}% to Level ${profile.level + 1}`)
        .addFields(
            { 
                name: "📊 Progress", 
                value: `\`${progressBar}\` ${xpInCurrentLevel}/${xpNeededForNext} XP`,
                inline: false 
            },
            { 
                name: "💰 Gold", 
                value: `\`${profile.gold.toLocaleString()}\``, 
                inline: true 
            },
            { 
                name: "⭐ Total XP", 
                value: `\`${profile.xp.toLocaleString()}\``, 
                inline: true 
            },
            { 
                name: "🔥 Streak", 
                value: `\`${profile.streak_count}\` days`, 
                inline: true 
            }
        )
        .setColor(color as ColorResolvable)
        .setFooter({ text: `Keep up the great work!` })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}
