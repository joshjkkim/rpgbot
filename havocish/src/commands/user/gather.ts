import type { AutocompleteInteraction, ButtonInteraction, ChatInputCommandInteraction, Message } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateProfile } from "../../cache/profileService.js";
import { respondFiltered } from "../../ui/autocomplete.js";
import { accentColor } from "../../ui/pager.js";
import {
    cooldownLeft, enabledActivities, finishRun, gridRules, makeGrid, rollLoot, skillLevel, startCooldown, unlockedLocations,
    type GridCell,
} from "../../player/gathering.js";
import type { GatheringActivity, GatheringLocation } from "../../types/gathering.js";
import type { GuildConfig } from "../../types/guild.js";

export const data = new SlashCommandBuilder()
    .setName("gather")
    .setDescription("Go gathering: pick one of this server's activities")
    .addStringOption((o) => o.setName("activity").setDescription("What to do").setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName("location").setDescription("Where to go (defaults to your best one)").setAutocomplete(true));

/** Every word a player sees in the grid game. Owners override any of them per activity. */
const GRID_WORDS = {
    tile: "❔",
    empty: "·",
    hazard: "💥",
    hazardLine: "Disaster! You get away with half of what you found.",
    leave: "Leave",
    tries: "tries",
    verb: "found",
};

/** An unattended run ends itself after this long, keeping what was found. */
const RUN_TIMEOUT_MS = 2 * 60 * 1000;

type GridRun = {
    ownerId: string;
    discordGuildId: string;
    userId: number;
    guildId: number;
    activity: GatheringActivity;
    location: GatheringLocation;
    cells: GridCell[];
    /** What each revealed tile shows, by index. */
    shown: (string | null)[];
    triesLeft: number;
    found: Record<string, number>;
    message: Message | null;
    timer: NodeJS.Timeout | null;
};

// ponytail: in memory, so a restart drops runs in progress; they last 2 minutes at most.
const runs = new Map<string, GridRun>();
const runKey = (discordUserId: string, discordGuildId: string) => `${discordUserId}-${discordGuildId}`;

const words = (a: GatheringActivity) => ({ ...GRID_WORDS, ...(a.words ?? {}) });

function findActivity(config: GuildConfig, typed: string): GatheringActivity | undefined {
    const all = enabledActivities(config);
    const t = typed.trim().toLowerCase();
    return all.find((a) => a.id === typed) ?? all.find((a) => a.name.toLowerCase() === t);
}

function foundLine(found: Record<string, number>, config: GuildConfig) {
    const parts = Object.entries(found).map(([id, n]) => {
        const def = config.shop?.items?.[id];
        return `${def?.emoji ? `${def.emoji} ` : ""}${def?.name ?? id} ×${n}`;
    });
    return parts.join(", ");
}

function renderRun(run: GridRun, config: GuildConfig) {
    const w = words(run.activity);
    const over = run.triesLeft <= 0;
    const container = new ContainerBuilder()
        .setAccentColor(accentColor(config.style.mainThemeColor))
        .addTextDisplayComponents((t) => t.setContent(
            `## ${run.activity.emoji} ${run.activity.name} · ${run.location.emoji} ${run.location.name}\n` +
            `**${run.triesLeft}** ${w.tries} left · ${Object.keys(run.found).length ? foundLine(run.found, config) : "nothing yet"}`,
        ));

    for (let row = 0; row < 4; row++) {
        const buttons = [0, 1, 2, 3].map((col) => {
            const i = row * 4 + col;
            const shown = run.shown[i];
            const cell = run.cells[i];
            // Labels, not emoji fields: an owner's emoji text can't make Discord reject the message.
            return new ButtonBuilder()
                .setCustomId(`gather:tile:${run.ownerId}:${i}`)
                .setLabel(shown ?? w.tile)
                .setStyle(shown == null ? ButtonStyle.Secondary : cell === "find" ? ButtonStyle.Success : cell === "hazard" ? ButtonStyle.Danger : ButtonStyle.Secondary)
                .setDisabled(shown != null || over);
        });
        container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons));
    }
    container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`gather:leave:${run.ownerId}`).setLabel(w.leave).setStyle(ButtonStyle.Primary),
    ));
    return { components: [container], flags: MessageFlags.IsComponentsV2 as const };
}

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) {
        await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
        return;
    }
    const say = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    if (!enabledActivities(config).length) return void await say("Gathering isn't set up on this server yet.");
    const allowed = config.gathering.channelIds ?? [];
    if (allowed.length && !allowed.includes(interaction.channelId)) {
        return void await say(`Gathering happens in ${allowed.map((id) => `<#${id}>`).join(", ")}.`);
    }

    const activity = findActivity(config, interaction.options.getString("activity", true));
    if (!activity) return void await say("That isn't one of this server's activities. Pick one from the list.");

    const existing = runs.get(runKey(interaction.user.id, interaction.guildId));
    if (existing) {
        const where = existing.message ? ` ([jump to it](${existing.message.url}))` : "";
        return void await say(`You're already out ${existing.activity.name.toLowerCase()}${where}. Finish that run first.`);
    }

    const { user } = await getOrCreateDbUser({ discordUserId: interaction.user.id, username: interaction.user.username });
    const { profile } = await getOrCreateProfile({ userId: user.id, guildId: guild.id });
    const progress = profile.user_stats?.gathering?.[activity.id];
    const wait = cooldownLeft(progress?.lastAt, activity);
    if (wait > 0) {
        return void await say(`You can go ${activity.name.toLowerCase()} again <t:${Math.floor(Date.now() / 1000) + wait}:R>.`);
    }

    const skill = skillLevel(progress?.xp ?? 0, config);
    const open = unlockedLocations(activity, skill);
    const asked = interaction.options.getString("location");
    const location = asked ? open.find((l) => l.id === asked || l.name.toLowerCase() === asked.toLowerCase()) : open.at(-1);
    if (!location) {
        return void await say(asked
            ? `You can't reach that yet. Your ${activity.skillName} is ${skill}.`
            : `There's nowhere to go ${activity.name.toLowerCase()} at ${activity.skillName} ${skill} yet.`);
    }
    if (!rollLoot(location.loot ?? [], config)) return void await say(`${location.name} has nothing to find yet.`);

    await startCooldown(user.id, guild.id, activity.id);

    const rules = gridRules(location, skill);
    const run: GridRun = {
        ownerId: interaction.user.id, discordGuildId: interaction.guildId, userId: user.id, guildId: guild.id,
        activity, location, cells: makeGrid(rules), shown: Array(rules.size).fill(null),
        triesLeft: rules.tries, found: {}, message: null, timer: null,
    };
    runs.set(runKey(run.ownerId, run.discordGuildId), run);

    const response = await interaction.reply({ ...renderRun(run, config), withResponse: true });
    run.message = response.resource?.message ?? null;
    run.timer = setTimeout(() => void endRun(run, "timeout").catch((err) => console.error("Gathering timeout failed:", err)), RUN_TIMEOUT_MS);
    run.timer.unref();
}

/** Pays out and collapses the game into one line. `update` answers the click that ended it. */
async function endRun(run: GridRun, why: "leave" | "out" | "hazard" | "timeout", interaction?: ButtonInteraction) {
    // Taken out first, synchronously, so a second click can't end it twice.
    if (runs.get(runKey(run.ownerId, run.discordGuildId)) !== run) return;
    runs.delete(runKey(run.ownerId, run.discordGuildId));
    if (run.timer) clearTimeout(run.timer);

    const { config } = await getOrCreateGuildConfig({ discordGuildId: run.discordGuildId });
    const w = words(run.activity);
    if (why === "hazard") {
        for (const id of Object.keys(run.found)) run.found[id] = Math.floor(run.found[id]! / 2);
    }
    const result = await finishRun({ userId: run.userId, guildId: run.guildId, config, activity: run.activity, location: run.location, found: run.found });

    const got = foundLine(result.kept, config);
    const lines = [
        ...(why === "hazard" ? [`${w.hazard} ${w.hazardLine}`] : []),
        `<@${run.ownerId}> ${w.verb} ${got || "nothing"} at ${run.location.emoji} ${run.location.name}.`,
        `-# +${result.skillXp} ${run.activity.skillName} XP`,
    ];
    if (result.skillAfter > result.skillBefore) {
        lines.push(`**${run.activity.skillName} ${result.skillAfter}!**`);
        const opened = unlockedLocations(run.activity, result.skillAfter).filter((l) => (l.minSkill ?? 1) > result.skillBefore);
        for (const l of opened) lines.push(`${l.emoji} **${l.name}** is open to you now.`);
    }

    const view = {
        components: [new ContainerBuilder()
            .setAccentColor(accentColor(config.style.mainThemeColor))
            .addTextDisplayComponents((t) => t.setContent(lines.join("\n")))],
        flags: MessageFlags.IsComponentsV2 as const,
        allowedMentions: { parse: [] },
    };
    if (interaction) await interaction.update(view);
    else await run.message?.edit(view).catch(() => null);
}

export async function handleGatherButton(interaction: ButtonInteraction) {
    const [, action, ownerId, index] = interaction.customId.split(":");
    if (interaction.user.id !== ownerId) {
        await interaction.reply({ content: "That's someone else's run. Start your own with `/gather`.", flags: MessageFlags.Ephemeral });
        return;
    }
    const run = runs.get(runKey(ownerId, interaction.guildId ?? ""));
    if (!run || run.message?.id !== interaction.message.id) {
        await interaction.reply({ content: "This run is already over.", flags: MessageFlags.Ephemeral });
        return;
    }

    if (action === "leave") return endRun(run, "leave", interaction);

    const i = Number(index);
    if (!(i >= 0 && i < run.cells.length) || run.shown[i] != null || run.triesLeft <= 0) {
        await interaction.deferUpdate();
        return;
    }

    const { config } = await getOrCreateGuildConfig({ discordGuildId: run.discordGuildId });
    const w = words(run.activity);
    // Re-checked after the await: a quick second click may have used this tile or the last try.
    if (run.shown[i] != null || run.triesLeft <= 0) return void await interaction.deferUpdate();
    run.triesLeft--;
    const cell = run.cells[i];

    if (cell === "hazard") {
        run.shown[i] = w.hazard;
        return endRun(run, "hazard", interaction);
    }
    if (cell === "find") {
        const drop = rollLoot(run.location.loot ?? [], config);
        if (drop) {
            run.found[drop.itemId] = (run.found[drop.itemId] ?? 0) + drop.quantity;
            run.shown[i] = config.shop?.items?.[drop.itemId]?.emoji || "✨";
        } else {
            run.shown[i] = w.empty;
        }
    } else {
        run.shown[i] = w.empty;
    }

    if (run.triesLeft <= 0) return endRun(run, "out", interaction);
    await interaction.update(renderRun(run, config));
}

export async function autocomplete(interaction: AutocompleteInteraction) {
    if (!interaction.guildId) return;
    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    const focused = interaction.options.getFocused(true);

    if (focused.name === "activity") {
        return respondFiltered(interaction, enabledActivities(config).map((a) => ({ name: `${a.emoji} ${a.name}`, value: a.id })));
    }

    const activity = findActivity(config, interaction.options.getString("activity") ?? "");
    if (!activity) return interaction.respond([]);
    const { user } = await getOrCreateDbUser({ discordUserId: interaction.user.id });
    const { profile } = await getOrCreateProfile({ userId: user.id, guildId: guild.id });
    const skill = skillLevel(profile.user_stats?.gathering?.[activity.id]?.xp ?? 0, config);
    return respondFiltered(interaction, unlockedLocations(activity, skill).map((l) => ({ name: `${l.emoji} ${l.name}`, value: l.id })));
}
