import { StringSelectMenuInteraction, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";

const PANEL_SELECT_ID = "config-panel:main";

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
    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
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
        { label: "Shop", value: "shop", description: "Shop settings" },
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
                    "Use `/config-xp` subcommands for detailed edits.",
                ].join("\n")
                );

                buttons = [
                    new ButtonBuilder()
                        .setCustomId("config-panel:xp:set-base")
                        .setLabel("Set Base XP")
                        .setStyle(ButtonStyle.Secondary),
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
                    "Use `/config-xp` subcommands for detailed edits.",
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
                    "Use `/config-xp vc-xp` and `/config-xp` and related commands/subcommands to tweak values.",
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
                    "Use `/config-streak` subcommands to tweak these.",
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

        case "shop": {
            embed
                .setTitle(`Shop Settings — ${guild.name}`)
                .setDescription(
                [
                    `**Enabled:** \`${config.shop?.enabled ?? false}\``,
                    `**Categories:** \`${Object.keys(config.shop?.categories ?? {}).length}\``,
                    `**Items:** \`${Object.keys(config.shop?.items ?? {}).length}\``,
                    `**NOTE**: Category and Item Creations through panels have limited fields and must be edited after creation.`,
                    `**RECOMMENDED**: Detailed shop item and category management is done via \`/config-shop\` commands.`,
                    `No like fr tho for items especially too many fields just use the command.`,
                    "",
                    "Use `/config-shop` and related commands to adjust.",
                ].join("\n")
                );

            buttons = [
                new ButtonBuilder()
                    .setCustomId("config-panel:shop:toggle")
                    .setLabel("Toggle Shop")
                    .setStyle(ButtonStyle.Secondary),

                new ButtonBuilder()
                    .setCustomId("config-panel:shop:add-category")
                    .setLabel("Add Category")
                    .setStyle(ButtonStyle.Secondary),

                new ButtonBuilder()
                    .setCustomId("config-panel:shop:edit-category")
                    .setLabel("Edit Category")
                    .setStyle(ButtonStyle.Secondary),

                new ButtonBuilder()
                    .setCustomId("config-panel:shop:delete-category")
                    .setLabel("Delete Category")
                    .setStyle(ButtonStyle.Danger),

                
                new ButtonBuilder()
                    .setCustomId("config-panel:shop:add-item")
                    .setLabel("Add Item")
                    .setStyle(ButtonStyle.Secondary),

                new ButtonBuilder()
                    .setCustomId("config-panel:shop:edit-item")
                    .setLabel("Edit Item")
                    .setStyle(ButtonStyle.Secondary),

                new ButtonBuilder()
                    .setCustomId("config-panel:shop:delete-item")
                    .setLabel("Delete Item")
                    .setStyle(ButtonStyle.Danger),

                new ButtonBuilder()
                    .setCustomId("config-panel:shop:add-item-action")
                    .setLabel("View Items")
                    .setStyle(ButtonStyle.Secondary),
                

                new ButtonBuilder()
                    .setCustomId("config-panel:shop:remove-item-action")
                    .setLabel("Remove Item Action")
                    .setStyle(ButtonStyle.Danger),
            ]
            break;
        }  

        case "styles": {
            embed
                .setTitle(`Style Settings — ${guild.name}`)
                .setDescription(
                [
                    `**Main theme color:** \`${config.style.mainThemeColor}\``,
                    `**Gold icon:** \`${config.style.gold.icon}\``,
                    `**Gold name:** \`${config.style.gold.name}\``,
                    `**XP icon:** \`${config.style.xp.icon}\``,
                    `**XP name:** \`${config.style.xp.name}\``,
                    "",
                    "Use `/config-styles` and related commands to adjust.",
                ].join("\n")
                );

            buttons = [
                new ButtonBuilder()
                    .setCustomId("config-panel:styles:set-main-theme-color")
                    .setLabel("Set Main Theme Color")
                    .setStyle(ButtonStyle.Secondary),

                new ButtonBuilder()
                    .setCustomId("config-panel:styles:set-gold")
                    .setLabel("Set Gold Name/Icon")
                    .setStyle(ButtonStyle.Secondary),

                new ButtonBuilder()
                    .setCustomId("config-panel:styles:set-xp")
                    .setLabel("Set XP Name/Icon")
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