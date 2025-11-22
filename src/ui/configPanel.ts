import {
    type ChatInputCommandInteraction,
    type StringSelectMenuInteraction,
    type ButtonInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ModalSubmitInteraction
} from "discord.js";
import { getGuildConfig, setGuildConfig } from "../db/guilds.js";

const PANEL_SELECT_ID = "config-panel:main";

export async function sendConfigPanel(interaction: ChatInputCommandInteraction) {
    const { guild, config } = await getGuildConfig(interaction.guildId!);
    const themeColor = config.style.mainThemeColor || "#00AE86";

    const embed = new EmbedBuilder()
        .setTitle(`Config Panel for ${guild.name}`)
        .setDescription(
        [
            "Use the menu below to view different parts of the config.",
            "",
            `**XP (Text):**`,
            `• Base per message: \`${config.xp.basePerMessage}\``,
            `• Cooldown: \`${config.xp.xpMessageCooldown}s\``,
            `• Per-channel overrides: \`${Object.keys(config.xp.xpChannelIds).length}\` channels`,
            `• Role XP configs: \`${Object.keys(config.xp.roleXp).length}\` roles`,
            "",
            `**Daily Rewards:**`,
            `• Daily XP: \`${config.xp.dailyXp}\``,
            `• Daily Gold: \`${config.xp.dailyGold}\``,
            `• Auto Daily: \`${config.xp.autoDailyEnabled}\``,
            `• Reply to Daily In Channel: \`${config.xp.replyToDailyInChannel}\``,
            `• Reply to Daily Ephemeral: \`${config.xp.replyToDailyEphemeral}\``,
            `• Reply to Daily Message: \`${config.xp.replyToDailyMessage}\``,
            `• Announce Daily Channel Id: \`${config.xp.announceDailyInChannelId}\``,
            `• Announce Daily Message: \`${config.xp.announceDailyMessage}\``,
            "",
            `**Streak Settings:**`,
            `• Streak Multiplier: \`${config.xp.streakMultiplier}\``,
            `• Streak Rewards: \`${Object.keys(config.xp.streakRewards).length}\` milestones`,
            `• Streak Announce Channel Id: \`${config.xp.streakAnnounceChannelId}\``,
            `• Streak Announce Message: \`${config.xp.streakAnnounceMessage}\``,
            "",
            `**Voice XP:**`,
            `• Enabled: \`${config.xp.vc.enabled}\``,
            `• Base per minute: \`${config.xp.vc.basePerMinute}\``,
            `• Min minutes for XP: \`${config.xp.vc.minMinutesForXp}\``,
            `• Configured voice channels: \`${Object.keys(config.xp.vc.channelIds).length}\``,
            `• Role XP bonus configs: \`${Object.keys(config.xp.vc.roleXpBonus).length}\` roles`,
            "",
            `**Levels:**`,
            `• Curve: \`${config.levels.curveType}\``,
            `• Curve Params: \`${JSON.stringify(config.levels.curveParams)}\``,
            `• Max level: \`${config.levels.maxLevel ?? "No limit"}\``,
            `• XP overrides: \`${Object.keys(config.levels.xpOverrides).length}\` levels`,
            `• Level actions: \`${Object.keys(config.levels.levelActions).length}\` levels with actions`,
            `• Level-up announce channel Id: \`${config.levels.announceLevelUpInChannelId}\``,
            `• Level-up announce message: \`${config.levels.announceLevelUpMessage}\``,
            "",
            `**Styles:**`,
            `• Main theme color: \`${config.style.mainThemeColor}\``,
        ].join("\n")
        )
        .setColor(themeColor as any);

    const select = new StringSelectMenuBuilder()
        .setCustomId(PANEL_SELECT_ID)
        .setPlaceholder("Choose a config category…")
        .addOptions(
        { label: "XP (Text)", value: "xp", description: "Message XP settings" },
        { label: "Daily Rewards", value: "daily", description: "Daily reward settings" },
        { label: "Voice XP", value: "vc", description: "Voice channel XP settings" },
        { label: "Levels", value: "levels", description: "Level curve & actions" },
        { label: "Streaks", value: "streaks", description: "Daily streak behavior" },
        { label: "Styles", value: "styles", description: "Theme color & messages" },
        );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

    const buttonsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
        .setCustomId("config-panel:refresh")
        .setLabel("Refresh")
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({
        embeds: [embed],
        components: [row, buttonsRow],
    });
}

function chunkButtons(buttons: ButtonBuilder[], size = 5) {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += size) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...buttons.slice(i, i + size)
    );
    rows.push(row);
  }
  return rows;
}

export async function handleConfigPanelSelect(interaction: StringSelectMenuInteraction) {
    if (interaction.customId !== PANEL_SELECT_ID) return;

    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply({
        content: "This menu can only be used in a server.",
        flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const choice = interaction.values[0]; // "xp", "vc", etc.
    const { guild, config } = await getGuildConfig(interaction.guildId);
    const themeColor = config.style.mainThemeColor || "#00AE86";
    const embed = new EmbedBuilder().setColor(themeColor as any);
    let buttons: ButtonBuilder[] = [];

    const select = new StringSelectMenuBuilder()
        .setCustomId(PANEL_SELECT_ID)
        .setPlaceholder("Choose a config category…")
        .addOptions(
        { label: "XP (Text)", value: "xp", description: "Message XP settings" },
        { label: "Daily Rewards", value: "daily", description: "Daily reward settings" },
        { label: "Voice XP", value: "vc", description: "Voice channel XP settings" },
        { label: "Levels", value: "levels", description: "Level curve & actions" },
        { label: "Streaks", value: "streaks", description: "Daily streak behavior" },
        { label: "Styles", value: "styles", description: "Theme color & messages" },
        );

    switch (choice) {
        case "xp": {
            embed
                .setTitle(`XP Settings — ${guild.name}`)
                .setDescription(
                [
                    `**Base XP per message:** \`${config.xp.basePerMessage}\``,
                    `**Global cooldown:** \`${config.xp.xpMessageCooldown}s\``,
                    `**Per-channel overrides:** \`${Object.keys(config.xp.xpChannelIds).length}\` channels`,
                    `**Role XP configs:** \`${Object.keys(config.xp.roleXp).length}\` roles`,
                    "",
                    "Use `/configxp` subcommands for detailed edits.",
                ].join("\n")
                );

                buttons = [
                    new ButtonBuilder()
                        .setCustomId("config-panel:xp:set-base")
                        .setLabel("Set Base XP")
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId("config-panel:xp:set-cooldown")
                        .setLabel("Set Cooldown")
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId("config-panel:xp:set-channel-overrides")
                        .setLabel("Channel Overrides")
                        .setStyle(ButtonStyle.Secondary),

                    new ButtonBuilder()
                        .setCustomId("config-panel:xp:remove-channel-overrides")
                        .setLabel("Remove Channel Overrides")
                        .setStyle(ButtonStyle.Danger),

                    new ButtonBuilder()
                        .setCustomId("config-panel:xp:set-role-xp")
                        .setLabel("Role XP")
                        .setStyle(ButtonStyle.Secondary),

                    new ButtonBuilder()
                        .setCustomId("config-panel:xp:remove-role-xp")
                        .setLabel("Remove Role XP")
                        .setStyle(ButtonStyle.Danger),
                ];

            break;
        }

        case "daily": {
            embed
                .setTitle(`Daily Reward Settings — ${guild.name}`)
                .setDescription(
                [
                    `**Daily XP:** \`${config.xp.dailyXp}\``,
                    `**Daily Gold:** \`${config.xp.dailyGold}\``,
                    `**Auto Daily Enabled:** \`${config.xp.autoDailyEnabled}\``,
                    `**Reply to Daily In Channel:** \`${config.xp.replyToDailyInChannel}\``,
                    `**Reply to Daily Ephemeral:** \`${config.xp.replyToDailyEphemeral}\``,
                    `**Reply to Daily Message:** \`${config.xp.replyToDailyMessage}\``,
                    `**Announce Daily Channel Id:** \`${config.xp.announceDailyInChannelId}\``,
                    `**Announce Daily Message:** \`${config.xp.announceDailyMessage}\``,
                    `**role Daily XP and Gold Bonuses:** \`${Object.keys(config.xp.roleXp).length}\` roles`,
                    "",
                    "Use `/config-daily` subcommands for detailed edits.",
                ].join("\n")
                );

                buttons = [
                    new ButtonBuilder()
                        .setCustomId("config-panel:daily:xp")
                        .setLabel("Daily XP")
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId("config-panel:daily:gold")
                        .setLabel("Daily Gold")
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId("config-panel:daily:auto")
                        .setLabel("Auto Daily")
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId("config-panel:daily:reply")
                        .setLabel("Reply to Daily")
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId("config-panel:daily:ephemeral")
                        .setLabel("Ephemeral Reply")
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId("config-panel:daily:reply-message")
                        .setLabel("Reply Message")
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId("config-panel:daily:announce-channel")
                        .setLabel("Announce Channel")
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId("config-panel:daily:announce-message")
                        .setLabel("Announce Message")
                        .setStyle(ButtonStyle.Secondary),

                    new ButtonBuilder()
                        .setCustomId("config-panel:daily:set-role-bonuses")
                        .setLabel("Role Bonuses")
                        .setStyle(ButtonStyle.Secondary),

                    new ButtonBuilder()
                        .setCustomId("config-panel:daily:remove-role-bonuses")
                        .setLabel("Remove Role Bonuses")
                        .setStyle(ButtonStyle.Danger),
                ];
            break;
        }

        case "vc": {
            embed
                .setTitle(`Voice XP Settings — ${guild.name}`)
                .setDescription(
                [
                    `**Enabled:** \`${config.xp.vc.enabled}\``,
                    `**Base XP per minute:** \`${config.xp.vc.basePerMinute}\``,
                    `**Min minutes for XP:** \`${config.xp.vc.minMinutesForXp}\``,
                    `**Configured voice channels:** \`${Object.keys(config.xp.vc.channelIds).length}\``,
                    `**Role XP bonus configs:** \`${Object.keys(config.xp.vc.roleXpBonus).length}\` roles`,
                    "",
                    "Use `/configxp vc-xp` and related commands to tweak values.",
                ].join("\n")
                );

                buttons = [
                    new ButtonBuilder()
                        .setCustomId("config-panel:vc:toggle")
                        .setLabel("Toggle VC XP")
                        .setStyle(ButtonStyle.Secondary),

                    new ButtonBuilder()
                        .setCustomId("config-panel:vc:set-base")
                        .setLabel("Set Base Per Minute")
                        .setStyle(ButtonStyle.Secondary),

                    new ButtonBuilder()
                        .setCustomId("config-panel:vc:set-minutes")
                        .setLabel("Set Min Minutes for XP")
                        .setStyle(ButtonStyle.Secondary),

                    new ButtonBuilder()
                        .setCustomId("config-panel:vc:set-channel-overrides")
                        .setLabel("Channel Overrides")
                        .setStyle(ButtonStyle.Secondary),

                    new ButtonBuilder()
                        .setCustomId("config-panel:vc:remove-channel-overrides")
                        .setLabel("Remove Channel Overrides")
                        .setStyle(ButtonStyle.Danger),

                    new ButtonBuilder()
                        .setCustomId("config-panel:vc:set-role-xp")
                        .setLabel("Role XP")
                        .setStyle(ButtonStyle.Secondary),

                    new ButtonBuilder()
                        .setCustomId("config-panel:vc:remove-role-xp")
                        .setLabel("Remove Role XP")
                        .setStyle(ButtonStyle.Danger),
                ]

            break;
        }

        case "levels": {
            embed
                .setTitle(`Level Settings — ${guild.name}`)
                .setDescription(
                [
                    `**Curve type:** \`${config.levels.curveType}\``,
                    `**Max level:** \`${config.levels.maxLevel ?? "No limit"}\``,
                    `**XP overrides:** \`${Object.keys(config.levels.xpOverrides).length}\` levels`,
                    `**Level actions:** \`${Object.keys(config.levels.levelActions).length}\` levels with actions`,
                    `**Level-up announce channel Id:** \`${config.levels.announceLevelUpInChannelId}\``,
                    `**Level-up announce message:** \`${config.levels.announceLevelUpMessage}\``,
                    "",
                    "Use `/config-levels` commands to adjust curve and actions.",
                ].join("\n")
                );

                buttons = [
                    new ButtonBuilder()
                        .setCustomId("config-panel:levels:set-curve")
                        .setLabel("Set Curve")
                        .setStyle(ButtonStyle.Secondary),

                    new ButtonBuilder()
                        .setCustomId("config-panel:levels:set-max-level")
                        .setLabel("Set Max Level")
                        .setStyle(ButtonStyle.Secondary),

                    new ButtonBuilder()
                        .setCustomId("config-panel:levels:set-xp-overrides")
                        .setLabel("Set XP Overrides")
                        .setStyle(ButtonStyle.Secondary),

                    new ButtonBuilder()
                        .setCustomId("config-panel:levels:remove-xp-overrides")
                        .setLabel("Remove XP Overrides")
                        .setStyle(ButtonStyle.Danger),

                    new ButtonBuilder()
                        .setCustomId("config-panel:levels:set-announce-channel")
                        .setLabel("Set Announce Channel")
                        .setStyle(ButtonStyle.Secondary),

                    new ButtonBuilder()
                        .setCustomId("config-panel:levels:set-announce-message")
                        .setLabel("Set Announce Message")
                        .setStyle(ButtonStyle.Secondary),
                ]
            break;
        }

        case "streaks": {
            embed
                .setTitle(`Streak Settings — ${guild.name}`)
                .setDescription(
                [
                    `**Streak multiplier:** \`${config.xp.streakMultiplier}\``,
                    `**Streak rewards:** \`${Object.keys(config.xp.streakRewards).length}\` milestones`,
                    "",
                    "Use streak config commands to tweak these.",
                ].join("\n")
                );

            buttons = [
                new ButtonBuilder()
                    .setCustomId("config-panel:streaks:set-multiplier")
                    .setLabel("Set Streak Multiplier")
                    .setStyle(ButtonStyle.Secondary),

                new ButtonBuilder()
                    .setCustomId("config-panel:streaks:set-rewards")
                    .setLabel("Set Streak Rewards")
                    .setStyle(ButtonStyle.Secondary),

                new ButtonBuilder()
                    .setCustomId("config-panel:streaks:remove-rewards")
                    .setLabel("Remove Streak Rewards")
                    .setStyle(ButtonStyle.Danger),

                new ButtonBuilder()
                    .setCustomId("config-panel:streaks:set-announce-channel")
                    .setLabel("Set Announce Channel")
                    .setStyle(ButtonStyle.Secondary),

                new ButtonBuilder()
                    .setCustomId("config-panel:streaks:set-announce-message")
                    .setLabel("Set Announce Message")
                    .setStyle(ButtonStyle.Secondary),
            ]
            break;
        }

        case "styles": {
            embed
                .setTitle(`Style Settings — ${guild.name}`)
                .setDescription(
                [
                    `**Main theme color:** \`${config.style.mainThemeColor}\``,
                    "Use `/config-styles` and related commands to adjust.",
                ].join("\n")
                );

            buttons = [
                new ButtonBuilder()
                    .setCustomId("config-panel:styles:set-main-theme-color")
                    .setLabel("Set Main Theme Color")
                    .setStyle(ButtonStyle.Secondary),
            ]
            break;
            }
            default: {
            embed
                .setTitle("Config Panel")
                .setDescription("Unknown section. Please pick another option.");
            break;
        }
    }

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

    const components: (ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>)[] = [row];
    if (buttons.length > 0) {
        components.push(...chunkButtons(buttons));
    }

    await interaction.update({ embeds: [embed], components: components });
}

export async function handleConfigPanelButton(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("config-panel:")) return;

    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply({
        content: "This button can only be used in a server.",
        flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const [ ,section, action] = interaction.customId.split(":");

    switch (section) {
        case "xp": {
            if (action === "set-base") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:xp:set-base-modal")
                    .setTitle("Set Base XP per Message");

                const input = new TextInputBuilder()
                    .setCustomId("xp-base-input")
                    .setLabel("New base XP per message")
                    .setPlaceholder("e.g. 20")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-cooldown") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:xp:set-cooldown-modal")
                    .setTitle("Set Global XP Cooldown");
                    
                const input = new TextInputBuilder()
                    .setCustomId("xp-cooldown-input")
                    .setLabel("New global XP message cooldown (seconds)")
                    .setPlaceholder("e.g. 60")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-channel-overrides") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:xp:set-channel-overrides-modal")
                    .setTitle("Set Channel XP Overrides");

                const channelIdInput = new TextInputBuilder()
                    .setCustomId("xp-channel-overrides-id-input")
                    .setLabel("Discord Channel ID")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const enabledInput = new TextInputBuilder()
                    .setCustomId("xp-channel-overrides-enabled-input")
                    .setLabel("Enable Channel Overrides (true/false)")
                    .setPlaceholder("e.g. true")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const multiplierInput = new TextInputBuilder()
                    .setCustomId("xp-channel-overrides-multiplier-input")
                    .setLabel("XP Multiplier for Channel")
                    .setPlaceholder("e.g. 1.5")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const flatBonusInput = new TextInputBuilder()
                    .setCustomId("xp-channel-overrides-flat-bonus-input")
                    .setLabel("Flat Bonus XP for Channel")
                    .setPlaceholder("e.g. 10")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const cooldownInput = new TextInputBuilder()
                    .setCustomId("xp-channel-overrides-cooldown-input")
                    .setLabel("Cooldown in Seconds for Channel Override")
                    .setPlaceholder("e.g. 30")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);


                const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(channelIdInput);
                const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(enabledInput);
                const row3 = new ActionRowBuilder<TextInputBuilder>().addComponents(multiplierInput);
                const row4 = new ActionRowBuilder<TextInputBuilder>().addComponents(flatBonusInput);
                const row5 = new ActionRowBuilder<TextInputBuilder>().addComponents(cooldownInput);

                modal.addComponents(row1, row2, row3, row4, row5);

                await interaction.showModal(modal);
            } else if (action === "remove-channel-overrides") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:xp:remove-channel-overrides-modal")
                    .setTitle("Remove Channel XP Overrides");

                const input = new TextInputBuilder()
                    .setCustomId("xp-remove-channel-overrides-id-input")
                    .setLabel("Discord Channel ID to Remove")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-role-xp") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:xp:set-role-xp-modal")
                    .setTitle("Set Role XP Config");

                const roleIdInput = new TextInputBuilder()
                    .setCustomId("xp-role-id-input")
                    .setLabel("Discord Role ID")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const extraXpInput = new TextInputBuilder()
                    .setCustomId("xp-role-extra-xp-input")
                    .setLabel("Extra XP for Role")
                    .setPlaceholder("e.g. 10")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const multiplierInput = new TextInputBuilder()
                    .setCustomId("xp-role-multiplier-input")
                    .setLabel("XP Multiplier for Role")
                    .setPlaceholder("e.g. 1.5")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const cooldownInput = new TextInputBuilder()
                    .setCustomId("xp-role-cooldown-input")
                    .setLabel("Cooldown in Seconds for Role (Strictly Less than Global)")
                    .setPlaceholder("e.g. 0")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(roleIdInput);
                const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(extraXpInput);
                const row3 = new ActionRowBuilder<TextInputBuilder>().addComponents(multiplierInput);
                const row4 = new ActionRowBuilder<TextInputBuilder>().addComponents(cooldownInput);

                modal.addComponents(row1, row2, row3, row4);

                await interaction.showModal(modal);
            } else if (action === "remove-role-xp") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:xp:remove-role-xp-modal")
                    .setTitle("Remove Role XP Config");

                const input = new TextInputBuilder()
                    .setCustomId("xp-remove-role-id-input")
                    .setLabel("Discord Role ID to Remove")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            }
            break;
        }

        case "daily": {
            if (action === "xp") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:daily:set-xp-modal")
                    .setTitle("Set Base XP for Daily Reward");

                const input = new TextInputBuilder()
                    .setCustomId("daily-xp-input")
                    .setLabel("New base XP for daily reward")
                    .setPlaceholder("e.g. 20")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "gold") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:daily:set-gold-modal")
                    .setTitle("Set Base Gold for Daily Reward");

                const input = new TextInputBuilder()
                    .setCustomId("daily-gold-input")
                    .setLabel("New base Gold for daily reward")
                    .setPlaceholder("e.g. 20")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "auto") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:daily:set-auto-modal")
                    .setTitle("Enable/Disable Auto Daily");

                const input = new TextInputBuilder()
                    .setCustomId("daily-auto-input")
                    .setLabel("Normal Text Message Triggers Daily (true/false)")
                    .setPlaceholder("e.g. true")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "reply") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:daily:set-reply-modal")
                    .setTitle("Enable/Disable Reply to Daily In Channel");

                const input = new TextInputBuilder()
                    .setCustomId("daily-reply-input")
                    .setLabel("Enable reply to daily in channel (true/false)")
                    .setPlaceholder("e.g. true")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "ephemeral") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:daily:set-ephemeral-modal")
                    .setTitle("Enable/Disable Ephemeral Reply to Daily");

                const input = new TextInputBuilder()
                    .setCustomId("daily-ephemeral-input")
                    .setLabel("Enable ephemeral reply to daily (true/false)")
                    .setPlaceholder("e.g. true")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "reply-message") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:daily:set-reply-message-modal")
                    .setTitle("Set Reply Message for Daily Reward");

                const input = new TextInputBuilder()
                    .setCustomId("daily-reply-message-input")
                    .setLabel("Use {xp}, {gold}, {streak} as placeholders")
                    .setPlaceholder("e.g. You received {xp} XP and {gold} gold! Your streak is now {streak} days.")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "announce-channel") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:daily:set-announce-channel-modal")
                    .setTitle("Set Announce Channel for Daily Reward");

                const input = new TextInputBuilder()
                    .setCustomId("daily-announce-channel-input")
                    .setLabel("Discord Channel ID or \"none\", blank, \"null\" to disable")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "announce-message") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:daily:set-announce-message-modal")
                    .setTitle("Set Announce Message for Daily Reward");

                const input = new TextInputBuilder()
                    .setCustomId("daily-announce-message-input")
                    .setLabel("Use {user}, {level} as placeholders")
                    .setPlaceholder("e.g. {user} has received {xp} XP and {gold} gold! Their streak is now {streak} days.")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-role-bonuses") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:daily:set-role-bonuses-modal")
                    .setTitle("Set Role Daily XP/Gold Bonuses");

                const roleIdInput = new TextInputBuilder()
                    .setCustomId("daily-role-id-input")
                    .setLabel("Discord Role ID")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const xpBonusInput = new TextInputBuilder()
                    .setCustomId("daily-role-xp-bonus-input")
                    .setLabel("Daily XP Bonus for Role")
                    .setPlaceholder("e.g. 10")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const goldBonusInput = new TextInputBuilder()
                    .setCustomId("daily-role-gold-bonus-input")
                    .setLabel("Daily Gold Bonus for Role")
                    .setPlaceholder("e.g. 5")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const multiplerInput = new TextInputBuilder()
                    .setCustomId("daily-role-multiplier-input")
                    .setLabel("Daily Multiplier for Role")
                    .setPlaceholder("e.g. 1.5")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(roleIdInput);
                const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(xpBonusInput);
                const row3 = new ActionRowBuilder<TextInputBuilder>().addComponents(goldBonusInput);
                const row4 = new ActionRowBuilder<TextInputBuilder>().addComponents(multiplerInput);

                modal.addComponents(row1, row2, row3, row4);

                await interaction.showModal(modal);
            } else if (action === "remove-role-bonuses") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:daily:remove-role-bonuses-modal")
                    .setTitle("Remove Role Daily XP/Gold Bonuses");

                const input = new TextInputBuilder()
                    .setCustomId("daily-remove-role-id-input")
                    .setLabel("Discord Role ID to Remove")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            }   

            break;
        }
    
        case "vc": {
            if (action === "toggle") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:vc:set-toggle-modal")
                    .setTitle("Enable/Disable Voice Channel XP");

                const input = new TextInputBuilder()
                    .setCustomId("vc-toggle-input")
                    .setLabel("Enable Voice Channel XP (true/false)")
                    .setPlaceholder("e.g. true or false")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-base") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:vc:set-base-modal")
                    .setTitle("Set Base XP per Minute for Voice Channel");

                const input = new TextInputBuilder()
                    .setCustomId("vc-base-input")
                    .setLabel("Base XP per Minute")
                    .setPlaceholder("e.g. 10")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-minutes") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:vc:set-minutes-modal")
                    .setTitle("Set Minimum Minutes for Voice Channel XP");

                const input = new TextInputBuilder()
                    .setCustomId("vc-minutes-input")
                    .setLabel("Minimum Minutes for XP")
                    .setPlaceholder("e.g. 5")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-channel-overrides") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:vc:set-channel-overrides-modal")
                    .setTitle("Set Voice Channel XP Overrides");

                const channelIdInput = new TextInputBuilder()
                    .setCustomId("vc-channel-overrides-id-input")
                    .setLabel("Discord Channel ID")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const enabledInput = new TextInputBuilder()
                    .setCustomId("vc-channel-overrides-enabled-input")
                    .setLabel("Enable Channel Overrides (true/false)")
                    .setPlaceholder("e.g. true")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const flatBonusInput = new TextInputBuilder()
                    .setCustomId("vc-channel-overrides-flat-bonus-input")
                    .setLabel("Flat Bonus XP for Channel")
                    .setPlaceholder("e.g. 10")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const multiplierInput = new TextInputBuilder()
                    .setCustomId("vc-channel-overrides-multiplier-input")
                    .setLabel("XP Multiplier for Channel")
                    .setPlaceholder("e.g. 1.5")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(channelIdInput);
                const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(enabledInput);
                const row3 = new ActionRowBuilder<TextInputBuilder>().addComponents(flatBonusInput);
                const row4 = new ActionRowBuilder<TextInputBuilder>().addComponents(multiplierInput);

                modal.addComponents(row1, row2, row3, row4);

                await interaction.showModal(modal);
            } else if (action === "remove-channel-overrides") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:vc:remove-channel-overrides-modal")
                    .setTitle("Remove Voice Channel XP Overrides");

                const input = new TextInputBuilder()
                    .setCustomId("vc-remove-channel-overrides-id-input")
                    .setLabel("Discord Channel ID to Remove")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-role-xp") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:vc:set-role-xp-modal")
                    .setTitle("Set Voice Channel Role XP Config");

                const roleIdInput = new TextInputBuilder()
                    .setCustomId("vc-role-id-input")
                    .setLabel("Discord Role ID")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const multiplierInput = new TextInputBuilder()
                    .setCustomId("vc-role-multiplier-input")
                    .setLabel("XP Multiplier for Role")
                    .setPlaceholder("e.g. 1.5")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(roleIdInput);
                const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(multiplierInput);

                modal.addComponents(row1, row2);

                await interaction.showModal(modal);
            } else if (action === "remove-role-xp") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:vc:remove-role-xp-modal")
                    .setTitle("Remove Voice Channel Role XP Config");

                const input = new TextInputBuilder()
                    .setCustomId("vc-remove-role-id-input")
                    .setLabel("Discord Role ID to Remove")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            }
            break;
        }

        case "levels": {
            if (action === "set-curve") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:levels:set-curve-modal")
                    .setTitle("Set Curve for Levels");

                const typeInput = new TextInputBuilder()
                    .setCustomId("levels-curve-input")
                    .setLabel("Curve for Levels")
                    .setPlaceholder("e.g. linear, exponential, polynomial, logarithmic")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const paramInput1 = new TextInputBuilder()
                    .setCustomId("levels-curve-params-input")
                    .setLabel("Curve Parameter 1 (Depends on curve type)")
                    .setPlaceholder('linear: rate, exponential: base, polynomial: degree, logarithmic: base')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const paramInput2 = new TextInputBuilder()
                    .setCustomId("levels-curve-params-2-input")
                    .setLabel("Curve Parameter 2 (Depends on curve type))")
                    .setPlaceholder('linear: N/A, exponential: factor, polynomial: factor, logarithmic: factor')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const typeRow = new ActionRowBuilder<TextInputBuilder>().addComponents(typeInput);
                const paramRow1 = new ActionRowBuilder<TextInputBuilder>().addComponents(paramInput1);
                const paramRow2 = new ActionRowBuilder<TextInputBuilder>().addComponents(paramInput2);

                modal.addComponents(typeRow, paramRow1, paramRow2);

                await interaction.showModal(modal);
            } else if (action === "set-max-level") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:levels:set-max-level-modal")
                    .setTitle("Set Max Level");

                const input = new TextInputBuilder()
                    .setCustomId("levels-max-level-input")
                    .setLabel("Max Level (use 0 for no limit)")
                    .setPlaceholder("e.g. 100")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-announce-channel") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:levels:set-announce-channel-modal")
                    .setTitle("Set Level-Up Announce Channel");

                const input = new TextInputBuilder()
                    .setCustomId("levels-announce-channel-input")
                    .setLabel("Discord Channel ID or \"none\", blank, \"null\" to disable")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-announce-message") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:levels:set-announce-message-modal")
                    .setTitle("Set Level-Up Announce Message");

                const input = new TextInputBuilder()
                    .setCustomId("levels-announce-message-input")
                    .setLabel("Use {user}, {level}, {xp} as placeholders")
                    .setPlaceholder("e.g. {user} has reached level {level} with {xp} XP!")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-xp-overrides") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:levels:set-xp-overrides-modal")
                    .setTitle("Set Level XP Overrides");

                const levelInput = new TextInputBuilder()
                    .setCustomId("levels-xp-overrides-level-input")
                    .setLabel("Level to Override")
                    .setPlaceholder("e.g. 10")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const xpInput = new TextInputBuilder()
                    .setCustomId("levels-xp-overrides-xp-input")
                    .setLabel("XP Required for Level")
                    .setPlaceholder("e.g. 1000")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const levelRow = new ActionRowBuilder<TextInputBuilder>().addComponents(levelInput);
                const xpRow = new ActionRowBuilder<TextInputBuilder>().addComponents(xpInput);

                modal.addComponents(levelRow, xpRow);

                await interaction.showModal(modal);
            }  else if (action === "remove-xp-overrides") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:levels:remove-xp-overrides-modal")
                    .setTitle("Remove Level XP Overrides");

                const input = new TextInputBuilder()
                    .setCustomId("levels-remove-xp-overrides-level-input")
                    .setLabel("Level to Remove Override")
                    .setPlaceholder("e.g. 10")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            }   
            break;
        }

        case "streaks": {
            if (action === "set-multiplier") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:streaks:set-multiplier-modal")
                    .setTitle("Set Streak Multiplier");

                const input = new TextInputBuilder()
                    .setCustomId("streak-multiplier-input")
                    .setLabel("New Streak Multiplier")
                    .setPlaceholder("e.g. 0.1 (10% per day)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-rewards") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:streaks:set-rewards-modal")
                    .setTitle("Set Streak Rewards");

                const countInput = new TextInputBuilder()
                    .setCustomId("streak-rewards-day-input")
                    .setLabel("Streak Day")
                    .setPlaceholder("e.g. 5")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const xpInput = new TextInputBuilder()
                    .setCustomId("streak-rewards-xp-input")
                    .setLabel("XP Reward")
                    .setPlaceholder("e.g. 100")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const goldInput = new TextInputBuilder()
                    .setCustomId("streak-rewards-gold-input")
                    .setLabel("Gold Reward")
                    .setPlaceholder("e.g. 50")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const channelInput = new TextInputBuilder()
                    .setCustomId("streak-rewards-channel-input")
                    .setLabel("Channel Reward (ID)")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const messageInput = new TextInputBuilder()
                    .setCustomId("streak-rewards-message-input")
                    .setLabel("Custom Reward Message")
                    .setPlaceholder("e.g. Congrats on your 5-day streak!")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const countRow = new ActionRowBuilder<TextInputBuilder>().addComponents(countInput);
                const xpRow = new ActionRowBuilder<TextInputBuilder>().addComponents(xpInput);
                const goldRow = new ActionRowBuilder<TextInputBuilder>().addComponents(goldInput);
                const channelRow = new ActionRowBuilder<TextInputBuilder>().addComponents(channelInput);
                const messageRow = new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput);

                modal.addComponents(countRow, xpRow, goldRow, channelRow, messageRow);

                await interaction.showModal(modal);
            } else if (action === "remove-rewards") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:streaks:remove-rewards-modal")
                    .setTitle("Remove Streak Rewards");

                const input = new TextInputBuilder()
                    .setCustomId("streak-remove-rewards-input")
                    .setLabel("Streak Day to Remove Reward")
                    .setPlaceholder("e.g. 5")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-announce-channel") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:streaks:set-announce-channel-modal")
                    .setTitle("Set Streak Announce Channel");

                const input = new TextInputBuilder()
                    .setCustomId("streak-announce-channel-input")
                    .setLabel("Discord Channel ID or \"none\", blank, \"null\" to disable")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-announce-message") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:streaks:set-announce-message-modal")
                    .setTitle("Set Streak Announce Message");

                const input = new TextInputBuilder()
                    .setCustomId("streak-announce-message-input")
                    .setLabel("Announce Message")
                    .setPlaceholder("e.g. Congratulations on your streak!")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            }
            break;
        }

        case "styles": {
            if (action === "set-main-theme-color") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:styles:set-main-theme-color-modal")
                    .setTitle("Set Main Theme Color");

                const input = new TextInputBuilder()
                    .setCustomId("styles-main-theme-color-input")
                    .setLabel("New Main Theme Color (hex code)")
                    .setPlaceholder("e.g. #00AE86")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            }
            break;
        }
    }
}

export async function handleConfigPanelModalSubmit(interaction: ModalSubmitInteraction) {
    if (!interaction.customId.startsWith("config-panel:")) return;

    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply({
        content: "This modal can only be used in a server.",
        flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const [ ,section, action] = interaction.customId.split(":");

    const { guild, config } = await getGuildConfig(interaction.guildId);
    const newConfig = structuredClone(config);

    switch (section) {
        case "xp": {
            if (action === "set-base-modal") {
                const input = interaction.fields.getTextInputValue("xp-base-input");
                const value = Number(input);

                newConfig.xp.basePerMessage = value;

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Base XP per message updated to \`${value}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-cooldown-modal") {
                const input = interaction.fields.getTextInputValue("xp-cooldown-input");
                const value = Number(input);

                newConfig.xp.xpMessageCooldown = value;

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Global XP message cooldown updated to \`${value}s\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-channel-overrides-modal") {
                const channelId = interaction.fields.getTextInputValue("xp-channel-overrides-id-input");
                const enabledInput = interaction.fields.getTextInputValue("xp-channel-overrides-enabled-input");
                const flatBonusInput = interaction.fields.getTextInputValue("xp-channel-overrides-flat-bonus-input");
                const multiplierInput = interaction.fields.getTextInputValue("xp-channel-overrides-multiplier-input");
                const cooldownInput = interaction.fields.getTextInputValue("xp-channel-overrides-cooldown-input");

                const enabled = enabledInput.toLowerCase() === "true";
                const flatBonus = flatBonusInput ? Number(flatBonusInput) : 0;
                const multiplier = Number(multiplierInput) || 1;
                const cooldown = cooldownInput ? Number(cooldownInput) : newConfig.xp.xpMessageCooldown;

                newConfig.xp.xpChannelIds = newConfig.xp.xpChannelIds || {};
                newConfig.xp.xpChannelIds[channelId] = {
                    enabled,
                    channelId,
                    flatBonus,
                    multiplier,
                    cooldownOverride: cooldown,
                };

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `XP Channel Override for <#${channelId}> has been set.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "remove-channel-overrides-modal") {
                const channelId = interaction.fields.getTextInputValue("xp-remove-channel-overrides-id-input");

                if (newConfig.xp.xpChannelIds && newConfig.xp.xpChannelIds[channelId]) {
                    delete newConfig.xp.xpChannelIds[channelId];

                    await setGuildConfig(interaction.guildId, newConfig);

                    await interaction.reply({
                        content: `XP Channel Override for <#${channelId}> has been removed.`,
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await interaction.reply({
                        content: `No XP Channel Override found for <#${channelId}>.`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            } else if (action === "set-role-xp-modal") {
                const roleId = interaction.fields.getTextInputValue("xp-role-id-input");
                const extraXpInput = interaction.fields.getTextInputValue("xp-role-extra-xp-input");
                const extraXp = extraXpInput ? Number(extraXpInput) : 0;
                const multiplierInput = interaction.fields.getTextInputValue("xp-role-multiplier-input");
                const multiplier = Number(multiplierInput) || 1;
                const cooldownInput = interaction.fields.getTextInputValue("xp-role-cooldown-input");
                const cooldown = cooldownInput ? Number(cooldownInput) : newConfig.xp.xpMessageCooldown;

                newConfig.xp.roleXp = newConfig.xp.roleXp || {};
                newConfig.xp.roleXp[roleId] = {
                    extraXp,
                    multiplier,
                    cooldownSeconds: cooldown,
                };

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `XP Role Config for <@&${roleId}> has been set.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "remove-role-xp-modal") {
                const roleId = interaction.fields.getTextInputValue("xp-remove-role-id-input");

                if (newConfig.xp.roleXp && newConfig.xp.roleXp[roleId]) {
                    delete newConfig.xp.roleXp[roleId];

                    await setGuildConfig(interaction.guildId, newConfig);

                    await interaction.reply({
                        content: `XP Role Config for <@&${roleId}> has been removed.`,
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await interaction.reply({
                        content: `No XP Role Config found for <@&${roleId}>.`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
            break;
        }

        case "daily": {
            if (action === "set-xp-modal") {
                const input = interaction.fields.getTextInputValue("daily-xp-input");
                const value = Number(input);

                newConfig.xp.dailyXp = value;

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Daily XP updated to \`${value}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-gold-modal") {
                const input = interaction.fields.getTextInputValue("daily-gold-input");
                const value = Number(input);

                newConfig.xp.dailyGold = value;

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Daily Gold updated to \`${value}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-auto-modal") {
                const input = interaction.fields.getTextInputValue("daily-auto-input");
                const value = input.toLowerCase() === "true";

                newConfig.xp.autoDailyEnabled = value;

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Auto Daily Enabled updated to \`${value}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-reply-modal") {
                const input = interaction.fields.getTextInputValue("daily-reply-input");
                const value = input.toLowerCase() === "true";

                newConfig.xp.replyToDailyInChannel = value;
                
                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Reply to Daily in Channel updated to \`${value}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-ephemeral-modal") {
                const input = interaction.fields.getTextInputValue("daily-ephemeral-input");
                const value = input.toLowerCase() === "true";

                newConfig.xp.replyToDailyEphemeral = value;
                
                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Ephemeral Reply to Daily updated to \`${value}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-reply-message-modal") {
                const input = interaction.fields.getTextInputValue("daily-reply-message-input");

                newConfig.xp.replyToDailyMessage = input;
                
                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Reply Message for Daily Reward updated.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-announce-channel-modal") {
                const input = interaction.fields.getTextInputValue("daily-announce-channel-input");

                if (input.toLowerCase() === "none" || input.toLowerCase() === "null" || input.trim() === "") {
                    newConfig.xp.announceDailyInChannelId = null;
                } else {
                    newConfig.xp.announceDailyInChannelId = input;
                }
                
                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Announce Channel ID for Daily Reward updated to \`${input}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-announce-message-modal") {
                const input = interaction.fields.getTextInputValue("daily-announce-message-input");

                newConfig.xp.announceDailyMessage = input;
                
                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Announce Message for Daily Reward updated.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-role-bonuses-modal") {
                const roleId = interaction.fields.getTextInputValue("daily-role-id-input");
                const xpBonusInput = interaction.fields.getTextInputValue("daily-role-xp-bonus-input");
                const xpBonus = xpBonusInput ? Number(xpBonusInput) : 0;
                const goldBonusInput = interaction.fields.getTextInputValue("daily-role-gold-bonus-input");
                const goldBonus = goldBonusInput ? Number(goldBonusInput) : 0;
                const multiplierInput = interaction.fields.getTextInputValue("daily-multiplier-input");
                const multiplier = multiplierInput ? Number(multiplierInput) : 1;

                newConfig.xp.roleDailyBonus = newConfig.xp.roleDailyBonus || {};
                newConfig.xp.roleDailyBonus[roleId] = {
                    xpBonus,
                    goldBonus,
                    multiplier,
                };

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Daily Role Bonus for <@&${roleId}> has been set.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "remove-role-bonuses-modal") {
                const roleId = interaction.fields.getTextInputValue("daily-remove-role-id-input");

                if (newConfig.xp.roleDailyBonus && newConfig.xp.roleDailyBonus[roleId]) {
                    delete newConfig.xp.roleDailyBonus[roleId];

                    await setGuildConfig(interaction.guildId, newConfig);

                    await interaction.reply({
                        content: `Daily Role Bonus for <@&${roleId}> has been removed.`,
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await interaction.reply({
                        content: `No Daily Role Bonus found for <@&${roleId}>.`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
            break;
        }

        case "vc": {
            if (action === "set-toggle-modal") {
                const input = interaction.fields.getTextInputValue("vc-toggle-input");
                const value = input.toLowerCase() === "true";

                newConfig.xp.vc.enabled = value;

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Voice Channel XP Enabled updated to \`${value}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-base-modal") {
                const input = interaction.fields.getTextInputValue("vc-base-input");
                const value = Number(input);

                newConfig.xp.vc.basePerMinute = value;

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Base XP per Minute for Voice Channel updated to \`${value}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-minutes-modal") {
                const input = interaction.fields.getTextInputValue("vc-minutes-input");
                const value = Number(input);

                newConfig.xp.vc.minMinutesForXp = value;

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Minimum Minutes for Voice Channel XP updated to \`${value}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-channel-overrides-modal") {
                const channelId = interaction.fields.getTextInputValue("vc-channel-overrides-id-input");
                const enabledInput = interaction.fields.getTextInputValue("vc-channel-overrides-enabled-input");
                const flatBonusInput = interaction.fields.getTextInputValue("vc-channel-overrides-flat-bonus-input");
                const multiplierInput = interaction.fields.getTextInputValue("vc-channel-overrides-multiplier-input");

                const enabled = enabledInput.toLowerCase() === "true";
                const flatBonus = flatBonusInput ? Number(flatBonusInput) : 0;
                const multiplier = Number(multiplierInput) || 1;

                newConfig.xp.vc.channelIds = newConfig.xp.vc.channelIds || {};
                newConfig.xp.vc.channelIds[channelId] = {
                    enabled,
                    channelId,
                    flatBonus,
                    multiplier

                };

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Voice Channel XP Override for <#${channelId}> has been set.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "remove-channel-overrides-modal") {
                const channelId = interaction.fields.getTextInputValue("vc-remove-channel-overrides-id-input");

                if (newConfig.xp.vc.channelIds && newConfig.xp.vc.channelIds[channelId]) {
                    delete newConfig.xp.vc.channelIds[channelId];

                    await setGuildConfig(interaction.guildId, newConfig);

                    await interaction.reply({
                        content: `Voice Channel XP Override for <#${channelId}> has been removed.`,
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await interaction.reply({
                        content: `No Voice Channel XP Override found for <#${channelId}>.`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            } else if (action === "set-role-xp-modal") {
                const roleId = interaction.fields.getTextInputValue("vc-role-id-input");
                const multiplierInput = interaction.fields.getTextInputValue("vc-role-multiplier-input");
                const multiplier = Number(multiplierInput) || 1;

                newConfig.xp.vc.roleXpBonus = newConfig.xp.vc.roleXpBonus || {};
                newConfig.xp.vc.roleXpBonus[roleId] = {
                    multiplier,
                };

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Voice Channel XP Role Config for <@&${roleId}> has been set.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "remove-role-xp-modal") {
                const roleId = interaction.fields.getTextInputValue("vc-remove-role-id-input");

                if (newConfig.xp.vc.roleXpBonus && newConfig.xp.vc.roleXpBonus[roleId]) {
                    delete newConfig.xp.vc.roleXpBonus[roleId];

                    await setGuildConfig(interaction.guildId, newConfig);

                    await interaction.reply({
                        content: `Voice Channel XP Role Config for <@&${roleId}> has been removed.`,
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await interaction.reply({
                        content: `No Voice Channel XP Role Config found for <@&${roleId}>.`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
            break;
        }

        case "levels": {
            if (action === "set-curve-modal") {
                const input = interaction.fields.getTextInputValue("levels-curve-input");
                if (!["linear", "exponential", "polynomial", "logarithmic"].includes(input.toLowerCase())) {
                    await interaction.reply({
                        content: `Invalid curve type. Please use one of: linear, exponential, polynomial, logarithmic.`,
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                const param1 = interaction.fields.getTextInputValue("levels-curve-params-input");
                const param2 = interaction.fields.getTextInputValue("levels-curve-params-2-input");
                
                newConfig.levels.curveParams = {};

                switch (input.toLowerCase()) {
                    case "linear":
                        newConfig.levels.curveParams["rate"] = Number(param1);
                        break;
                    case "exponential":
                        newConfig.levels.curveParams["base"] = Number(param1);
                        newConfig.levels.curveParams["factor"] = Number(param2);
                        break;
                    case "polynomial":
                        newConfig.levels.curveParams["degree"] = Number(param1);
                        newConfig.levels.curveParams["factor"] = Number(param2);
                        break;
                    case "logarithmic":
                        newConfig.levels.curveParams["base"] = Number(param1);
                        newConfig.levels.curveParams["factor"] = Number(param2);
                        break;
                }

                newConfig.levels.curveType = input.toLowerCase() as "linear" | "exponential" | "polynomial" | "logarithmic";

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Levels Curve Type updated to \`${input}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-max-level-modal") {
                const input = interaction.fields.getTextInputValue("levels-max-level-input");
                const value = Number(input);
                newConfig.levels.maxLevel = value === 0 ? null : value;

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Max Level updated to \`${value === 0 ? "No limit" : value}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-announce-channel-modal") {
                const input = interaction.fields.getTextInputValue("levels-announce-channel-input");

                if (input === "none" || input === "" || input.toLowerCase() === "null") {
                    newConfig.levels.announceLevelUpInChannelId = null;
                } else {
                    newConfig.levels.announceLevelUpInChannelId = input;
                }
                
                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Level-Up Announce Channel ID updated to \`${input}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-announce-message-modal") {
                const input = interaction.fields.getTextInputValue("levels-announce-message-input");

                newConfig.levels.announceLevelUpMessage = input;
                
                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Level-Up Announce Message updated.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-xp-overrides-modal") {
                const levelInput = interaction.fields.getTextInputValue("levels-xp-overrides-level-input");
                const xpInput = interaction.fields.getTextInputValue("levels-xp-overrides-xp-input");

                const level = Number(levelInput);
                const xp = Number(xpInput);

                if (!newConfig.levels.xpOverrides) {
                    newConfig.levels.xpOverrides = {};
                }

                newConfig.levels.xpOverrides[level] = xp;

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `XP Override for Level ${level} set to ${xp}.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "remove-xp-overrides-modal") {
                const input = interaction.fields.getTextInputValue("levels-remove-xp-overrides-level-input");
                const level = Number(input);

                if (newConfig.levels.xpOverrides && newConfig.levels.xpOverrides[level]) {
                    delete newConfig.levels.xpOverrides[level];
                    await setGuildConfig(interaction.guildId, newConfig);

                    await interaction.reply({
                        content: `XP Override for Level ${level} removed.`,
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await interaction.reply({
                        content: `No XP Override found for Level ${level}.`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
            break;
        }

        case "streaks": {
            if (action === "set-multiplier-modal") {
                const input = interaction.fields.getTextInputValue("streak-multiplier-input");
                const value = Number(input);

                newConfig.xp.streakMultiplier = value;

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Streak Multiplier updated to \`${value}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-announce-channel-modal") {
                const input = interaction.fields.getTextInputValue("streak-announce-channel-input");

                if (input === "none" || input === "" || input.toLowerCase() === "null") {
                    newConfig.xp.streakAnnounceChannelId = null;
                } else {
                    newConfig.xp.streakAnnounceChannelId = input;
                }
                
                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Streak Announce Channel ID updated to \`${input}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-announce-message-modal") {
                const input = interaction.fields.getTextInputValue("streak-announce-message-input");

                newConfig.xp.streakAnnounceMessage = input;
                
                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Streak Announce Message updated.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-rewards-modal") {
                const dayInput = interaction.fields.getTextInputValue("streak-rewards-day-input");
                const xpInput = interaction.fields.getTextInputValue("streak-rewards-xp-input");
                const goldInput = interaction.fields.getTextInputValue("streak-rewards-gold-input");
                const channelInput = interaction.fields.getTextInputValue("streak-rewards-channel-input");
                const messageInput = interaction.fields.getTextInputValue("streak-rewards-message-input");

                const day = Number(dayInput);
                const xp = xpInput ? Number(xpInput) : 0;
                const gold = goldInput ? Number(goldInput) : 0;
                const channelId = channelInput || null;
                const message = messageInput || null;

                if (!newConfig.xp.streakRewards) {
                    newConfig.xp.streakRewards = {};
                }

                newConfig.xp.streakRewards[day] = {
                    streakCount: day,
                    xpBonus: xp,
                    goldBonus: gold,
                    channelId: channelId,
                    message: message,
                };

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Streak Reward for ${day} days set.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "remove-rewards-modal") {
                const input = interaction.fields.getTextInputValue("streak-remove-rewards-input");
                const day = Number(input);

                if (newConfig.xp.streakRewards && newConfig.xp.streakRewards[day]) {
                    delete newConfig.xp.streakRewards[day];
                    await setGuildConfig(interaction.guildId, newConfig);

                    await interaction.reply({
                        content: `Streak Reward for ${day} days removed.`,
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await interaction.reply({
                        content: `No streak reward found for ${day} days.`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
            break;
        }

        case "styles": {
            if (action === "set-main-theme-color-modal") {
                const input = interaction.fields.getTextInputValue("styles-main-theme-color-input");
                if (!/^#?[0-9A-Fa-f]{6}$/.test(input)) {
                    await interaction.reply({
                        content: `Invalid color code. Please provide a valid hex color code (e.g. #00AE86).`,
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                newConfig.style.mainThemeColor = input;
                
                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Main Theme Color updated to \`${input}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            }
            break;
        }
    }
}