import { ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";

const PANEL_SELECT_ID = "config-panel:main";

export async function sendConfigPanel(interaction: ChatInputCommandInteraction) {
    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId! });
    const themeColor = config.style.mainThemeColor || "#00AE86";

    const allowedCategories = Object.entries(config.logging.allowedCategories ?? {})
        .filter(([_, value]) => value !== false)
        .map(([key]) => key);

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
            `**Shop:**`,
            `• Enabled: \`${config.shop?.enabled ?? false}\``,
            `• Categories: \`${Object.keys(config.shop?.categories ?? {}).length}\``,
            `• Items: \`${Object.keys(config.shop?.items ?? {}).length}\``,
            "",
            `**Styles:**`,
            `• Main theme color: \`${config.style.mainThemeColor}\``,
            `• Gold icon: \`${config.style.gold.icon}\``,
            `• Gold name: \`${config.style.gold.name}\``,
            `• XP icon: \`${config.style.xp.icon}\``,
            `• XP name: \`${config.style.xp.name}\``,
            "",
            `**Logging:**`,
            `• Enabled: \`${config.logging.enabled}\``,
            `• Categories logged: \`${allowedCategories.length}\` (${allowedCategories.join(", ")})`,
            `• Main channel Id: \`${config.logging.mainChannelId ?? "Not set"}\``,
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
        { label: "Shop", value: "shop", description: "Shop settings" },
        { label: "Styles", value: "styles", description: "Theme color & messages" },
        { label: "Logging", value: "logging", description: "Event logging settings" },
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