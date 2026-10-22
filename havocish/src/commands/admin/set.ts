import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from "discord.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { calculateLevelFromXp, levelStartXp } from "../../leveling/levels.js";
import { logAndBroadcastEvent } from "../../db/events.js";
import type { EventType } from "../../types/logging.js";
import { query } from "../../db/index.js";
import { profileKey, userGuildProfileCache } from "../../cache/caches.js";
import { commitProfileChanges, getOrCreateProfile } from "../../cache/profileService.js";
import { combatLevel, combatXpForLevel } from "../../player/combatLevel.js";
import { skillLevel, skillXpForLevel } from "../../player/gathering.js";
import type { UserStats } from "../../types/userprofile.js";

export const data = new SlashCommandBuilder()
    .setName("set")
    .setDescription("Set a member's XP, level, gold or streak directly")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(sub =>
        sub.setName("xp")
            .setDescription("Set the XP of a user")
            .addUserOption(option =>
                option.setName("user")
                    .setDescription("The user to set XP for")
                    .setRequired(true)
            )
            .addIntegerOption(option =>
                option.setName("amount")
                    .setDescription("The amount of XP to set to")
                    .setRequired(true)
            )
    )

    .addSubcommand(sub =>
        sub.setName("level")
            .setDescription("Set the level of a user")
            .addUserOption(option =>
                option.setName("user")
                    .setDescription("The user to set level for")
                    .setRequired(true)
            )
            .addIntegerOption(option =>
                option.setName("level")
                    .setDescription("The level to set to")
                    .setRequired(true)
            )
    )

    .addSubcommand(sub =>
        sub.setName("gold")
            .setDescription("Set the gold of a user")
            .addUserOption(option =>
                option.setName("user")
                    .setDescription("The user to set gold for")
                    .setRequired(true)
            )
            .addIntegerOption(option =>
                option.setName("amount")
                    .setDescription("The amount of gold to set to")
                    .setRequired(true)
            )
    )

    .addSubcommand(sub =>
        sub.setName("streak")
            .setDescription("Set the streak count of a user")
            .addUserOption(option =>
                option.setName("user")
                    .setDescription("The user to set streak count for")
                    .setRequired(true)
            )
            .addIntegerOption(option =>
                option.setName("count")
                    .setDescription("The streak count to set to")
                    .setRequired(true)
            )
    )

    .addSubcommand(sub =>
        sub.setName("combat")
            .setDescription("Set a member's Combat level")
            .addUserOption(option => option.setName("user").setDescription("The member").setRequired(true))
            .addIntegerOption(option => option.setName("level").setDescription("The Combat level to set").setRequired(true).setMinValue(1))
    )

    .addSubcommand(sub =>
        sub.setName("skill")
            .setDescription("Set a member's gathering or crafting skill level")
            .addUserOption(option => option.setName("user").setDescription("The member").setRequired(true))
            .addStringOption(option => option.setName("skill").setDescription("Which skill").setRequired(true).setAutocomplete(true))
            .addIntegerOption(option => option.setName("level").setDescription("The skill level to set").setRequired(true).setMinValue(1))
    );

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply("This command can only be used in a server.");
        return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: "You do not have permission to use this command.", flags: MessageFlags.Ephemeral });
        return;
    }

    const subcommand = interaction.options.getSubcommand();

    // The member being changed, not the admin running the command.
    const target = interaction.options.getUser("user", true);
    const { user: dbUser } = await getOrCreateDbUser({
        discordUserId: target.id,
        username: target.username,
        avatarUrl: target.displayAvatarURL(),
    });

    const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId! });

    switch (subcommand) {
        case "xp": {
            const amount = interaction.options.getInteger("amount", true);

            const newLevel = calculateLevelFromXp(amount, config);

            const res = await query(
                `
                UPDATE user_guild_profiles
                SET xp = $1, level = $2
                WHERE user_id = $3 AND guild_id = $4
                `,
                [amount, newLevel, dbUser.id, dbGuild.id]
            );

            if (res.rowCount === 0) {
                await interaction.reply({ content: "Failed to set XP.", flags: MessageFlags.Ephemeral });
                return;
            }

            userGuildProfileCache.delete(profileKey(dbGuild.id, dbUser.id));

            await interaction.reply({ content: `✅ Set XP of <@${dbUser.discord_user_id}> to **${amount}** (level **${newLevel}**).`, flags: MessageFlags.Ephemeral });
            break;
        }

        case "level": {
            const level = interaction.options.getInteger("level", true);

            // The XP at which that level begins. This used to loop calculateLevelFromXp
            // over 0, which always returned 0, so every /set level wrote 0 XP.
            const xp = levelStartXp(level, config);

            const res = await query(
                `
                UPDATE user_guild_profiles
                SET level = $1, xp = $2
                WHERE user_id = $3 AND guild_id = $4
                `,
                [level, xp, dbUser.id, dbGuild.id]
            );

            if (res.rowCount === 0) {
                await interaction.reply({ content: "Failed to set level.", flags: MessageFlags.Ephemeral });
                return;
            }

            userGuildProfileCache.delete(profileKey(dbGuild.id, dbUser.id));

            await interaction.reply({ content: `✅ Set level of <@${dbUser.discord_user_id}> to **${level}** (XP **${xp}**).`, flags: MessageFlags.Ephemeral });
            break;
        }

        case "gold": {
            const amount = interaction.options.getInteger("amount", true);

            const res = await query(
                `
                UPDATE user_guild_profiles
                SET gold = $1
                WHERE user_id = $2 AND guild_id = $3
                `,
                [amount, dbUser.id, dbGuild.id]
            );
            
            if (res.rowCount === 0) {
                await interaction.reply({ content: "Failed to set gold.", flags: MessageFlags.Ephemeral });
                return;
            }

            userGuildProfileCache.delete(profileKey(dbGuild.id, dbUser.id));

            await interaction.reply({ content: `✅ Set gold of <@${dbUser.discord_user_id}> to **${amount}**.`, flags: MessageFlags.Ephemeral });
            break;
        }

        case "streak": {
            const count = interaction.options.getInteger("count", true);

            const res = await query(
                `
                UPDATE user_guild_profiles
                SET streak_count = $1
                WHERE user_id = $2 AND guild_id = $3
                `,
                [count, dbUser.id, dbGuild.id]
            );

            if (res.rowCount === 0) {
                await interaction.reply({ content: "Failed to set streak count.", flags: MessageFlags.Ephemeral });
                return;
            }

            userGuildProfileCache.delete(profileKey(dbGuild.id, dbUser.id));

            await interaction.reply({ content: `✅ Set streak count of <@${dbUser.discord_user_id}> to **${count}**.`, flags: MessageFlags.Ephemeral });
            break;
        }

        case "combat":
        case "skill": {
            const level = interaction.options.getInteger("level", true);
            const skillId = subcommand === "skill" ? interaction.options.getString("skill", true) : null;
            const activity = skillId ? config.gathering?.activities?.[skillId] : undefined;
            const station = skillId ? config.crafting?.stations?.[skillId] : undefined;
            if (skillId && !activity && !station) {
                await interaction.reply({ content: `No skill \`${skillId}\` on this server.`, flags: MessageFlags.Ephemeral });
                return;
            }

            const { profile } = await getOrCreateProfile({ userId: dbUser.id, guildId: dbGuild.id });
            const stats = { ...(profile.user_stats ?? {}) } as UserStats;
            let label: string;
            let xp: number;
            if (!skillId) {
                xp = combatXpForLevel(level, config);
                stats.combat = { xp };
                label = "Combat";
            } else {
                xp = skillXpForLevel(level, config);
                if (activity) stats.gathering = { ...stats.gathering, [activity.id]: { runs: 0, ...stats.gathering?.[activity.id], xp } };
                else stats.crafting = { ...stats.crafting, [station!.id]: { crafts: 0, ...stats.crafting?.[station!.id], xp } };
                label = activity ? activity.skillName || activity.name : station!.skillName || station!.name;
            }
            profile.user_stats = stats;
            commitProfileChanges({
                userId: dbUser.id, guildId: dbGuild.id, profile,
                changes: { user_stats: stats }, baseline: { xp: profile.xp, gold: profile.gold },
            });

            const reached = skillId ? skillLevel(xp, config) : combatLevel(profile, config);
            await interaction.reply({
                content: `✅ Set ${label} of <@${dbUser.discord_user_id}> to level **${reached}**${reached < level ? " (the most it goes)" : ""}.`,
                flags: MessageFlags.Ephemeral,
            });
            break;
        }

        default:
            await interaction.reply({ content: "Unknown subcommand.", flags: MessageFlags.Ephemeral });
    }
    
    if(config.logging.enabled) {
        const { user: admin } = await getOrCreateDbUser({
            discordUserId: interaction.user.id,
            username: interaction.user.username,
            avatarUrl: interaction.user.displayAvatarURL(),
        });

        let eventType: EventType;
        switch(subcommand) {
            case "xp":
                eventType = "setxp";
                break;
            case "level":
                eventType = "setlevel";
                break;
            case "gold":
                eventType = "setgold";
                break;
            case "streak":
                eventType = "setstreak";
                break;
            default:
                eventType = "setlevel";
        }

        await logAndBroadcastEvent(interaction, {
                guildId: dbGuild.id,
                userId: admin.id,
                discordGuildId: dbGuild.discord_guild_id,
                targetUserId: dbUser.id,
                category: "admin",
                eventType: eventType!,
                source: "setAdmin",
                metaData: { actorDiscordId: interaction.user.id, targetDiscordId: dbUser.discord_user_id, subcommand },
                timestamp: new Date(), 
            }, config);
    }
}

    