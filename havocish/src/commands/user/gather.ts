import type { AutocompleteInteraction, ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { announceRareFinds } from "../../ui/rareFinds.js";
import { rpgLevelUpCard } from "../../ui/rpgLevelUpCard.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateProfile } from "../../cache/profileService.js";
import { respondFiltered } from "../../ui/autocomplete.js";
import { accentColor } from "../../ui/pager.js";
import { managerSetupRows } from "../../ui/dashboardLinks.js";
import {
    bestTool, enabledActivities, energyNow, finishRun, rollLoot, skillLevel, spendEnergy, toolsAtTier, unlockedLocations,
} from "../../player/gathering.js";
import type { GameType, GatheringActivity } from "../../types/gathering.js";
import type { GuildConfig } from "../../types/guild.js";
import { checkRequirements, memberFacts } from "../../player/requirements.js";
import { itemLabel, type Ctx, type EndReason, type Game, type Run, type Words } from "../../ui/gathering/run.js";
import { grid } from "../../ui/gathering/grid.js";
import { timing } from "../../ui/gathering/timing.js";
import { find } from "../../ui/gathering/find.js";
import { conditionNow, runMods } from "../../player/twists.js";

export const data = new SlashCommandBuilder()
    .setName("gather")
    .setDescription("Go gathering: pick one of this server's activities")
    .addStringOption((o) => o.setName("activity").setDescription("What to do").setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName("location").setDescription("Where to go (defaults to your best one)").setAutocomplete(true));

const GAMES: Record<GameType, Game> = { grid, timing, find };

/** An unattended run ends itself after this long, keeping what was found. */
const RUN_TIMEOUT_MS = 2 * 60 * 1000;

type LiveRun = Run & { ctx: Ctx };

// ponytail: in memory, so a restart drops runs in progress; they last 2 minutes at most.
const runs = new Map<string, LiveRun>();
const runKey = (discordUserId: string, discordGuildId: string) => `${discordUserId}-${discordGuildId}`;

const gameOf = (a: GatheringActivity) => GAMES[a.game] ?? grid;
const wordsOf = (a: GatheringActivity): Words => ({ ...gameOf(a).words, ...(a.words ?? {}) });

function findActivity(config: GuildConfig, typed: string): GatheringActivity | undefined {
    const all = enabledActivities(config);
    const t = typed.trim().toLowerCase();
    return all.find((a) => a.id === typed) ?? all.find((a) => a.name.toLowerCase() === t);
}

const foundLine = (found: Record<string, number>, config: GuildConfig) =>
    Object.entries(found).map(([id, n]) => itemLabel(config, id, n)).join(", ");

function render(run: Run, config: GuildConfig) {
    const w = wordsOf(run.activity);
    const { text, rows } = gameOf(run.activity).body(run, run.state, w, config);
    const container = new ContainerBuilder()
        .setAccentColor(accentColor(config.style.mainThemeColor))
        .addTextDisplayComponents((t) => t.setContent([
            `## ${run.activity.emoji} ${run.activity.name} · ${run.location.emoji} ${run.location.name}`,
            ...run.mods.lines,
            `-# ${run.energyLabel}${run.toolId ? ` · with ${itemLabel(config, run.toolId)}` : ""}`,
            `Found: ${Object.keys(run.found).length ? foundLine(run.found, config) : "nothing yet"}`,
            ...(run.status ? [`-# ${run.status}`] : []),
            text,
        ].join("\n")));
    for (const row of rows) container.addActionRowComponents(row);
    container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`gather:leave:${run.ownerId}:0`).setLabel(w.leave ?? "Leave").setStyle(ButtonStyle.Danger),
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
    if (!enabledActivities(config).length) {
        await interaction.reply({
            content: "Gathering isn't set up on this server yet.",
            components: managerSetupRows(interaction, "gathering", "Set up gathering"),
            flags: MessageFlags.Ephemeral,
        });
        return;
    }
    const allowed = config.gathering.channelIds ?? [];
    if (allowed.length && !allowed.includes(interaction.channelId)) {
        return void await say(`Gathering happens in ${allowed.map((id) => `<#${id}>`).join(", ")}.`);
    }

    const activity = findActivity(config, interaction.options.getString("activity", true));
    if (!activity) return void await say("That isn't one of this server's activities. Pick one from the list.");

    const key = runKey(interaction.user.id, interaction.guildId);
    const existing = runs.get(key);
    if (existing) {
        const where = existing.message ? ` ([jump to it](${existing.message.url}))` : "";
        return void await say(`You're already out ${existing.activity.name.toLowerCase()}${where}. Finish that run first.`);
    }

    const { user } = await getOrCreateDbUser({ discordUserId: interaction.user.id, username: interaction.user.username });
    const { profile } = await getOrCreateProfile({ userId: user.id, guildId: guild.id });
    const progress = profile.user_stats?.gathering?.[activity.id];
    const power = energyNow(progress, activity);
    const t = (ms: number) => `<t:${Math.ceil(ms / 1000)}:R>`;
    if (power.energy < 1) {
        return void await say(`⚡ You're out of energy for ${activity.name}. One more point ${t(power.nextAt!)}, full ${t(power.fullAt!)}.`);
    }

    const skill = skillLevel(progress?.xp ?? 0, config);
    const tool = bestTool(profile.inventory, config, activity.id);
    const open = unlockedLocations(activity, skill);
    const asked = interaction.options.getString("location");
    // Without a choice, the best place the player's skill and tool both reach.
    const facts = memberFacts(interaction.member);
    const meets = (l: (typeof open)[number]) => checkRequirements(l.requirements, { profile, config, facts }).ok;
    const location = asked
        ? open.find((l) => l.id === asked || l.name.toLowerCase() === asked.toLowerCase())
        : open.filter((l) => (l.minToolTier ?? 0) <= (tool?.tier ?? 0) && meets(l)).at(-1);
    if (!location) {
        return void await say(asked
            ? `You can't reach that yet. Your ${activity.skillName} is ${skill}.`
            : `There's nowhere to go ${activity.name.toLowerCase()} at ${activity.skillName} ${skill} yet.`);
    }
    const gate = checkRequirements(location.requirements, { profile, config, facts });
    if (!gate.ok) return void await say(`${location.emoji} ${location.name}: ${gate.message}`);
    if ((location.minToolTier ?? 0) > (tool?.tier ?? 0)) {
        const options = toolsAtTier(config, activity.id, location.minToolTier!).map((i) => `${i.emoji ?? ""} **${i.name}**`.trim());
        return void await say(`${location.emoji} ${location.name} needs a better tool${options.length ? `, like ${options.slice(0, 3).join(" or ")}` : ""}.`);
    }
    if (!rollLoot(location.loot ?? [], config)) return void await say(`${location.name} has nothing to find yet.`);
    // The location's traits and today's condition; a costly one takes more energy.
    const mods = runMods(config, activity, location);
    const cost = 1 + mods.energy;
    if (power.energy < cost) {
        return void await say(`⚡ ${location.emoji} ${location.name} takes **${cost}** energy today and you have ${power.energy}. Full ${t(power.fullAt ?? Date.now())}.`);
    }

    // Checked again after the awaits, so a double-tapped command can't start two runs.
    if (runs.has(key)) return void await say("You're already out gathering.");
    const run = {
        ownerId: interaction.user.id, discordGuildId: interaction.guildId, userId: user.id, guildId: guild.id,
        activity, location, skill, toolId: tool?.itemId ?? null, toolBonus: tool?.bonus ?? 0,
        energyLabel: `⚡ ${power.energy - cost}/${power.max}`, mods, found: {}, status: null, message: null, timer: null, deadline: null, state: null,
    } as unknown as LiveRun;
    run.ctx = {
        config,
        alive: () => runs.get(key) === run,
        refresh: async () => {
            if (runs.get(key) === run) await run.message?.edit(render(run, config)).catch(() => null);
        },
        end: (why) => endRun(run, why),
        later: (ms, fn) => {
            if (run.timer) clearTimeout(run.timer);
            run.timer = setTimeout(() => void Promise.resolve(fn()).catch((err) => console.error("Gathering timer failed:", err)), ms);
            run.timer.unref();
        },
    };
    runs.set(key, run);
    run.state = gameOf(activity).start(run, wordsOf(activity), run.ctx);

    await spendEnergy(user.id, guild.id, activity, cost);
    const response = await interaction.reply({ ...render(run, config), withResponse: true });
    run.message = response.resource?.message ?? null;
    run.deadline = setTimeout(() => void endRun(run, "timeout").catch((err) => console.error("Gathering timeout failed:", err)), RUN_TIMEOUT_MS);
    run.deadline.unref();
}

/** Pays out and collapses the game into one line. `interaction` answers the click that ended it. */
async function endRun(run: Run, why: EndReason, interaction?: ButtonInteraction) {
    // Taken out first, synchronously, so a second click or a timer can't end it twice.
    const key = runKey(run.ownerId, run.discordGuildId);
    if (runs.get(key) !== run) return;
    runs.delete(key);
    if (run.timer) clearTimeout(run.timer);
    if (run.deadline) clearTimeout(run.deadline);

    const { config } = await getOrCreateGuildConfig({ discordGuildId: run.discordGuildId });
    const w = wordsOf(run.activity);
    // Rounded up: rounding down wiped out small hauls, which read as a bug. "Unstable" loses it all.
    const unstable = why === "hazard" && run.mods.rules.has("grid.unstable");
    if (unstable) run.found = {};
    else if (why === "hazard") for (const id of Object.keys(run.found)) run.found[id] = Math.ceil(run.found[id]! / 2);
    const result = await finishRun({ userId: run.userId, guildId: run.guildId, config, activity: run.activity, location: run.location, found: run.found, xpMult: run.mods.xp });

    const lines = [
        ...(why === "hazard" ? [`${w.hazard} ${unstable ? w.collapseLine ?? "It all comes down: everything you found is lost." : w.hazardLine}`] : []),
        `<@${run.ownerId}> ${w.verb} ${foundLine(result.kept, config) || "nothing"} at ${run.location.emoji} ${run.location.name}.`,
        `-# +${result.skillXp} ${run.activity.skillName} XP · ${run.energyLabel} left`,
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

    const client = interaction?.client ?? run.message?.client;
    if (client) await announceRareFinds({
        client, config, discordUserId: run.ownerId, verb: "found",
        items: Object.entries(result.kept).map(([itemId, quantity]) => ({ itemId, quantity })),
        where: `at ${run.location.emoji} ${run.location.name}`,
    });

    const user = interaction?.user ?? await run.message?.client.users.fetch(run.ownerId).catch(() => null);
    const card = user && await rpgLevelUpCard({ config, kind: "skills", user, label: run.activity.skillName, before: result.skillBefore, after: result.skillAfter });
    if (card) await run.message?.reply({ content: `<@${run.ownerId}> reached **${run.activity.skillName} ${result.skillAfter}**!`, files: [card], allowedMentions: { parse: [] } }).catch(() => null);
}

export async function handleGatherButton(interaction: ButtonInteraction) {
    // When Discord stamped the click, so timing games don't count the bot's own lag against the player.
    const at = interaction.createdTimestamp;
    const [, action = "", ownerId, arg = ""] = interaction.customId.split(":");
    if (interaction.user.id !== ownerId) {
        await interaction.reply({ content: "That's someone else's run. Start your own with `/gather`.", flags: MessageFlags.Ephemeral });
        return;
    }
    const key = runKey(ownerId, interaction.guildId ?? "");
    const run = runs.get(key);
    if (!run || run.message?.id !== interaction.message.id) {
        await interaction.reply({ content: "This run is already over.", flags: MessageFlags.Ephemeral });
        return;
    }

    if (action === "leave") return endRun(run, "leave", interaction);
    const end = await gameOf(run.activity).click(run, run.state, wordsOf(run.activity), action, arg, at, run.ctx);
    // A timer may have ended the run while the click was being handled.
    if (runs.get(key) !== run) return void await interaction.deferUpdate().catch(() => null);
    if (end) return endRun(run, end, interaction);
    await interaction.update(render(run, run.ctx.config));
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
    const tier = bestTool(profile.inventory, config, activity.id)?.tier ?? 0;
    return respondFiltered(interaction, unlockedLocations(activity, skill).map((l) => {
        const now = conditionNow(config, activity, l);
        return {
            name: `${l.emoji} ${l.name}${now ? ` · ${now.emoji} ${now.name}` : ""}${(l.minToolTier ?? 0) > tier ? ` (needs a tier ${l.minToolTier} tool)` : ""}`,
            value: l.id,
        };
    }));
}
