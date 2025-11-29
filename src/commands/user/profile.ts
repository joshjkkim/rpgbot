import type { ChatInputCommandInteraction, ColorResolvable } from "discord.js";
import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateProfile } from "../../cache/profileService.js";
import { calculateTotalXpForLevel } from "../../leveling/levels.js";
import type { StreakReward } from "../../db/guilds.js";
import { refreshTempRolesForMember } from "../../player/roles.js";

function createProgressBar(current: number, max: number, length: number = 10): string {
    const progress = Math.min(current / max, 1);
    const filledBars = Math.floor(progress * length);
    const emptyBars = length - filledBars;
    
    const filled = '█'.repeat(filledBars);
    const empty = '░'.repeat(emptyBars);
    
    return `${filled}${empty}`;
}

function formatDuration(ms: number): string {
    if (ms <= 0) return "expired";

    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${totalSeconds}s`;
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

    const { user: dbUser } = await getOrCreateDbUser({
        discordUserId: interaction.user.id,
        username: interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL(),
    });

    const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });

    let { profile } = await getOrCreateProfile({
        userId: dbUser.id,
        guildId: dbGuild.id,
    });

    const member = await interaction.guild?.members.fetch(interaction.user.id);

    if (member) {
        profile = await refreshTempRolesForMember(member, profile);
    }

    const tempRolesMap = profile.temp_roles ?? {};
    const now = Date.now();

    const activeTempEntries = Object.entries(tempRolesMap).filter(([roleId]) =>
        member?.roles.cache.has(roleId)
    );

    const tempRoleLines: string[] = [];

    for (const [roleId, state] of activeTempEntries) {
        const role = member?.roles.cache.get(roleId);
        if (!role) continue;

        const remainingMs = new Date(state.expiresAt).getTime() - now;
        const remainingText = formatDuration(remainingMs);

        tempRoleLines.push(`${role} — expires in **${remainingText}**`);
    }

    const tempRoleIds = new Set(Object.keys(tempRolesMap));
    const permanentRoles = member?.roles.cache.filter(
        r => r.id !== interaction.guildId && !tempRoleIds.has(r.id)
    );

    const permanentRoleLines = permanentRoles?.map(r => r.toString()).slice(0, 15) || [];

    const color = config.style.mainThemeColor || 0x00AE86;
    
    const currentLevelXp = calculateTotalXpForLevel(profile.level, config);
    const nextLevelXp = calculateTotalXpForLevel(profile.level + 1, config);
    const xpInCurrentLevel = Number(profile.xp) - currentLevelXp;
    const xpNeededForNext = nextLevelXp - currentLevelXp;
    const progressBar = createProgressBar(xpInCurrentLevel, xpNeededForNext, 15);
    const percentage = Math.floor((xpInCurrentLevel / xpNeededForNext) * 100);

    const streakRewards = config.xp.streakRewards;

    const nextStreakReward = Object.entries(streakRewards)
        .map(([days, reward]) => ({ days: Number(days), reward: reward as StreakReward }))
        .find(reward => reward.days > profile.streak_count);

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
                name: `${config.style.gold.icon || "💰"} ${config.style.gold.name || "Gold"}`, 
                value: `\`${profile.gold.toLocaleString()}\``, 
                inline: true 
            },
            { 
                name: `${config.style.xp.icon || "⭐"} ${config.style.xp.name || "XP"}`, 
                value: `\`${profile.xp.toLocaleString()}\``, 
                inline: true 
            },
            { 
                name: "🔥 Streak", 
                value: `\`${profile.streak_count}\` days`, 
                inline: true 
            },
        );

        if (nextStreakReward) {
            embed.addFields({
                name: "🎁 Next Streak Reward",
                value: `Reach a ${nextStreakReward.days}-day streak to earn **${nextStreakReward.reward.xpBonus} ${config.style.xp.name || "XP"}** and **${nextStreakReward.reward?.goldBonus} ${config.style.gold.name || "Gold"}**!`,
                inline: false
            });
        }

        if (tempRoleLines.length > 0) {
            embed.addFields({
                name: "⏳ Temporary Roles",
                value: tempRoleLines.join("\n"),
                inline: false,
            });
        }

        if (permanentRoleLines.length > 0) {
            embed.addFields({
                name: "🏷️ Roles",
                value: permanentRoleLines.join(", "),
                inline: false,
            });
        } else {
            embed.addFields({
                name: "🏷️ Roles",
                value: "No visible roles.",
                inline: false,
            });
        }

        embed.setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() }
        )
        .setColor(color as ColorResolvable)
        .setFooter({ text: `Keep up the great work!` })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}
