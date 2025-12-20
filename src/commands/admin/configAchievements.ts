import type { ChatInputCommandInteraction, ColorResolvable } from "discord.js";
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } from "discord.js";
import { setGuildConfig } from "../../db/guilds.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";   

export const data = new SlashCommandBuilder()
    .setName("config-achievements")
    .setDescription("Configure Achievement settings for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(sub =>
        sub.setName("enable-achievements")
        .setDescription("Enable achievements system in this server")
        .addBooleanOption(opt =>
            opt.setName("enabled")
            .setDescription("Enable or disable achievements")
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
        sub.setName("set-progress-tracking")
        .setDescription("Enable or disable progress tracking for achievements")
        .addBooleanOption(opt =>
            opt.setName("enabled")
            .setDescription("Enable or disable progress tracking")
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
        sub.setName("list-achievements")
        .setDescription("List all configured achievements")
    )

    .addSubcommand(sub =>
        sub.setName("add-achievement")
        .setDescription("Add a new achievement")
        .addStringOption(opt =>
            opt.setName("id")
            .setDescription("String ID (must be unique)")
            .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName("name")
            .setDescription("Name of the achievement")
            .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName("description")
            .setDescription("Description of the achievement")
            .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName("category")
            .setDescription("Category of the achievement")
            .setRequired(true)
            .addChoices(
                { name: "xp", value: "xp" },
                { name: "social", value: "social" },
                { name: "daily", value: "daily" },
                { name: "economy", value: "economy" },
                { name: "vc", value: "vc" },
                { name: "misc", value: "misc" },
            )
        )
        .addStringOption(opt =>
            opt.setName("condition")
            .setDescription("Condition JSON (see /config-achievements help)")
            .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName("reward")
            .setDescription("Reward JSON (optional, see help)")
            .setRequired(false)
        )
        .addBooleanOption(opt =>
            opt.setName("secret")
            .setDescription("Hide this achievement until unlocked")
            .setRequired(false)
        )
    )

    .addSubcommand(sub =>
        sub.setName("edit-achievement")
        .setDescription("Edit an existing achievement")
        .addStringOption(opt =>
            opt.setName("id")
            .setDescription("ID of the achievement to edit")
            .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName("field")
            .setDescription("Field of the achievement to edit (name, description, category, condition, reward, secret)")
            .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName("value")
            .setDescription("New value for the field")
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
        sub.setName("remove-achievement")
        .setDescription("Remove an achievement by ID")
        .addStringOption(opt =>
            opt.setName("id")
            .setDescription("ID of the achievement to remove")
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
        sub.setName("help")
        .setDescription("Show examples for condition/reward JSON")
    );


export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
   if (!interaction.guildId || !interaction.inGuild()) {
        await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
        return;
    }

    if ( !interaction.memberPermissions || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: "You need the Manage Server permission to use this command.", ephemeral: true });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const sub = interaction.options.getSubcommand();
    
    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId! });

    let newConfig = structuredClone(config);

    switch (sub) {
        case "help": {
            const themeColor: string = config.style.mainThemeColor || "#0099ff";
            const embed = new EmbedBuilder()
                .setTitle("📘 Achievement Config Help")
                .setColor(themeColor as ColorResolvable)
                .setDescription(
                "Use `/config-achievements add-achievement` and paste JSON into the `condition` and `reward` fields.\n" +
                "Below are common examples."
                )
                .addFields(
                {
                    name: "Condition: stat-based (messages sent)",
                    value:
                    "Tracks a stat from `user_stats`.\n" +
                    "**Example:** unlock after 100 messages sent\n" +
                    "```json\n" +
                    '{ "type": "stat", "statKey": "messagesSent", "operator": ">=", "value": 100 }\n' +
                    "```",
                },
                {
                    name: "Condition: level-based",
                    value:
                    "Unlock when a user reaches a certain level.\n" +
                    "**Example:** reach level 10\n" +
                    "```json\n" +
                    '{ "type": "level", "operator": ">=", "value": 10 }\n' +
                    "```",
                },
                {
                    name: "Condition: streak-based",
                    value:
                    "Unlock when a user hits a daily streak.\n" +
                    "**Example:** 7-day streak\n" +
                    "```json\n" +
                    '{ "type": "streak", "operator": ">=", "value": 7 }\n' +
                    "```",
                },
                {
                    name: "Reward JSON (optional)",
                    value:
                    "You can give XP, gold, an item, or a role when an achievement is unlocked.\n" +
                    "**XP + Gold reward:**\n" +
                    "```json\n" +
                    '{ "xp": 100, "gold": 50 }\n' +
                    "```\n" +
                    "**Item reward:**\n" +
                    "```json\n" +
                    '{ "itemId": "potion_small" }\n' +
                    "```\n" +
                    "**Role reward:**\n" +
                    "```json\n" +
                    '{ "roleId": "123456789012345678" }\n' +
                    "```",
                },
                {
                    name: "Full example command",
                    value:
                    "```text\n" +
                    "/config-achievements add-achievement \n" +
                    "  id: first_message\n" +
                    "  name: First Words\n" +
                    "  description: Send your first message.\n" +
                    "  category: social\n" +
                    "  condition: {\"type\":\"stat\",\"statKey\":\"messagesSent\",\"operator\":\">=\",\"value\":1}\n" +
                    "  reward: {\"xp\":10}\n" +
                    "```",
                }
                );

            await interaction.editReply({ embeds: [embed] });
            break;
        }

        case "enable-achievements": {
            const enabled = interaction.options.getBoolean("enabled", true);
            newConfig.achievements.enabled = enabled;
            await setGuildConfig(interaction.guildId, newConfig);

            await interaction.editReply({ content: `✅ Achievements have been ${enabled ? "enabled" : "disabled"}.` });
            break;
        }

        case "set-progress-tracking": {
            const enabled = interaction.options.getBoolean("enabled", true);
            newConfig.achievements.progress = enabled;
            await setGuildConfig(interaction.guildId, newConfig);

            await interaction.editReply({ content: `✅ Achievement progress tracking has been ${enabled ? "enabled" : "disabled"}.` });
            break;
        }

        case "list-achievements": {
            const achievements = config.achievements.achievements || [];
            if (Object.keys(achievements).length === 0) {
                await interaction.editReply({ content: "No achievements have been configured yet." });
                return;
            }

            const themeColor: string = config.style.mainThemeColor || "#0099ff";
            const embed = new EmbedBuilder()
                .setTitle("🏆 Configured Achievements")
                .setColor(themeColor as ColorResolvable);

            for (const [id, ach] of Object.entries(achievements)) {
                embed.addFields({
                    name: `${ach.secret ? "🔒 " : ""}${ach.name} (ID: ${id})`,
                    value: `${ach.description}\nCategory: ${ach.category}`,
                });
            }

            await interaction.editReply({ embeds: [embed] });
            break;
        }

        case "add-achievement": {
            const id = interaction.options.getString("id", true);
            const name = interaction.options.getString("name", true);
            const description = interaction.options.getString("description", true);
            const category = interaction.options.getString("category", true);
            const conditionStr = interaction.options.getString("condition", true);
            const rewardStr = interaction.options.getString("reward", false);
            const secret = interaction.options.getBoolean("secret", false) || false;

            if (newConfig.achievements.achievements[id]) {
                await interaction.editReply({ content: `❌ An achievement with ID \`${id}\` already exists.` });
                return;
            }

            let conditions;
            let reward;
            try {
                conditions = JSON.parse(conditionStr);
            } catch (e) {
                await interaction.editReply({ content: `❌ Invalid JSON for condition.` });
                return;
            }

            if (rewardStr) {
                try {
                    reward = JSON.parse(rewardStr);
                } catch (e) {
                    await interaction.editReply({ content: `❌ Invalid JSON for reward.` });
                    return;
                }
            }

            if (category != "xp" && category != "social" && category != "daily" && category != "economy" && category != "vc" && category != "misc") {
                await interaction.editReply({ content: `❌ Invalid category. Must be one of: xp, social, daily, economy, vc, misc.` });
                return;
            }

            newConfig.achievements.achievements[id] = {
                id,
                name,
                description,
                category,
                conditions,
                reward: reward || null,
                secret,
            };

            await setGuildConfig(interaction.guildId, newConfig);

            await interaction.editReply({ content: `✅ Achievement \`${name}\` (ID: \`${id}\`) has been added.` });
            break;
        }

        case "edit-achievement": {
            const id = interaction.options.getString("id", true);
            const field = interaction.options.getString("field", true);
            const value = interaction.options.getString("value", true);

            const achievement = newConfig.achievements.achievements[id];
            if (!achievement) {
                await interaction.editReply({ content: `❌ No achievement found with ID \`${id}\`.` });
                return;
            }

            if (field === "conditions" || field === "reward") {
                try {
                    achievement[field] = JSON.parse(value);
                } catch (e) {
                    await interaction.editReply({ content: `❌ Invalid JSON for ${field}.` });
                    return;
                }
            } else if (field === "secret") {
                achievement.secret = value.toLowerCase() === "true";
            } else if (field === "category") {
                if (value != "xp" && value != "social" && value != "daily" && value != "economy" && value != "vc" && value != "misc") {
                    await interaction.editReply({ content: `❌ Invalid category. Must be one of: xp, social, daily, economy, vc, misc.` });
                    return;
                }
                achievement.category = value;
            } else if (field === "name" || field === "description") {
                achievement[field] = value;
            } else {
                await interaction.editReply({ content: `❌ Invalid field \`${field}\` to edit.` });
                return;
            }

            newConfig.achievements.achievements[id] = achievement;
            await setGuildConfig(interaction.guildId, newConfig);

            await interaction.editReply({ content: `✅ Achievement \`${id}\` has been updated.` });
            break;
        }

        case "remove-achievement": {
            const id = interaction.options.getString("id", true);

            if (!newConfig.achievements.achievements[id]) {
                await interaction.editReply({ content: `❌ No achievement found with ID \`${id}\`.` });
                return;
            }

            delete newConfig.achievements.achievements[id];
            await setGuildConfig(interaction.guildId, newConfig);

            await interaction.editReply({ content: `✅ Achievement with ID \`${id}\` has been removed.` });
            break;
        }

        default:
            await interaction.editReply({ content: "❌ Unknown subcommand." });
            break;  
    }
}
