import {
    ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
    ModalBuilder,
    ModalSubmitInteraction,
    SlashCommandBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    type ColorResolvable,
} from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateProfile, commitProfileChanges } from "../../cache/profileService.js";
import type { PendingProfileChanges } from "../../types/cache.js";
import type { DbUserGuildProfile } from "../../types/userprofile.js";

type UserSettings = NonNullable<DbUserGuildProfile["settings"]>;

// null/false = public (default), true = private
const DEFAULTS: Required<UserSettings> = {
    inventoryPrivate: false,
    goldPrivate: false,
    xpPrivate: false,
    profilePrivate: false,
    dmOnTradeInbound: true,
    quiet: false,
};

function getSettings(profile: DbUserGuildProfile): Required<UserSettings> {
    return { ...DEFAULTS, ...(profile.settings ?? {}) };
}

function parseBool(s: string): boolean {
    return ["true", "yes", "1", "on"].includes(s.trim().toLowerCase());
}

/** For private-flag fields: true = 🔒 Private, false = 🌐 Public */
function privDisplay(val: boolean): string {
    return val ? "🔒 Private" : "🌐 Public";
}

/** For notification-flag fields: true = ✅ Enabled, false = ❌ Disabled */
function notifDisplay(val: boolean): string {
    return val ? "✅ Enabled" : "❌ Disabled";
}

export const data = new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Manage your user settings")
    .addSubcommand(sub =>
        sub.setName("view")
            .setDescription("View your current settings")
    )
    .addSubcommand(sub =>
        sub.setName("update")
            .setDescription("Update your user settings")
    )
    .addSubcommand(sub =>
        sub.setName("quiet")
            .setDescription("Never get pinged by level-ups, rare finds and other announcements about you")
            .addBooleanOption(o => o.setName("on").setDescription("On: you're named without a ping").setRequired(true))
    );

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply("This command can only be used in a server.");
        return;
    }

    const sub = interaction.options.getSubcommand();

    const { user } = await getOrCreateDbUser({ discordUserId: interaction.user.id });
    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    const { profile } = await getOrCreateProfile({ userId: user.id, guildId: guild.id });

    const s = getSettings(profile);

    if (sub === "quiet") {
        const on = interaction.options.getBoolean("on", true);
        const cached = await getOrCreateProfile({ userId: user.id, guildId: guild.id });
        const settings = { ...(cached.profile.settings ?? {}), quiet: on };
        cached.profile.settings = settings;
        commitProfileChanges({
            userId: user.id, guildId: guild.id, profile: cached.profile,
            changes: { ...(cached.pendingChanges ?? {}), settings } as PendingProfileChanges,
            baseline: { xp: cached.profile.xp, gold: cached.profile.gold },
        });
        await interaction.reply({
            content: on ? "🔕 Quiet is on: announcements about you still post, but won't ping you." : "🔔 Quiet is off: you'll be pinged by announcements about you again.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    if (sub === "view") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const themeColor = (config.style.mainThemeColor || "#00AE86") as ColorResolvable;

        const embed = new EmbedBuilder()
            .setTitle("⚙️ Your Settings")
            .setColor(themeColor)
            .addFields(
                {
                    name: "🔒 Privacy",
                    value: [
                        `**Inventory:** ${privDisplay(s.inventoryPrivate)}`,
                        `**Gold:** ${privDisplay(s.goldPrivate)}`,
                        `**XP/Level:** ${privDisplay(s.xpPrivate)}`,
                        `**Profile:** ${privDisplay(s.profilePrivate)}`,
                    ].join("\n"),
                },
                {
                    name: "🔔 Notifications",
                    value: [
                        `**DM on inbound trade offer:** ${notifDisplay(s.dmOnTradeInbound)}`,
                        `**Quiet (no pings from announcements):** ${s.quiet ? "🔕 On" : "🔔 Off"}`,
                    ].join("\n"),
                },
            )
            .setFooter({ text: "Use /settings update to change these, and /settings quiet for pings" });

        await interaction.editReply({ embeds: [embed] });
        return;
    }

    if (sub === "update") {
        const modal = new ModalBuilder()
            .setCustomId("settings:modal:update")
            .setTitle("Update Your Settings");

        const makeInput = (id: keyof UserSettings, label: string, current: boolean) =>
            new TextInputBuilder()
                .setCustomId(id)
                .setLabel(label)
                .setStyle(TextInputStyle.Short)
                .setValue(String(current))
                .setPlaceholder("true / false")
                .setRequired(true)
                .setMinLength(1)
                .setMaxLength(5);

        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                makeInput("inventoryPrivate", "Inventory private? (true = priv, false = pub)", s.inventoryPrivate)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                makeInput("goldPrivate", "Gold private? (true = priv, false = pub)", s.goldPrivate)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                makeInput("xpPrivate", "XP/Level private? (true = priv, false = pub)", s.xpPrivate)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                makeInput("profilePrivate", "Profile private? (true = priv, false = pub)", s.profilePrivate)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                makeInput("dmOnTradeInbound", "DM on inbound trade offer? (true/false)", s.dmOnTradeInbound)
            ),
        );

        await interaction.showModal(modal);
        return;
    }

    await interaction.reply({ content: "Invalid subcommand.", flags: MessageFlags.Ephemeral });
}

// ─── Modal submit ──────────────────────────────────────────────────────────────

export async function handleSettingsModal(interaction: ModalSubmitInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply({ content: "This can only be used in a server.", flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { user } = await getOrCreateDbUser({ discordUserId: interaction.user.id });
    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    const cached = await getOrCreateProfile({ userId: user.id, guildId: guild.id });
    const profile = cached.profile;

    const newSettings: Required<UserSettings> = {
        inventoryPrivate: parseBool(interaction.fields.getTextInputValue("inventoryPrivate")),
        goldPrivate:      parseBool(interaction.fields.getTextInputValue("goldPrivate")),
        xpPrivate:        parseBool(interaction.fields.getTextInputValue("xpPrivate")),
        profilePrivate:   parseBool(interaction.fields.getTextInputValue("profilePrivate")),
        dmOnTradeInbound: parseBool(interaction.fields.getTextInputValue("dmOnTradeInbound")),
        // Not on the form (Discord allows five fields); kept as it was.
        quiet: !!profile.settings?.quiet,
    };

    const updatedProfile: DbUserGuildProfile = { ...profile, settings: newSettings };
    const pending: PendingProfileChanges = { ...(cached.pendingChanges ?? {}), settings: newSettings };

    commitProfileChanges({
        userId: user.id,
        guildId: guild.id,
        profile: updatedProfile,
        changes: pending,
        baseline: { xp: profile.xp, gold: profile.gold },
    });

    const themeColor = (config.style.mainThemeColor || "#00AE86") as ColorResolvable;

    const embed = new EmbedBuilder()
        .setTitle("✅ Settings Updated")
        .setColor(themeColor)
        .addFields(
            {
                name: "🔒 Privacy",
                value: [
                    `**Inventory:** ${privDisplay(newSettings.inventoryPrivate)}`,
                    `**Gold:** ${privDisplay(newSettings.goldPrivate)}`,
                    `**XP/Level:** ${privDisplay(newSettings.xpPrivate)}`,
                    `**Profile:** ${privDisplay(newSettings.profilePrivate)}`,
                ].join("\n"),
            },
            {
                name: "🔔 Notifications",
                value: `**DM on inbound trade:** ${notifDisplay(newSettings.dmOnTradeInbound)}`,
            },
        );

    await interaction.editReply({ embeds: [embed] });
}
