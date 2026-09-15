import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type Interaction } from "discord.js";

/**
 * Where the dashboard lives. Optional: it defaults to production, so links work
 * with no setup. Point it at http://localhost:3000 when testing the web app.
 */
const DASHBOARD_URL = (process.env.DASHBOARD_URL?.trim() || "https://havocish.com").replace(/\/+$/, "");

/** Pages under /dashboard/<guildId>/ in the web app. */
export type DashboardPage = "xp" | "levels" | "shop" | "combat" | "quests" | "achievements" | "styles" | "logging";

export function dashboardButton(guildId: string, page?: DashboardPage, label = "Open dashboard") {
    return new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel(label)
        .setURL(`${DASHBOARD_URL}/dashboard/${guildId}${page ? `/${page}` : ""}`);
}

/**
 * The dashboard only lets the server owner in (requireGuildOwner in
 * web/app/lib/discord.ts), so a link shown to anyone else leads to a page that
 * turns them away.
 */
export function isOwner(interaction: Interaction) {
    return !!interaction.guild && interaction.guild.ownerId === interaction.user.id;
}

/** A "set this up" link for the server owner, or no rows for anyone else. */
export function ownerSetupRows(interaction: Interaction, page: DashboardPage, label: string) {
    if (!interaction.guildId || !isOwner(interaction)) return [];
    return [new ActionRowBuilder<ButtonBuilder>().addComponents(dashboardButton(interaction.guildId, page, label))];
}
