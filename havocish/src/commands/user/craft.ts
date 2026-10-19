import type { AutocompleteInteraction, ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SectionBuilder, SlashCommandBuilder } from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateProfile } from "../../cache/profileService.js";
import { respondFiltered } from "../../ui/autocomplete.js";
import { accentColor, pageOf, pagerButtons } from "../../ui/pager.js";
import { managerSetupRows } from "../../ui/dashboardLinks.js";
import { itemLabel } from "../../ui/gathering/run.js";
import { skillProgress } from "../../player/gathering.js";
import { craftOnce, enabledStations, recipeState, stationProgress } from "../../player/crafting.js";
import type { CraftingStation } from "../../types/crafting.js";
import type { GuildConfig } from "../../types/guild.js";
import type { DbUserGuildProfile } from "../../types/userprofile.js";
import { bar } from "./me.js";

export const data = new SlashCommandBuilder()
    .setName("craft")
    .setDescription("Craft at one of this server's stations")
    .addStringOption((o) => o.setName("station").setDescription("Where to craft").setRequired(true).setAutocomplete(true));

/** Every word a player sees. Owners override any of them per station. */
const WORDS = { craft: "Craft", made: "Crafted", masterwork: "✨ Masterwork!" };

function findStation(config: GuildConfig, typed: string): CraftingStation | undefined {
    const all = enabledStations(config);
    const t = typed.trim().toLowerCase();
    return all.find((s) => s.id === typed) ?? all.find((s) => s.name.toLowerCase() === t);
}

/** The station's recipe list for one member: what they can make, what they're missing, what's locked. */
function render(ownerId: string, station: CraftingStation, profile: DbUserGuildProfile, config: GuildConfig, page: number, status?: string) {
    const w = { ...WORDS, ...(station.words ?? {}) };
    const mine = stationProgress(profile, station.id);
    const { level, into, span } = skillProgress(mine.xp, config);
    const recipes = Object.values(station.recipes ?? {}).sort((a, b) => (a.minSkill ?? 1) - (b.minSkill ?? 1));
    const shelf = pageOf(recipes, page);
    const goldIcon = config.style.gold.icon || "💰";

    const container = new ContainerBuilder()
        .setAccentColor(accentColor(config.style.mainThemeColor))
        .addTextDisplayComponents((t) => t.setContent([
            `## ${station.emoji} ${station.name}`,
            `**${station.skillName} ${level}** ${span ? `\`${bar(into / span)}\` ${into} / ${span}` : "max"}`,
            ...(status ? [`-# ${status}`] : []),
        ].join("\n")))
        .addSeparatorComponents((s) => s);

    if (!recipes.length) container.addTextDisplayComponents((t) => t.setContent("_No recipes here yet._"));
    for (const recipe of shelf.items) {
        const state = recipeState(recipe, profile, config, level, mine.known ?? []);
        const hiddenNow = state.locked === "hidden";
        const title = hiddenNow
            ? `**???** · ${station.skillName} ${recipe.minSkill ?? 1}`
            : `**${itemLabel(config, recipe.output.itemId)}**${(recipe.output.quantity ?? 1) > 1 ? ` ×${recipe.output.quantity}` : ""}` +
              (state.locked === "skill" ? ` · 🔒 ${station.skillName} ${recipe.minSkill}` : "");
        const needs = hiddenNow ? "-# An undiscovered recipe." : `-# ${[
            ...state.inputs.map((i) => `${i.have >= i.need ? "" : "❌ "}${itemLabel(config, i.itemId)} ${Math.min(i.have, i.need)}/${i.need}`),
            ...(state.gold.need ? [`${state.gold.have >= state.gold.need ? "" : "❌ "}${goldIcon} ${state.gold.need}`] : []),
        ].join(" · ")}`;
        container.addSectionComponents(new SectionBuilder()
            .addTextDisplayComponents((t) => t.setContent(`${title}\n${needs}`))
            .setButtonAccessory((b) => b
                .setCustomId(`craft:make:${ownerId}:${station.id}:${recipe.id}:${shelf.page}`)
                .setLabel(w.craft)
                .setStyle(ButtonStyle.Success)
                .setDisabled(!!state.locked || !state.affordable)));
    }

    const pager = pagerButtons((p) => `craft:page:${ownerId}:${station.id}:${p}`, shelf.page, shelf.pages);
    const rows = pager.length ? [new ActionRowBuilder<ButtonBuilder>().addComponents(...pager)] : [];
    return { components: [container, ...rows], flags: MessageFlags.IsComponentsV2 as const };
}

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) {
        await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
        return;
    }
    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    if (!enabledStations(config).length) {
        await interaction.reply({
            content: "Crafting isn't set up on this server yet.",
            components: managerSetupRows(interaction, "crafting", "Set up crafting"),
            flags: MessageFlags.Ephemeral,
        });
        return;
    }
    const station = findStation(config, interaction.options.getString("station", true));
    if (!station) {
        await interaction.reply({ content: "That isn't one of this server's stations. Pick one from the list.", flags: MessageFlags.Ephemeral });
        return;
    }
    const { user } = await getOrCreateDbUser({ discordUserId: interaction.user.id, username: interaction.user.username });
    const { profile } = await getOrCreateProfile({ userId: user.id, guildId: guild.id });
    const view = render(interaction.user.id, station, profile, config, 0);
    await interaction.reply({ ...view, flags: view.flags | MessageFlags.Ephemeral });
}

export async function handleCraftButton(interaction: ButtonInteraction) {
    const [, action, ownerId, stationId, a, b] = interaction.customId.split(":");
    if (interaction.user.id !== ownerId || !interaction.guildId) {
        await interaction.reply({ content: "That's someone else's crafting. Open your own with `/craft`.", flags: MessageFlags.Ephemeral });
        return;
    }
    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    const station = enabledStations(config).find((s) => s.id === stationId);
    if (!station) {
        await interaction.update({ components: [new ContainerBuilder().addTextDisplayComponents((t) => t.setContent("This station is closed."))], flags: MessageFlags.IsComponentsV2 });
        return;
    }
    const { user } = await getOrCreateDbUser({ discordUserId: interaction.user.id });

    if (action === "page") {
        const { profile } = await getOrCreateProfile({ userId: user.id, guildId: guild.id });
        await interaction.update(render(ownerId, station, profile, config, Number(a)));
        return;
    }

    const recipe = station.recipes?.[a ?? ""];
    const page = Number(b) || 0;
    let status: string;
    if (!recipe) {
        status = "That recipe was removed.";
    } else {
        const w = { ...WORDS, ...(station.words ?? {}) };
        const result = await craftOnce({ userId: user.id, guildId: guild.id, config, station, recipe });
        if (!result.ok) status = result.message;
        else {
            status = `${result.masterwork ? `${w.masterwork} ` : ""}${w.made} ${itemLabel(config, result.gave.itemId, result.gave.quantity)} · +${result.xp} ${station.skillName} XP`;
            if (result.skillAfter > result.skillBefore) status += ` · **${station.skillName} ${result.skillAfter}!**`;
        }
    }
    const { profile } = await getOrCreateProfile({ userId: user.id, guildId: guild.id });
    await interaction.update(render(ownerId, station, profile, config, page, status));
}

export async function autocomplete(interaction: AutocompleteInteraction) {
    if (!interaction.guildId) return;
    const { config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    return respondFiltered(interaction, enabledStations(config).map((s) => ({ name: `${s.emoji} ${s.name}`, value: s.id })));
}
