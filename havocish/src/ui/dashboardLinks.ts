import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, type Interaction } from "discord.js";

/**
 * Where the dashboard lives. Optional: it defaults to production, so links work
 * with no setup. Point it at http://localhost:3000 when testing the web app.
 */
const DASHBOARD_URL = (process.env.DASHBOARD_URL?.trim() || "https://havocish.com").replace(/\/+$/, "");

/** Pages under /dashboard/<guildId>/ in the web app. */
export type DashboardPage = "setup" | "presets" | "xp" | "levels" | "leveling" | "shop" | "combat" | "quests" | "achievements" | "styles" | "logging" | "gathering" | "items" | "crafting";

export function dashboardButton(guildId: string, page?: DashboardPage, label = "Open dashboard") {
    return new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel(label)
        .setURL(`${DASHBOARD_URL}/dashboard/${guildId}${page ? `/${page}` : ""}`);
}

/**
 * The dashboard lets in the owner and Manage Server members (requireGuildManager
 * in web/app/lib/discord.ts), so a link shown to anyone else leads to a page
 * that turns them away. Administrator implies Manage Server here.
 */
export function canManage(interaction: Interaction) {
    return !!interaction.guild && !!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

/** A "set this up" link for anyone who can use the dashboard, or no rows for anyone else. */
export function managerSetupRows(interaction: Interaction, page: DashboardPage, label: string) {
    if (!interaction.guildId || !canManage(interaction)) return [];
    return [new ActionRowBuilder<ButtonBuilder>().addComponents(dashboardButton(interaction.guildId, page, label))];
}
