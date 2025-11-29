import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from "discord.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { calculateLevelFromXp } from "../../leveling/levels.js";
import { logAndBroadcastEvent, type EventType } from "../../db/events.js";
import { query } from "../../db/index.js";

export const data = new SlashCommandBuilder()
    .setName("set")
    .setDescription("Configure XP settings for this server")
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

    const { user: dbUser } = await getOrCreateDbUser({
        discordUserId: interaction.user.id,
        username: interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL(),
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

            await interaction.reply({ content: `✅ Set XP of <@${dbUser.discord_user_id}> to **${amount}** (level **${newLevel}**).`, flags: MessageFlags.Ephemeral });
            break;
        }

        case "level": {
            const level = interaction.options.getInteger("level", true);

            const xp = (() => {
                let totalXp = 0;
                for (let lvl = 1; lvl <= level; lvl++) {
                    totalXp = calculateLevelFromXp(totalXp, config);
                }
                return totalXp;
            })();

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

            await interaction.reply({ content: `✅ Set streak count of <@${dbUser.discord_user_id}> to **${count}**.`, flags: MessageFlags.Ephemeral });
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
        }

        await logAndBroadcastEvent(interaction, {
                guildId: dbGuild.id,
                userId: admin.id,
                targetUserId: dbUser.id,
                category: "admin",
                eventType: eventType!,
                source: "setAdmin",
                metaData: { actorDiscordId: interaction.user.id, targetDiscordId: dbUser.discord_user_id, subcommand },
                timestamp: new Date(), 
            }, config);
    }
}

    