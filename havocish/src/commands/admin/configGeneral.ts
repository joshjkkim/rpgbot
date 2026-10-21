import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { setGuildConfigFlag } from "../../db/guilds.js";
import { dashboardButton } from "../../ui/dashboardLinks.js";
import { accentColor } from "../../ui/pager.js";
import type { GuildConfig } from "../../types/guild.js";

export const data = new SlashCommandBuilder()
    .setName("config")
    .setDescription("Turn havocish features on or off. Everything else is on the dashboard.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

/** The quick switches. Content (items, enemies, quests...) is edited on the dashboard. */
const TOGGLES = [
    { key: "shop", label: "Shop", emoji: "🛒", path: ["shop", "enabled"] },
    { key: "gifting", label: "Gifting", emoji: "🎁", path: ["shop", "gifting", "enabled"] },
    { key: "quests", label: "Quests", emoji: "📜", path: ["quests", "enabled"] },
    { key: "achievements", label: "Achievements", emoji: "🏅", path: ["achievements", "enabled"] },
    { key: "leveling", label: "Leveling", emoji: "📈", path: ["xp", "enabled"] },
    { key: "voice", label: "Voice XP", emoji: "🎙️", path: ["xp", "vc", "enabled"] },
    { key: "combat", label: "Combat", emoji: "⚔️", path: ["combat", "enabled"] },
    { key: "duels", label: "Duels", emoji: "🤺", path: ["combat", "pvp", "enabled"], needsCombat: true },
    { key: "encounters", label: "Wild encounters", emoji: "🐺", path: ["combat", "encounters", "enabled"], needsCombat: true },
    { key: "bosses", label: "World bosses", emoji: "👑", path: ["combat", "bosses", "enabled"], needsCombat: true },
    { key: "gathering", label: "Gathering", emoji: "⛏️", path: ["gathering", "enabled"] },
    { key: "crafting", label: "Crafting", emoji: "⚒️", path: ["crafting", "enabled"] },
    { key: "logging", label: "Event log", emoji: "🗒️", path: ["logging", "enabled"] },
] as const;

const isOn = (config: GuildConfig, path: readonly string[]) =>
    Boolean(path.reduce<any>((node, key) => node?.[key], config));

function render(config: GuildConfig, guildId: string, status?: string) {
    const combatOn = isOn(config, ["combat", "enabled"]);
    const buttons = TOGGLES.map((t) => {
        const on = isOn(config, t.path);
        return new ButtonBuilder()
            .setCustomId(`config:toggle:${t.key}`)
            .setEmoji(t.emoji)
            .setLabel(`${t.label} · ${on ? "On" : "Off"}`)
            .setStyle(on ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled("needsCombat" in t && !combatOn);
    });

    const container = new ContainerBuilder()
        .setAccentColor(accentColor(config.style.mainThemeColor))
        .addTextDisplayComponents((t) => t.setContent(
            "## ⚙️ havocish settings\n" +
            "Click a feature to turn it on or off. Items, enemies, quests, levels and everything else are set up on the dashboard." +
            (combatOn ? "" : "\n-# Duels, encounters and world bosses need Combat on."),
        ));
    for (let i = 0; i < buttons.length; i += 5) {
        container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
    }
    container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(dashboardButton(guildId)));
    if (status) container.addTextDisplayComponents((t) => t.setContent(`-# ${status}`));

    return { components: [container], flags: MessageFlags.IsComponentsV2 as const };
}

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) {
        await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
        return;
    }
    const { config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    const view = render(config, interaction.guildId);
    await interaction.reply({ ...view, flags: view.flags | MessageFlags.Ephemeral });
}

export async function handleConfigButton(interaction: ButtonInteraction) {
    // The panel is ephemeral, but permissions can change while it is open.
    if (!interaction.inGuild() || !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: "You need Manage Server to change settings.", flags: MessageFlags.Ephemeral });
        return;
    }
    const toggle = TOGGLES.find((t) => interaction.customId === `config:toggle:${t.key}`);
    if (!toggle) return;

    // Decide from the database, not the possibly minute-old cache, so the click
    // always flips what is really stored.
    const { config: before } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId, fresh: true });
    const next = !isOn(before, toggle.path);
    await setGuildConfigFlag(interaction.guildId, [...toggle.path], next);

    const { config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    await interaction.update(render(config, interaction.guildId, `${toggle.emoji} ${toggle.label} turned ${next ? "on" : "off"}.`));
}
