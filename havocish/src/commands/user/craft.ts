import { checkProgress } from "../../player/collections.js";
import { nextCraftLine } from "../../player/nextSteps.js";
import { questCompleteLines } from "../../player/quests.js";
import type { AutocompleteInteraction, ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { announceRareFinds } from "../../ui/rareFinds.js";
import { rpgLevelUpCard } from "../../ui/rpgLevelUpCard.js";
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SectionBuilder, SlashCommandBuilder } from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateProfile } from "../../cache/profileService.js";
import { respondFiltered } from "../../ui/autocomplete.js";
import { accentColor, pageOf, pagerButtons } from "../../ui/pager.js";
import { managerSetupRows } from "../../ui/dashboardLinks.js";
import { itemLabel } from "../../ui/gathering/run.js";
import { skillLevel, skillProgress } from "../../player/gathering.js";
import {
    FORGE_CELLS, collectTimed, craftOnce, enabledStations, forgeRules, judgeForge, placeForge, recipeMinutes, recipeState, slotReady, startTimed, stationProgress, timedSlotCount,
    type CraftResult, type ForgeOutcome, type Harvest,
} from "../../player/crafting.js";
import type { CraftingStation, Recipe } from "../../types/crafting.js";
import type { GuildConfig } from "../../types/guild.js";
import type { DbUserGuildProfile } from "../../types/userprofile.js";
import { bar } from "./me.js";
import { memberFacts, type MemberFacts } from "../../player/requirements.js";
import { renderStationScene } from "../../ui/canvas/stationScene.js";

export const data = new SlashCommandBuilder()
    .setName("craft")
    .setDescription("Craft at one of this server's stations")
    .addStringOption((o) => o.setName("station").setDescription("Where to craft").setRequired(true).setAutocomplete(true));

/** Every word a player sees. Owners override any of them per station. */
const WORDS = {
    craft: "Craft",
    made: "Crafted",
    masterwork: "✨ Masterwork!",
    strike: "🔨 Strike",
    forging: "Forging",
    ruined: "💥 Ruined!",
    hesitated: "Too slow. The moment passed.",
    // Timed stations.
    start: "Start",
    collect: "Collect",
    empty: "Empty",
    waiting: "ready {time}",
    ready: "Ready!",
    full: "Every slot is in use. Collect something first.",
    started: "Started {item}.",
    collected: "Collected",
    refunded: "A removed recipe gave back what it took.",
    nothing: "Nothing is ready yet.",
};

/** "1h 30m", "2d 4h", "45m". */
export function durationText(minutes: number) {
    const d = Math.floor(minutes / 1440), h = Math.floor((minutes % 1440) / 60), m = minutes % 60;
    return [d && `${d}d`, h && `${h}h`, !d && m && `${m}m`].filter(Boolean).join(" ") || "0m";
}
const fillWord = (word: string, values: Record<string, string>) => word.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);

/** How long each frame of the forge bar shows, and how many full sweeps before it counts as a miss. */
const FORGE_FRAME_MS = 700;
const FORGE_SWEEPS = 2;

type ForgeRun = {
    interaction: ButtonInteraction;
    userId: number;
    guildId: number;
    station: CraftingStation;
    recipe: Recipe;
    page: number;
    place: ReturnType<typeof placeForge>;
    cell: number;
    dir: 1 | -1;
    sweeps: number;
    /** When each frame was on screen, so a strike is judged by what the player saw. */
    frames: { cell: number; shownAt: number }[];
    timer: NodeJS.Timeout | null;
    /** The edit in flight, awaited before the result replaces the bar. */
    pending: Promise<unknown> | null;
};

// ponytail: in memory; a restart mid-forge drops that craft, taking nothing.
const forges = new Map<string, ForgeRun>();
const forgeKey = (discordUserId: string, discordGuildId: string) => `${discordUserId}-${discordGuildId}`;

function renderForge(ownerId: string, run: ForgeRun, config: GuildConfig) {
    const w = { ...WORDS, ...(run.station.words ?? {}) };
    const { place } = run;
    const bar = Array.from({ length: FORGE_CELLS }, (_, i) =>
        i >= place.centreStart && i <= place.centreEnd ? "🟩" : i >= place.zoneStart && i <= place.zoneEnd ? "🟨" : "⬛").join("");
    const marker = Array.from({ length: FORGE_CELLS }, (_, i) => (i === run.cell ? "🔺" : "▪️")).join("");
    const container = new ContainerBuilder()
        .setAccentColor(accentColor(config.style.mainThemeColor))
        .addTextDisplayComponents((t) => t.setContent([
            `## ${run.station.emoji} ${w.forging} ${itemLabel(config, run.recipe.output.itemId)}`,
            bar,
            marker,
            `-# 🟩 for a masterwork, 🟨 to make it. Anywhere else ruins it.`,
        ].join("\n")))
        .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`craft:strike:${ownerId}:${run.station.id}`).setLabel(w.strike).setStyle(ButtonStyle.Danger),
        ));
    return { components: [container], flags: MessageFlags.IsComponentsV2 as const };
}

/** A skill milestone's card, posted publicly under the (private) crafting window, and a rare item's announcement. */
async function skillCard(source: ButtonInteraction, result: CraftResult, station: CraftingStation, config: GuildConfig, items?: { itemId: string; quantity: number }[]) {
    if (!result.ok) return;
    if (source.guildId) await checkProgress({ client: source.client, config, discordUserId: source.user.id, discordGuildId: source.guildId, fallbackChannelId: source.channelId });
    if (!result.ruined) await announceRareFinds({
        client: source.client, config, discordUserId: source.user.id, verb: "made",
        items: items ?? [result.gave], where: `at ${station.emoji} ${station.name}`,
    });
    const card = await rpgLevelUpCard({ config, kind: "skills", user: source.user, label: station.skillName, before: result.skillBefore, after: result.skillAfter });
    if (card) await source.followUp({ content: `<@${source.user.id}> reached **${station.skillName} ${result.skillAfter}**!`, files: [card], allowedMentions: { parse: [] } }).catch(() => null);
}

/** The result line under the recipe list. */
function resultLine(result: CraftResult, station: CraftingStation, config: GuildConfig, hesitated = false) {
    const w = { ...WORDS, ...(station.words ?? {}) };
    if (!result.ok) return result.message;
    if (result.ruined) {
        const lost = result.lost.map((l) => itemLabel(config, l.itemId, l.quantity)).join(", ");
        return `${hesitated ? `${w.hesitated} ` : ""}${w.ruined} ${lost ? `Lost ${lost}.` : "Nothing was lost."}`;
    }
    let line = `${result.masterwork ? `${w.masterwork} ` : ""}${w.made} ${itemLabel(config, result.gave.itemId, result.gave.quantity)} · +${result.xp} ${station.skillName} XP`;
    if (result.skillAfter > result.skillBefore) line += ` · **${station.skillName} ${result.skillAfter}!**`;
    if (result.questsCompleted.length) line += `\n${questCompleteLines(result.questsCompleted)}`;
    if (result.skillAfter > result.skillBefore) {
        const next = nextCraftLine(station, result.skillAfter, config);
        if (next) line += `\n${next}`;
    }
    return line;
}

function findStation(config: GuildConfig, typed: string): CraftingStation | undefined {
    const all = enabledStations(config);
    const t = typed.trim().toLowerCase();
    return all.find((s) => s.id === typed) ?? all.find((s) => s.name.toLowerCase() === t);
}

/** The station's recipe list for one member: what they can make, what they're missing, what's locked. */
function render(ownerId: string, station: CraftingStation, profile: DbUserGuildProfile, config: GuildConfig, page: number, status?: string, facts?: MemberFacts, picture?: AttachmentBuilder | null) {
    const w = { ...WORDS, ...(station.words ?? {}) };
    const timed = station.style === "timed";
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

    const slots = stationProgress(profile, station.id).slots ?? [];
    const full = timed && slots.length >= timedSlotCount(station);
    if (timed) {
        const now = Date.now();
        if (picture) container.addMediaGalleryComponents((m) => m.addItems((i) => i.setURL("attachment://station.png")));
        const lines = Array.from({ length: Math.max(timedSlotCount(station), slots.length) }, (_, n) => {
            const slot = slots[n];
            if (!slot) return `${n + 1}. ${w.empty}`;
            const recipe = station.recipes?.[slot.recipeId];
            const name = recipe ? itemLabel(config, recipe.output.itemId) : "?";
            return `${n + 1}. ${name} · ${slotReady(slot, now) ? `**${w.ready}**` : fillWord(w.waiting, { time: `<t:${Math.ceil(Date.parse(slot.doneAt) / 1000)}:R>` })}`;
        });
        const anyReady = slots.some((slot) => slotReady(slot, now));
        container.addSectionComponents(new SectionBuilder()
            .addTextDisplayComponents((t) => t.setContent(lines.join("\n")))
            .setButtonAccessory((b) => b
                .setCustomId(`craft:collect:${ownerId}:${station.id}:0:${page}`)
                .setLabel(w.collect)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(!anyReady)));
        container.addSeparatorComponents((s) => s);
    }

    if (!recipes.length) container.addTextDisplayComponents((t) => t.setContent("_No recipes here yet._"));
    for (const recipe of shelf.items) {
        const state = recipeState(recipe, profile, config, level, mine.known ?? [], facts);
        const hiddenNow = state.locked === "hidden";
        const title = hiddenNow
            ? `**???** · ${station.skillName} ${recipe.minSkill ?? 1}`
            : `**${itemLabel(config, recipe.output.itemId)}**${(recipe.output.quantity ?? 1) > 1 ? ` ×${recipe.output.quantity}` : ""}` +
              (state.locked === "skill" ? ` · 🔒 ${station.skillName} ${recipe.minSkill}` : "");
        const needs = hiddenNow ? "-# An undiscovered recipe." : `-# ${[
            ...state.inputs.map((i) => `${i.have >= i.need ? "" : "❌ "}${itemLabel(config, i.itemId)} ${Math.min(i.have, i.need)}/${i.need}`),
            ...(state.gold.need ? [`${state.gold.have >= state.gold.need ? "" : "❌ "}${goldIcon} ${state.gold.need}`] : []),
            ...(timed ? [`⏱ ${durationText(recipeMinutes(recipe))}`] : []),
        ].join(" · ")}${state.locked === "requirements" ? `\n-# 🔒 ${state.needs}` : ""}`;
        container.addSectionComponents(new SectionBuilder()
            .addTextDisplayComponents((t) => t.setContent(`${title}\n${needs}`))
            .setButtonAccessory((b) => b
                .setCustomId(`craft:${timed ? "start" : "make"}:${ownerId}:${station.id}:${recipe.id}:${shelf.page}`)
                .setLabel(timed ? w.start : w.craft)
                .setStyle(ButtonStyle.Success)
                .setDisabled(!!state.locked || !state.affordable || full)));
    }

    const pager = pagerButtons((p) => `craft:page:${ownerId}:${station.id}:${p}`, shelf.page, shelf.pages);
    const rows = pager.length ? [new ActionRowBuilder<ButtonBuilder>().addComponents(...pager)] : [];
    return { components: [container, ...rows], files: picture ? [picture] : [], flags: MessageFlags.IsComponentsV2 as const };
}

/** The station's view; a timed station also gets its picture (left out if drawing fails). */
async function view(ownerId: string, station: CraftingStation, profile: DbUserGuildProfile, config: GuildConfig, page: number, status?: string, facts?: MemberFacts) {
    if (station.style !== "timed") return render(ownerId, station, profile, config, page, status, facts);
    const now = Date.now();
    const slots = stationProgress(profile, station.id).slots ?? [];
    const png = await renderStationScene({
        scene: station.timed?.scene, look: station.timed?.look, colours: station.timed?.colours,
        slots: Array.from({ length: Math.max(timedSlotCount(station), slots.length) }, (_, n) => {
            const slot = slots[n];
            if (!slot) return { stage: "empty" as const, progress: 0 };
            const recipe = station.recipes?.[slot.recipeId];
            const total = (recipe ? recipeMinutes(recipe) : 1) * 60_000;
            const symbol = recipe ? config.shop?.items?.[recipe.output.itemId]?.emoji : undefined;
            return slotReady(slot, now)
                ? { stage: "ready" as const, progress: 1, ...(symbol && { symbol }) }
                : { stage: "growing" as const, progress: 1 - (Date.parse(slot.doneAt) - now) / total, ...(symbol && { symbol }) };
        }),
    }, station.timed?.art).catch((err) => { console.error("Station scene failed:", err); return null; });
    return render(ownerId, station, profile, config, page, status, facts, png ? new AttachmentBuilder(png, { name: "station.png" }) : null);
}

function harvestLine(h: Harvest, station: CraftingStation, config: GuildConfig) {
    const w = { ...WORDS, ...(station.words ?? {}) };
    if (!h.gave.length && !h.refunded) return w.nothing;
    return [
        ...(h.gave.length ? [`${w.collected} ${h.gave.map((g) => `${g.masterwork ? "✨ " : ""}${itemLabel(config, g.itemId, g.quantity)}`).join(", ")}${h.xp ? ` · +${h.xp} ${station.skillName} XP` : ""}`] : []),
        ...(h.refunded ? [w.refunded] : []),
    ].join(" ");
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
    const shown = await view(interaction.user.id, station, profile, config, 0, undefined, memberFacts(interaction.member));
    await interaction.reply({ ...shown, flags: shown.flags | MessageFlags.Ephemeral });
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
        await interaction.update({ ...await view(ownerId, station, profile, config, Number(a), undefined, memberFacts(interaction.member)), attachments: [] });
        return;
    }

    if (action === "strike") return strike(interaction, config, false);

    if (action === "start" || action === "collect") {
        const ids = { userId: user.id, guildId: guild.id };
        const facts = memberFacts(interaction.member);
        const w = { ...WORDS, ...(station.words ?? {}) };
        const recipe = station.recipes?.[a ?? ""];
        let status: string;
        let harvest: Awaited<ReturnType<typeof collectTimed>> | null = null;
        if (action === "start") {
            status = !recipe || station.style !== "timed" ? "That recipe was removed."
                : await startTimed({ ...ids, config, station, recipe, ...(facts && { facts }), full: w.full }) ?? fillWord(w.started, { item: itemLabel(config, recipe.output.itemId) });
        } else {
            harvest = await collectTimed({ ...ids, config, station });
            status = harvestLine(harvest, station, config);
        }
        const { profile } = await getOrCreateProfile(ids);
        await interaction.update({ ...await view(ownerId, station, profile, config, Number(b) || 0, status, facts), attachments: [] });
        if (harvest?.gave.length) {
            const g = harvest.gave[0]!;
            await skillCard(interaction, { ok: true, ruined: false, gave: g, masterwork: g.masterwork, xp: harvest.xp, skillBefore: harvest.skillBefore, skillAfter: harvest.skillAfter, questsCompleted: harvest.questsCompleted }, station, config, harvest.gave);
        }
        return;
    }

    const recipe = station.recipes?.[a ?? ""];
    const page = Number(b) || 0;
    if (recipe && station.style === "forge") return startForge(interaction, { userId: user.id, guildId: guild.id }, station, recipe, page, config);

    const made = recipe ? await craftOnce({ userId: user.id, guildId: guild.id, config, station, recipe, facts: memberFacts(interaction.member) }) : null;
    const status = made ? resultLine(made, station, config) : "That recipe was removed.";
    const { profile } = await getOrCreateProfile({ userId: user.id, guildId: guild.id });
    await interaction.update({ ...await view(ownerId, station, profile, config, page, status, memberFacts(interaction.member)), attachments: [] });
    if (made) await skillCard(interaction, made, station, config);
}

/** Swaps the recipe list for the forge bar and starts it moving. Nothing is spent until the strike. */
async function startForge(interaction: ButtonInteraction, ids: { userId: number; guildId: number }, station: CraftingStation, recipe: Recipe, page: number, config: GuildConfig) {
    const key = forgeKey(interaction.user.id, interaction.guildId!);
    const { profile } = await getOrCreateProfile(ids);
    const mine = stationProgress(profile, station.id);
    const skill = skillLevel(mine.xp, config);
    const state = recipeState(recipe, profile, config, skill, mine.known ?? [], memberFacts(interaction.member));
    if (state.locked || !state.affordable || forges.has(key)) {
        const status = forges.has(key) ? "You're already at the forge." : "You don't have everything this needs.";
        await interaction.update(render(interaction.user.id, station, profile, config, page, status, memberFacts(interaction.member)));
        return;
    }

    const run: ForgeRun = {
        interaction, ...ids, station, recipe, page,
        place: placeForge(forgeRules(station, skill, config.gathering.skill.maxLevel)),
        cell: 0, dir: 1, sweeps: 0, frames: [], timer: null, pending: null,
    };
    forges.set(key, run);
    await interaction.update(renderForge(interaction.user.id, run, config));
    run.frames.push({ cell: 0, shownAt: Date.now() });

    const tick = () => {
        if (forges.get(key) !== run) return;
        const next = run.cell + run.dir;
        if (next < 0 || next >= FORGE_CELLS) {
            run.dir = run.dir === 1 ? -1 : 1;
            run.sweeps++;
        }
        if (run.sweeps >= FORGE_SWEEPS) return void strike(interaction, config, true).catch((err) => console.error("Forge timeout failed:", err));
        run.cell += run.dir;
        const cell = run.cell;
        run.pending = interaction.editReply(renderForge(interaction.user.id, run, config))
            .then(() => { run.frames.push({ cell, shownAt: Date.now() }); })
            .catch(() => null);
        run.timer = setTimeout(tick, FORGE_FRAME_MS);
        run.timer.unref();
    };
    run.timer = setTimeout(tick, FORGE_FRAME_MS);
    run.timer.unref();
}

/** Ends the forge: judges the frame the player saw when they clicked, crafts, and shows the list again. */
async function strike(source: ButtonInteraction, config: GuildConfig, timedOut: boolean) {
    const key = forgeKey(source.user.id, source.guildId!);
    const run = forges.get(key);
    if (!run) {
        if (!timedOut) await source.deferUpdate().catch(() => null);
        return;
    }
    forges.delete(key);
    if (run.timer) clearTimeout(run.timer);

    let outcome: ForgeOutcome = "ruin";
    if (!timedOut) {
        const at = source.createdTimestamp;
        const seen = [...run.frames].reverse().find((f) => f.shownAt <= at) ?? run.frames.at(0);
        outcome = judgeForge(seen?.cell ?? -1, run.place);
    }
    const result = await craftOnce({ userId: run.userId, guildId: run.guildId, config, station: run.station, recipe: run.recipe, outcome, facts: memberFacts(source.member) });
    await run.pending;
    const { profile } = await getOrCreateProfile({ userId: run.userId, guildId: run.guildId });
    const view = render(source.user.id, run.station, profile, config, run.page, resultLine(result, run.station, config, timedOut), memberFacts(source.member));
    if (timedOut) await run.interaction.editReply(view).catch(() => null);
    else await source.update(view);
    await skillCard(timedOut ? run.interaction : source, result, run.station, config);
}

export async function autocomplete(interaction: AutocompleteInteraction) {
    if (!interaction.guildId) return;
    const { config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    return respondFiltered(interaction, enabledStations(config).map((s) => ({ name: `${s.emoji} ${s.name}`, value: s.id })));
}
