import type { ButtonInteraction, ChatInputCommandInteraction, ModalSubmitInteraction, StringSelectMenuInteraction } from "discord.js";
import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, ModalBuilder, SectionBuilder,
    SlashCommandBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { commitProfileChanges, getOrCreateProfile } from "../../cache/profileService.js";
import { moveById } from "../../content/fight.js";
import { gridImagePath } from "../../content/gridLooks.js";
import { activePet, feedPet, petLook, petMoves, petProgress, petRules, petsOf, petStats, releasePet, renamePet, setActivePet, speciesOf } from "../../player/pets.js";
import { accentColor } from "../../ui/pager.js";
import { itemLabel } from "../../ui/gathering/run.js";
import { emojiImageUrl } from "../../ui/canvas/drawEmojis.js";
import { DASHBOARD_URL } from "../../ui/dashboardLinks.js";
import { bar } from "./me.js";
import type { GuildConfig } from "../../types/guild.js";
import type { DbUserGuildProfile } from "../../types/userprofile.js";
import type { PetSpecies } from "../../types/pets.js";
import type { PendingProfileChanges } from "../../types/cache.js";

export const data = new SlashCommandBuilder()
    .setName("pet")
    .setDescription("See your pet: feed it, rename it, or switch to another");

/** Every word a player sees. Owners override any of them per species. */
const WORDS = {
    level: "Level",
    feed: "Feed it…",
    fed: "{pet} ate {item}. +{xp} XP",
    levelUp: "{pet} reached level {level}!",
    grew: "{pet} grew: {stage}!",
    rename: "Rename",
    switch: "Switch pet…",
    release: "Release",
    releaseAsk: "Let {pet} go for good? This can't be undone.",
    released: "{pet} wandered off. Goodbye, {pet}.",
    keep: "Keep",
    none: "You don't have a pet yet. Pets hatch in timed stations in `/craft`, or come from items in `/shop` and from fights.",
};
const fill = (word: string, values: Record<string, string | number>) => word.replace(/\{(\w+)\}/g, (m, k: string) => String(values[k] ?? m));
const wordsOf = (species?: PetSpecies) => ({ ...WORDS, ...(species?.words ?? {}) });

/** A picture for the card: the stage's uploaded image, else its emoji. */
function pictureUrl(look: { emoji: string; image?: string }) {
    const path = gridImagePath(look.image);
    return path ? new URL(path, DASHBOARD_URL).href : emojiImageUrl(look.emoji);
}

function render(ownerId: string, profile: DbUserGuildProfile, config: GuildConfig, status?: string) {
    const container = new ContainerBuilder().setAccentColor(accentColor(config.style.mainThemeColor));
    const active = activePet(profile, config);
    if (!active) {
        container.addTextDisplayComponents((t) => t.setContent([...(status ? [`-# ${status}`] : []), wordsOf().none].join("\n")));
        return { components: [container], flags: MessageFlags.IsComponentsV2 as const };
    }
    const { pet, species } = active;
    const w = wordsOf(species);
    const { level, into, span } = petProgress(pet, species, config);
    const look = petLook(species, level);
    const stats = petStats(species, level);
    const moves = [...new Set(petMoves(species, level).map((m) => m.moveId))].map((id) => moveById(config, id)).map((m) => `${m.emoji} ${m.name}`);
    const text = [
        `## ${look.emoji} ${pet.name}`,
        `-# ${species.name}${look.stage ? ` · ${look.stage}` : ""}`,
        `**${w.level} ${level}** ${span ? `\`${bar(into / span)}\` ${into} / ${span}` : "max"}`,
        `❤️ ${stats.hp} · ⚔️ ${stats.atk} · 🛡️ ${stats.def} · 💨 ${stats.spd}`,
        ...(moves.length ? [`-# ${moves.join(" · ")}`] : []),
        ...(status ? [`-# ${status}`] : []),
    ].join("\n");
    const url = pictureUrl(look);
    if (url) container.addSectionComponents(new SectionBuilder().addTextDisplayComponents((t) => t.setContent(text)).setThumbnailAccessory((th) => th.setURL(url)));
    else container.addTextDisplayComponents((t) => t.setContent(text));

    const foods = Object.entries(petRules(config).foods).filter(([id, xp]) => xp > 0 && (profile.inventory?.[id]?.quantity ?? 0) > 0).slice(0, 25);
    if (foods.length) container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId(`pet:feed:${ownerId}`).setPlaceholder(w.feed)
            .addOptions(foods.map(([id, xp]) => ({ label: `${itemLabel(config, id).slice(0, 80)} (${profile.inventory![id]!.quantity})`, description: `+${xp} XP`, value: id }))),
    ));
    const owned = petsOf(profile).owned.filter((p) => speciesOf(config, p.speciesId)).slice(0, 25);
    if (owned.length > 1) container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId(`pet:switch:${ownerId}`).setPlaceholder(w.switch)
            .addOptions(owned.map((p) => {
                const s = speciesOf(config, p.speciesId)!;
                return { label: p.name.slice(0, 80), description: `${s.name} · ${w.level} ${petProgress(p, s, config).level}`.slice(0, 100), value: p.uid, default: p.uid === pet.uid };
            })),
    ));
    container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`pet:rename:${ownerId}:${pet.uid}`).setLabel(w.rename).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`pet:release:${ownerId}:${pet.uid}`).setLabel(w.release).setStyle(ButtonStyle.Danger),
    ));
    return { components: [container], flags: MessageFlags.IsComponentsV2 as const };
}

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) {
        await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
        return;
    }
    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    if (!petRules(config).enabled) {
        await interaction.reply({ content: "Pets aren't switched on in this server.", flags: MessageFlags.Ephemeral });
        return;
    }
    const { user } = await getOrCreateDbUser({ discordUserId: interaction.user.id, username: interaction.user.username });
    const { profile } = await getOrCreateProfile({ userId: user.id, guildId: guild.id });
    await interaction.reply(render(interaction.user.id, profile, config));
}

type PetInteraction = ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;

export async function handlePetInteraction(interaction: PetInteraction) {
    const [, action, ownerId, arg] = interaction.customId.split(":");
    if (interaction.user.id !== ownerId || !interaction.guildId) {
        await interaction.reply({ content: "That's someone else's pet. See yours with `/pet`.", flags: MessageFlags.Ephemeral });
        return;
    }
    // Rename asks for the name first; nothing changes until the form comes back.
    if (action === "rename" && interaction.isButton()) {
        await interaction.showModal(new ModalBuilder().setCustomId(`pet:named:${ownerId}:${arg}`).setTitle("Rename your pet").addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("name").setLabel("Name").setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(32).setRequired(true)),
        ));
        return;
    }

    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    const { user } = await getOrCreateDbUser({ discordUserId: interaction.user.id });
    const cached = await getOrCreateProfile({ userId: user.id, guildId: guild.id });
    const p = cached.profile;
    const baseline = { xp: p.xp, gold: p.gold };
    const species = activePet(p, config)?.species;
    const w = wordsOf(species);
    const commit = (withInventory = false) => commitProfileChanges({
        userId: user.id, guildId: guild.id, profile: p, baseline,
        changes: { ...(cached.pendingChanges ?? {}), user_stats: p.user_stats, ...(withInventory && { inventory: p.inventory }) } as PendingProfileChanges,
    });
    const update = async (status?: string) => {
        if (interaction.isModalSubmit() && !interaction.isFromMessage()) return void await interaction.reply({ ...render(ownerId, p, config, status), flags: MessageFlags.IsComponentsV2 });
        await (interaction as ButtonInteraction).update(render(ownerId, p, config, status));
    };

    if (action === "feed" && interaction.isStringSelectMenu()) {
        const uid = petsOf(p).active ?? "";
        const itemId = interaction.values[0] ?? "";
        const result = feedPet(p, config, uid, itemId);
        if ("refused" in result) return update(result.refused);
        commit(true);
        const active = activePet(p, config)!;
        const before = petLook(active.species, result.before), after = petLook(active.species, result.after);
        const lines = [fill(w.fed, { pet: active.pet.name, item: itemLabel(config, itemId), xp: result.xp })];
        if (result.after > result.before) lines.push(fill(w.levelUp, { pet: active.pet.name, level: result.after }));
        if (after.stage && after.stage !== before.stage) lines.push(fill(w.grew, { pet: active.pet.name, stage: after.stage }));
        return update(lines.join(" "));
    }
    if (action === "switch" && interaction.isStringSelectMenu()) {
        if (setActivePet(p, interaction.values[0] ?? "")) commit();
        return update();
    }
    if (action === "named" && interaction.isModalSubmit()) {
        const why = renamePet(p, arg ?? "", interaction.fields.getTextInputValue("name"));
        if (!why) commit();
        return update(why ?? undefined);
    }
    if (action === "release" && interaction.isButton()) {
        const pet = petsOf(p).owned.find((x) => x.uid === arg);
        if (!pet) return update();
        const container = new ContainerBuilder().setAccentColor(accentColor(config.style.mainThemeColor))
            .addTextDisplayComponents((t) => t.setContent(fill(w.releaseAsk, { pet: pet.name })))
            .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`pet:released:${ownerId}:${pet.uid}`).setLabel(w.release).setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`pet:back:${ownerId}`).setLabel(w.keep).setStyle(ButtonStyle.Secondary),
            ));
        await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
        return;
    }
    if (action === "released" && interaction.isButton()) {
        const gone = releasePet(p, arg ?? "");
        if (gone) commit();
        return update(gone ? fill(w.released, { pet: gone.name }) : undefined);
    }
    return update();
}
