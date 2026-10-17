import type { ButtonInteraction, ChatInputCommandInteraction, ColorResolvable } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import type { GuildConfig } from "../../types/guild.js";
import { dashboardButton } from "../../ui/dashboardLinks.js";

/**
 * A short guide to the bot, one page per topic, flipped with buttons. Pages
 * use the server's own currency names and say when a feature is turned off
 * here, so the guide never sends a member to a command that will refuse them.
 */

export const data = new SlashCommandBuilder()
    .setName("help")
    .setDescription("How havocish works and which commands to use");

type Page = "start" | "combat" | "items" | "social" | "owner";

const TABS: Array<{ page: Page; label: string; emoji: string }> = [
    { page: "start", label: "Getting started", emoji: "🌱" },
    { page: "combat", label: "Combat", emoji: "⚔️" },
    { page: "items", label: "Items", emoji: "🎒" },
    { page: "social", label: "Quests & friends", emoji: "📜" },
    { page: "owner", label: "Server owners", emoji: "🛠️" },
];

const off = (feature: string) => `*${feature} is turned off in this server.*`;

function pageBody(page: Page, config: GuildConfig): { title: string; lines: string[] } {
    const xp = `${config.style.xp.icon || "⭐"} ${config.style.xp.name || "XP"}`;
    const gold = `${config.style.gold.icon || "💰"} ${config.style.gold.name || "gold"}`;
    const combatOn = config.combat.enabled;

    switch (page) {
        case "start":
            return {
                title: "🌱 Getting started",
                lines: [
                    `Chat in this server to earn ${xp}, level up, and collect ${gold}.`,
                    "",
                    "`/me` your character at a glance: HP, stats and gear",
                    "`/profile` your character card to show off: level, gold and streak",
                    "`/daily` claim your daily reward. Come back every day to build a streak",
                    "`/levels` how levels work here and what you need for the next one",
                    "`/leaderboard` the top players in this server",
                    "",
                    "Use the buttons below to see what else you can do.",
                ],
            };
        case "combat":
            return {
                title: "⚔️ Combat",
                lines: combatOn
                    ? [
                        "`/fight` battle an enemy for XP, gold and loot. Pick your moves turn by turn",
                        "`/duel @someone` challenge another member, with gold on the line if you like",
                        "`/equip` and `/unequip` put on gear. Better gear means more HP, attack and defence",
                        "",
                        config.combat.encounters?.enabled
                            ? "👾 **Wild enemies** sometimes appear while people chat. Click **Fight** to take one on before it wanders off."
                            : "",
                        bossLine(config),
                        "",
                        "Lost a fight? Your HP stays low until you heal: `/daily` restores it to full, or drink a potion with `/use`.",
                    ].filter((l, i, all) => l !== "" || all[i - 1] !== "")
                    : [off("Combat")],
            };
        case "items":
            return {
                title: "🎒 Items",
                lines: config.shop?.enabled
                    ? [
                        `\`/shop\` browse and buy items with your ${gold}`,
                        "`/inventory` see what you own, and sell what you don't need",
                        "`/item` look up exactly what an item does",
                        "`/use` drink a potion or use an item",
                        "`/equip` wear gear from your inventory",
                    ]
                    : [off("The shop"), "", "`/inventory` still shows what you own."],
            };
        case "social":
            return {
                title: "📜 Quests & friends",
                lines: [
                    config.quests?.enabled ? "`/quests` take on quests and claim their rewards" : off("Quests"),
                    config.achievements?.enabled
                        ? "🏆 **Achievements** unlock on their own as you play. See yours with the button on `/profile`."
                        : off("Achievements"),
                    "",
                    "`/trade offer` swap items and gold with someone, safely",
                    "`/gift @someone` give an item away",
                    "`/settings` your own preferences, like keeping your profile private",
                ],
            };
        case "owner":
            return {
                title: "🛠️ For server owners",
                lines: [
                    "Set everything up on the **dashboard**: XP, levels, the shop, enemies, quests and how the bot looks.",
                    "New here? Use a **starter pack** there to fill the shop, enemies and quests in one click.",
                    "",
                    "`/boss summon` call a world boss for the whole server to fight",
                    "`/set` change a member's XP, level, gold or streak",
                    "`/admin-inv` view, give or take a member's items",
                    "`/config-*` the same settings as the dashboard, from Discord",
                ],
            };
    }
}

function bossLine(config: GuildConfig) {
    const hasBosses = Object.values(config.combat.enemies ?? {}).some((e) => e.boss);
    if (!hasBosses) return "";
    return config.combat.bosses?.enabled
        ? "👑 **World bosses** sometimes appear. Everyone attacks together and splits the rewards by damage."
        : "👑 **World bosses** appear when an owner summons one. Everyone attacks together and splits the rewards by damage.";
}

function render(page: Page, config: GuildConfig, guildId: string, isOwner: boolean) {
    const { title, lines } = pageBody(page, config);
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(config.style.mainThemeColor as ColorResolvable ?? "#00AE86")
        .setDescription(lines.join("\n"));

    const tabs = new ActionRowBuilder<ButtonBuilder>().addComponents(
        TABS.filter((t) => t.page !== "owner" || isOwner).map((t) =>
            new ButtonBuilder()
                .setCustomId(`help:${t.page}`)
                .setLabel(t.label)
                .setEmoji(t.emoji)
                .setStyle(t.page === page ? ButtonStyle.Primary : ButtonStyle.Secondary),
        ),
    );
    const rows = [tabs];
    if (page === "owner" && isOwner) {
        rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(dashboardButton(guildId, undefined, "Open dashboard")));
    }
    return { embeds: [embed], components: rows };
}

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inCachedGuild()) {
        await interaction.reply({ content: "Use `/help` in a server to see how havocish works there.", flags: MessageFlags.Ephemeral });
        return;
    }
    const { config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    const isOwner = interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild);
    await interaction.reply({ ...render("start", config, interaction.guildId, isOwner), flags: MessageFlags.Ephemeral });
}

export async function handleHelpButton(interaction: ButtonInteraction) {
    if (!interaction.inCachedGuild()) return;
    const page = interaction.customId.slice("help:".length) as Page;
    if (!TABS.some((t) => t.page === page)) return;
    const { config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    const isOwner = interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild);
    await interaction.update(render(page === "owner" && !isOwner ? "start" : page, config, interaction.guildId, isOwner));
}
