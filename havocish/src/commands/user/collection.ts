import type { ButtonInteraction, ChatInputCommandInteraction, StringSelectMenuInteraction } from "discord.js";
import { ActionRowBuilder, EmbedBuilder, MessageFlags, SlashCommandBuilder, StringSelectMenuBuilder, type ColorResolvable } from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateProfile } from "../../cache/profileService.js";
import { managerSetupRows } from "../../ui/dashboardLinks.js";
import { collectionSets, entryDone, setProgress } from "../../player/collections.js";
import type { CollectionConfig, GuildConfig } from "../../types/guild.js";
import type { DbUserGuildProfile } from "../../types/userprofile.js";

export const data = new SlashCommandBuilder()
    .setName("collection")
    .setDescription("This server's collections: what you've found and beaten, and what's left");

function bar(done: number, total: number, width = 12): string {
    const filled = total ? Math.round((done / total) * width) : 0;
    return "▰".repeat(filled) + "▱".repeat(width - filled);
}

/** The next milestone not yet reached, worded: "next reward at 6". */
function nextMilestone(set: CollectionConfig, done: number, total: number): string {
    const next = (set.milestones ?? []).map((m) => Math.min(Math.max(1, m.at), total)).filter((at) => at > done).sort((a, b) => a - b)[0];
    return next ? ` · next reward at ${next}` : "";
}

/** Every collection with its progress, and a picker to open one. */
function overview(profile: DbUserGuildProfile, config: GuildConfig, name: string) {
    const sets = collectionSets(config);
    const embed = new EmbedBuilder()
        .setTitle(`📖 ${name}'s collections`)
        .setColor(config.style.mainThemeColor as ColorResolvable ?? "#00AE86");
    const lines = sets.map((s) => {
        const p = setProgress(s, profile, config);
        return `${p.complete ? "✅" : s.emoji} **${s.name}**\n\`${bar(p.done, p.total)}\` ${p.done} / ${p.total}${p.complete ? " · complete" : nextMilestone(s, p.done, p.total)}`;
    });
    embed.setDescription(lines.join("\n\n").slice(0, 4000));
    const options = sets.slice(0, 25).map((s) => {
        const p = setProgress(s, profile, config);
        return {
            label: s.name.slice(0, 100), value: s.id, description: `${p.done}/${p.total}`,
            ...(/^\p{Extended_Pictographic}/u.test(s.emoji) && { emoji: s.emoji }),
        };
    });
    return {
        embeds: [embed],
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder().setCustomId("collection:open").setPlaceholder("Open a collection…").addOptions(options),
        )],
    };
}

/** One collection: each entry, done or ???, and its milestones. */
function detail(set: CollectionConfig, profile: DbUserGuildProfile, config: GuildConfig) {
    const items = config.shop?.items ?? {};
    const enemies = config.combat?.enemies ?? {};
    const p = setProgress(set, profile, config);
    const entries = (set.entries ?? []).flatMap((e) => {
        const def = e.kind === "item" ? items[e.id] : enemies[e.id];
        if (!def) return [];
        return [entryDone(e, profile, config)
            ? `✅ ${def.emoji ?? "•"} ${def.name}${e.kind === "enemy" ? " *(beaten)*" : ""}`
            : `❔ ???${e.kind === "enemy" ? " *(an enemy)*" : ""}`];
    });
    const goldName = config.style.gold.name || "gold";
    const milestones = (set.milestones ?? []).slice().sort((a, b) => a.at - b.at).map((m) => {
        const at = Math.min(Math.max(1, m.at), p.total);
        const rewards = m.actions.map((a) =>
            a.type === "giveGold" ? `${a.amount ?? 0} ${goldName}`
            : a.type === "giveCombatXp" ? `${a.amount ?? 0} Combat XP`
            : a.type === "giveItem" ? `${items[a.itemId ?? ""]?.emoji ?? ""} ${items[a.itemId ?? ""]?.name ?? "an item"}`.trim()
            : a.type === "assignRole" ? `<@&${a.roleId}>` : "").filter(Boolean);
        return `${p.done >= at ? "✅" : "▫️"} **${at === p.total ? "Complete" : at}:** ${rewards.join(", ") || "—"}`;
    });
    return new EmbedBuilder()
        .setTitle(`${set.emoji} ${set.name}`)
        .setColor(config.style.mainThemeColor as ColorResolvable ?? "#00AE86")
        .setDescription([
            ...(set.description ? [`*${set.description}*`, ""] : []),
            `\`${bar(p.done, p.total)}\` **${p.done} / ${p.total}**`,
            "",
            ...entries,
            ...(milestones.length ? ["", "**Rewards**", ...milestones] : []),
        ].join("\n").slice(0, 4000));
}

async function load(discordUserId: string, discordGuildId: string) {
    const { user } = await getOrCreateDbUser({ discordUserId });
    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId });
    const { profile } = await getOrCreateProfile({ userId: user.id, guildId: guild.id });
    return { profile, config };
}

/** /collection, and the Collection button on /me (which opens it privately). */
export async function execute(interaction: ChatInputCommandInteraction | ButtonInteraction): Promise<void> {
    if (!interaction.inGuild()) {
        await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
        return;
    }
    const { profile, config } = await load(interaction.user.id, interaction.guildId);
    if (!collectionSets(config).length) {
        await interaction.reply({
            content: "This server has no collections yet.",
            components: managerSetupRows(interaction, "collections", "Make collections on the dashboard"),
            flags: MessageFlags.Ephemeral,
        });
        return;
    }
    // Public from the command, so a near-complete collection can be shown off; private from /me's button.
    await interaction.reply({ ...overview(profile, config, interaction.user.displayName), ...(interaction.isButton() && { flags: MessageFlags.Ephemeral }) });
}

/** The picker: opens a collection privately, with the progress of whoever picked. */
export async function handleCollectionSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    if (!interaction.guildId) return;
    const { profile, config } = await load(interaction.user.id, interaction.guildId);
    const set = config.collections?.sets?.[interaction.values[0] ?? ""];
    await interaction.reply(set
        ? { embeds: [detail(set, profile, config)], flags: MessageFlags.Ephemeral }
        : { content: "That collection isn't here any more.", flags: MessageFlags.Ephemeral });
}
