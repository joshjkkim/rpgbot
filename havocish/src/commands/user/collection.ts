import type { ChatInputCommandInteraction, StringSelectMenuInteraction } from "discord.js";
import { ActionRowBuilder, EmbedBuilder, MessageFlags, SlashCommandBuilder, StringSelectMenuBuilder, type ColorResolvable } from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateProfile } from "../../cache/profileService.js";
import { collectionProgress, type CollectionSource } from "../../player/collection.js";
import type { GuildConfig } from "../../types/guild.js";
import type { DbUserGuildProfile } from "../../types/userprofile.js";

export const data = new SlashCommandBuilder()
    .setName("collection")
    .setDescription("Every item you've found, and what's still out there");

const KINDS: { kind: CollectionSource["kind"]; title: string }[] = [
    { kind: "enemy", title: "⚔️ Enemies" },
    { kind: "gathering", title: "🧭 Gathering" },
    { kind: "crafting", title: "🔨 Crafting" },
    { kind: "shop", title: "🛒 Shop" },
];

function bar(found: number, total: number, width = 12): string {
    const filled = total ? Math.round((found / total) * width) : 0;
    return "▰".repeat(filled) + "▱".repeat(width - filled);
}

/** The overview: a count for every source, grouped, and a picker to open one. */
function overview(profile: DbUserGuildProfile, config: GuildConfig, ownerId: string, name: string) {
    const p = collectionProgress(profile, config);
    const embed = new EmbedBuilder()
        .setTitle(`📖 ${name}'s collection`)
        .setColor(config.style.mainThemeColor as ColorResolvable ?? "#00AE86")
        .setDescription(`\`${bar(p.found, p.total)}\` **${p.found} / ${p.total}** found`);
    for (const { kind, title } of KINDS) {
        const lines = p.sources.filter((s) => s.kind === kind).map((s) => `${s.found === s.itemIds.length ? "✅" : s.emoji} ${s.name} · ${s.found}/${s.itemIds.length}`);
        if (lines.length) embed.addFields({ name: title, value: lines.join("\n").slice(0, 1024), inline: true });
    }
    if (p.total === 0) embed.setDescription("This server has no items to collect yet.");
    const options = p.sources.slice(0, 25).map((s) => ({
        label: s.name.slice(0, 100), value: s.id, description: `${s.found}/${s.itemIds.length} found`,
        ...(/^\p{Extended_Pictographic}/u.test(s.emoji) && { emoji: s.emoji }),
    }));
    const components = options.length ? [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId(`collection:open:${ownerId}`).setPlaceholder("Look at a source…").addOptions(options),
    )] : [];
    return { embeds: [embed], components };
}

/** One source: what's found, by name, and ??? for the rest. */
function sourceView(profile: DbUserGuildProfile, config: GuildConfig, sourceId: string) {
    const p = collectionProgress(profile, config);
    const s = p.sources.find((x) => x.id === sourceId);
    if (!s) return null;
    const items = config.shop?.items ?? {};
    const lines = s.itemIds.map((id) => p.has(id) ? `✅ ${items[id]?.emoji ?? "•"} ${items[id]?.name ?? id}` : "❔ ???");
    return new EmbedBuilder()
        .setTitle(`${s.emoji} ${s.name}`)
        .setColor(config.style.mainThemeColor as ColorResolvable ?? "#00AE86")
        .setDescription([`\`${bar(s.found, s.itemIds.length)}\` **${s.found} / ${s.itemIds.length}**`, "", ...lines].join("\n").slice(0, 4000));
}

async function load(discordUserId: string, discordGuildId: string) {
    const { user } = await getOrCreateDbUser({ discordUserId });
    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId });
    const { profile } = await getOrCreateProfile({ userId: user.id, guildId: guild.id });
    return { profile, config };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild()) {
        await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
        return;
    }
    const { profile, config } = await load(interaction.user.id, interaction.guildId);
    // Public, so a near-complete collection can be shown off.
    await interaction.reply(overview(profile, config, interaction.user.id, interaction.user.displayName));
}

/** The source picker: opens one source privately, for whoever picked. */
export async function handleCollectionSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    if (!interaction.guildId) return;
    const { profile, config } = await load(interaction.user.id, interaction.guildId);
    const view = sourceView(profile, config, interaction.values[0] ?? "");
    await interaction.reply(view
        ? { embeds: [view], flags: MessageFlags.Ephemeral }
        : { content: "That's not here any more.", flags: MessageFlags.Ephemeral });
}
