import type { ChatInputCommandInteraction, ColorResolvable } from "discord.js";
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } from "discord.js";
import { setGuildConfig } from "../../db/guilds.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";   

export const data = new SlashCommandBuilder()
    .setName("config-quests")
    .setDescription("Configure Quest settings for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(sub =>
        sub.setName("enable-quests")
        .setDescription("Enable quests system in this server")
        .addBooleanOption(opt =>
            opt.setName("enabled")
            .setDescription("Enable or disable quests")
            .setRequired(true)
        )
    )

    // .addSubcommand(sub =>
    //     sub.setName("set-progress-tracking")
    //     .setDescription("Enable or disable progress tracking for achievements")
    //     .addBooleanOption(opt =>
    //         opt.setName("enabled")
    //         .setDescription("Enable or disable progress tracking")
    //         .setRequired(true)
    //     )
    // )

    .addSubcommand(sub =>
        sub.setName("list-quests")
        .setDescription("List all configured quests")
    )

    .addSubcommand(sub =>
        sub.setName("add-quest")
        .setDescription("Add a new quest")
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
            .setDescription("Description of the quest")
            .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName("condition")
            .setDescription("Condition JSON (see /config-quests help)")
            .setRequired(true)
        )
        .addIntegerOption(opt =>
            opt.setName("cooldown")
            .setDescription("Cooldown before user can do quest again (seconds)")
            .setRequired(true)
        )
        .addBooleanOption(opt =>
            opt.setName("active")
            .setDescription("If the quest is active")
            .setRequired(false)
        )
    )

    .addSubcommand(opt=>
        opt.setName("add-reward")
        .setDescription("Add a reward to a quest")
        .addStringOption(opt =>
            opt.setName("id")
            .setDescription("ID of the quest to add reward to")
            .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName("reward")
            .setDescription("Reward JSON (see /config-quests help)")
            .setRequired(true)
        )
    )

    .addSubcommand(opt=>
        opt.setName("remove-reward")
        .setDescription("Remove a reward from a quest")
        .addStringOption(opt =>
            opt.setName("id")
            .setDescription("ID of the quest to remove reward from")
            .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName("reward-id")
            .setDescription("Reward ID (see /config-quests list-rewards)")
            .setRequired(true)
        )
    )

    .addSubcommand(opt =>
        opt.setName("list-rewards")
        .setDescription("List all rewards for a quest")
        .addStringOption(opt =>
            opt.setName("id")
            .setDescription("ID of the quest to list rewards for")
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
        sub.setName("edit-quest")
        .setDescription("Edit an existing quest")
        .addStringOption(opt =>
            opt.setName("id")
            .setDescription("ID of the quest to edit")
            .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName("field")
            .setDescription("Field of the quest to edit (name, description, active, condition, reward, cooldown)")
            .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName("value")
            .setDescription("New value for the field")
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
        sub.setName("remove-quest")
        .setDescription("Remove a quest by ID")
        .addStringOption(opt =>
            opt.setName("id")
            .setDescription("ID of the quest to remove")
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
        sub.setName("toggle-dm")
        .setDescription("Toggle DM notifications for quest completions")
        .addBooleanOption(opt =>
            opt.setName("enabled")
            .setDescription("Enable or disable DM notifications")
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
        sub.setName("toggle-reply")
        .setDescription("Toggle reply notifications for quest completions")
        .addBooleanOption(opt =>
            opt.setName("enabled")
            .setDescription("Enable or disable reply notifications")
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
            .setTitle("📘 Quest Config Help")
            .setColor(themeColor as ColorResolvable)
            .setDescription(
                "Use `/config-quests add-quest` and paste JSON into the `condition` and `reward` fields.\n" +
                "Below are common examples."
            )
            .addFields(
                {
                name: "Condition: messages",
                value:
                    "Track messages sent (optionally in specific channels).\n" +
                    "**Example:** 100 messages in any channel\n" +
                    "```json\n" +
                    '{ "type": "messages", "target": 100 }\n' +
                    "```\n" +
                    "**Example:** 25 messages in specific channels\n" +
                    "```json\n" +
                    '{ "type": "messages", "target": 25, "channelIds": ["123", "456"] }\n' +
                    "```",
                },
                {
                name: "Condition: vcMinutes",
                value:
                    "Track minutes spent in voice (optionally in specific channels).\n" +
                    "**Example:** 120 minutes total\n" +
                    "```json\n" +
                    '{ "type": "vcMinutes", "target": 120 }\n' +
                    "```\n" +
                    "**Example:** 60 minutes in specific channels\n" +
                    "```json\n" +
                    '{ "type": "vcMinutes", "target": 60, "channelIds": ["123", "456"] }\n' +
                    "```",
                },
                {
                name: "Condition: spendGold",
                value:
                    "Track gold spent.\n" +
                    "**Example:** spend 500 gold\n" +
                    "```json\n" +
                    '{ "type": "spendGold", "target": 500 }\n' +
                    "```",
                },
                {
                name: "Condition: earnXp",
                value:
                    "Track XP earned.\n" +
                    "**Example:** earn 1000 XP\n" +
                    "```json\n" +
                    '{ "type": "earnXp", "target": 1000 }\n' +
                    "```",
                },
                {
                name: "Condition: dailyClaim",
                value:
                    "Track daily claims.\n" +
                    "**Example:** claim daily 7 times\n" +
                    "```json\n" +
                    '{ "type": "dailyClaim", "target": 7 }\n' +
                    "```",
                },
                {
                name: "Reward JSON (optional)",
                value:
                    "You can give XP, gold, an item, or a role when a quest is completed.\n" +
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
                    "/config-quests add-quest \n" +
                    "  id: chatter\n" +
                    "  name: Chatterbox\n" +
                    "  description: Send 50 messages.\n" +
                    "  condition: {\"type\":\"messages\",\"target\":50}\n" +
                    "  reward: {\"xp\":25}\n" +
                    "```",
                }
            );

            await interaction.editReply({ embeds: [embed] });
            break;
        }

        case "enable-quests": {
            const enabled = interaction.options.getBoolean("enabled", true);
            newConfig.quests.enabled = enabled;
            await setGuildConfig(interaction.guildId, newConfig);

            await interaction.editReply({ content: `✅ Quests have been ${enabled ? "enabled" : "disabled"}.` });
            break;
        }

        // case "set-progress-tracking": {
        //     const enabled = interaction.options.getBoolean("enabled", true);
        //     newConfig.quests.progress = enabled;
        //     await setGuildConfig(interaction.guildId, newConfig);

        //     await interaction.editReply({ content: `✅ Achievement progress tracking has been ${enabled ? "enabled" : "disabled"}.` });
        //     break;
        // }

        case "list-quests": {
            const quests = config.quests.quests || [];
            if (Object.keys(quests).length === 0) {
                await interaction.editReply({ content: "No quests have been configured yet." });
                return;
            }

            const themeColor: string = config.style.mainThemeColor || "#0099ff";
            const embed = new EmbedBuilder()
                .setTitle("🏆 Configured Quests")
                .setColor(themeColor as ColorResolvable);

            for (const [id, quest] of Object.entries(quests)) {
                embed.addFields({
                    name: `${quest.name} (ID: ${id})`,
                    value: `${quest.description}`,
                });
            }

            await interaction.editReply({ embeds: [embed] });
            break;
        }

        case "add-quest": {
            const id = interaction.options.getString("id", true);
            const name = interaction.options.getString("name", true);
            const description = interaction.options.getString("description", true);
            const conditionStr = interaction.options.getString("condition", true);
            const cooldown = interaction.options.getInteger("cooldown", false) || 0;
            const active = interaction.options.getBoolean("active", false) || false;

            if (newConfig.quests.quests[id]) {
                await interaction.editReply({ content: `❌ A quest with ID \`${id}\` already exists.` });
                return;
            }

            let conditions;
            try {
                conditions = JSON.parse(conditionStr);
            } catch (e) {
                await interaction.editReply({ content: `❌ Invalid JSON for condition.` });
                return;
            }


            newConfig.quests.quests[id] = {
                id,
                name,
                description,
                cooldown,
                active,
                conditions,
                reward: {},
            };

            await setGuildConfig(interaction.guildId, newConfig);

            await interaction.editReply({ content: `✅ Quest \`${name}\` (ID: \`${id}\`) has been added.` });
            break;
        }

        case "list-rewards": {
            const id = interaction.options.getString("id", true);
            const quest = newConfig.quests.quests[id];
            if (!quest) {
                await interaction.editReply({ content: `❌ No quest found with ID \`${id}\`.` });
                return;
            }

            const rewards = quest.reward || {};
            if (Object.keys(rewards).length === 0) {
                await interaction.editReply({ content: `❌ No rewards found for quest ID \`${id}\`.` });
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle(`🎁 Rewards for Quest: ${quest.name} (ID: ${id})`)
                .setColor("#FFD700");

            for (const [tier, reward] of Object.entries(rewards)) {
                embed.addFields({
                    name: `Tier ${tier}`,
                    value: Object.entries(reward).map(([key, value]) => `${key}: ${value}`).join("\n"),
                });
            }

            await interaction.editReply({ embeds: [embed] });
            break;
        }

        case "add-reward": {
            const id = interaction.options.getString("id", true);
            const rewardStr = interaction.options.getString("reward", true);

            const quest = newConfig.quests.quests[id];
            if (!quest) {
                await interaction.editReply({ content: `❌ No quest found with ID \`${id}\`.` });
                return;
            }

            let reward;
            try {
                reward = JSON.parse(rewardStr);
            } catch (e) {
                await interaction.editReply({ content: `❌ Invalid JSON for reward.` });
                return;
            }

            const rewardIndex = Object.keys(quest.reward || {}).length;
            quest.reward = quest.reward || {};
            quest.reward[rewardIndex] = reward;

            await setGuildConfig(interaction.guildId, newConfig);

            await interaction.editReply({ content: `✅ Reward for quest ID \`${id}\` at tier \`${rewardIndex}\` has been added.` });
            break;
        }

        case "remove-reward": {
            const id = interaction.options.getString("id", true);
            const index = interaction.options.getInteger("index", true);

            const quest = newConfig.quests.quests[id];

            if(!quest) {
                await interaction.editReply({ content: `❌ No quest found with ID \`${id}\`.` });
                return;
            }

            if (!quest.reward || !quest.reward[index]) {
                await interaction.editReply({ content: `❌ Invalid reward index \`${index}\` for quest ID \`${id}\`.` });
                return;
            }

            delete quest.reward[index];
            await setGuildConfig(interaction.guildId, newConfig);

            await interaction.editReply({ content: `✅ Reward at index \`${index}\` for quest ID \`${id}\` has been removed.` });
            break;
        }

        case "edit-quest": {
            const id = interaction.options.getString("id", true);
            const field = interaction.options.getString("field", true);
            const value = interaction.options.getString("value", true);

            const quest = newConfig.quests.quests[id];
            if (!quest) {
                await interaction.editReply({ content: `❌ No quest found with ID \`${id}\`.` });
                return;
            }

            if (field === "conditions" || field === "reward") {
                try {
                    quest[field] = JSON.parse(value);
                } catch (e) {
                    await interaction.editReply({ content: `❌ Invalid JSON for ${field}.` });
                    return;
                }
            } else if (field === "active") {
                quest.active = value.toLowerCase() === "true";
            } else if (field === "cooldown") {
                const cooldownValue = parseInt(value, 10);
                if (isNaN(cooldownValue)) {
                    await interaction.editReply({ content: `❌ Invalid value for cooldown. Must be a number.` });
                    return;
                }
                quest.cooldown = cooldownValue;
            } else if (field === "name" || field === "description") {
                quest[field] = value;
            } else {
                await interaction.editReply({ content: `❌ Invalid field \`${field}\` to edit.` });
                return;
            }

            newConfig.quests.quests[id] = quest;
            await setGuildConfig(interaction.guildId, newConfig);

            await interaction.editReply({ content: `✅ Quest \`${id}\` has been updated.` });
            break;
        }

        case "remove-quest": {
            const id = interaction.options.getString("id", true);

            if (!newConfig.quests.quests[id]) {
                await interaction.editReply({ content: `❌ No quest found with ID \`${id}\`.` });
                return;
            }

            delete newConfig.quests.quests[id];
            await setGuildConfig(interaction.guildId, newConfig);

            await interaction.editReply({ content: `✅ Quest with ID \`${id}\` has been removed.` });
            break;
        }

        case "toggle-dm": {
            const enabled = interaction.options.getBoolean("enabled", true);
            newConfig.quests.dmUser = enabled;
            await setGuildConfig(interaction.guildId, newConfig);

            await interaction.editReply({ content: `✅ DM notifications for quest completions have been ${enabled ? "enabled" : "disabled"}.` });
            break;
        }

        case "toggle-reply": {
            const enabled = interaction.options.getBoolean("enabled", true);
            newConfig.quests.replyMessage = enabled;
            await setGuildConfig(interaction.guildId, newConfig);

            await interaction.editReply({ content: `✅ Reply notifications for quest completions have been ${enabled ? "enabled" : "disabled"}.` });
            break;
        }

        default:
            await interaction.editReply({ content: "❌ Unknown subcommand." });
            break;  
    }
}
