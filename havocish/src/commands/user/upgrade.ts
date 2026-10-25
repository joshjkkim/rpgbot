import type { ButtonInteraction, ChatInputCommandInteraction, StringSelectMenuInteraction } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SlashCommandBuilder, StringSelectMenuBuilder } from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateProfile } from "../../cache/profileService.js";
import { accentColor } from "../../ui/pager.js";
import { itemLabel } from "../../ui/gathering/run.js";
import { FORGE_CELLS, judgeForge, placeForge, type ForgeOutcome } from "../../player/crafting.js";
import { attemptUpgrade, nextStep, upgradeLevel, upgradeRules } from "../../player/upgrades.js";
import type { GuildConfig } from "../../types/guild.js";
import type { DbUserGuildProfile } from "../../types/userprofile.js";

/**
 * /upgrade: pick a piece of equipped gear, see what the next + adds and costs,
 * then strike the forge bar. A good strike raises the chance; a failed step
 * spends its cost but never the item. Rules and numbers: player/upgrades.ts.
 */

export const data = new SlashCommandBuilder()
    .setName("upgrade")
    .setDescription("Make a piece of your gear stronger");

const STAT_NAMES: Record<string, string> = { atk: "ATK", def: "DEF", hp: "HP", spd: "SPD", crit: "% crit" };
const gainText = (g: Record<string, number | undefined>) => Object.entries(g).map(([k, v]) => `+${v}${k === "crit" ? "" : " "}${STAT_NAMES[k] ?? k}`).join(", ");

async function load(discordUserId: string, discordGuildId: string) {
    const { user } = await getOrCreateDbUser({ discordUserId });
    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId });
    const { profile } = await getOrCreateProfile({ userId: user.id, guildId: guild.id });
    return { ids: { userId: user.id, guildId: guild.id }, profile, config };
}

/** Equipped gear that has stats to raise. */
function upgradeable(profile: DbUserGuildProfile, config: GuildConfig) {
    const items = config.shop?.items ?? {};
    return [...new Set(Object.values(profile.equips ?? {}).filter((id): id is string => !!id && !!items[id]?.equipable && !!items[id]?.effects?.stats))];
}

const name = (config: GuildConfig, profile: DbUserGuildProfile, id: string) => {
    const level = upgradeLevel(profile, id);
    return `${itemLabel(config, id)}${level ? ` +${level}` : ""}`;
};

/** The picker, or one item's next step with its cost and chance. */
function view(ownerId: string, profile: DbUserGuildProfile, config: GuildConfig, itemId: string | null, status?: string) {
    const r = upgradeRules(config);
    const c = new ContainerBuilder().setAccentColor(accentColor(config.style.mainThemeColor));
    const gear = upgradeable(profile, config);
    const rows: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [];
    if (!gear.length) {
        c.addTextDisplayComponents((t) => t.setContent(`## ⚒️ ${r.name}\nEquip some gear first: \`/equip\`, or **Change gear** on \`/me\`.`));
        return { components: [c], flags: MessageFlags.IsComponentsV2 as const };
    }
    const item = itemId ? config.shop?.items?.[itemId] : undefined;
    const step = item ? nextStep(item, upgradeLevel(profile, itemId!), config) : null;
    if (!item) {
        c.addTextDisplayComponents((t) => t.setContent([`## ⚒️ ${r.name}`, "Pick a piece of your gear.", ...(status ? [`-# ${status}`] : [])].join("\n")));
    } else {
        const goldIcon = config.style.gold.icon || "💰";
        const have = Number(profile.gold ?? 0);
        const mat = step?.material;
        const matHave = mat ? profile.inventory?.[mat.itemId]?.quantity ?? 0 : 0;
        c.addTextDisplayComponents((t) => t.setContent([
            `## ⚒️ ${r.name}: ${name(config, profile, itemId!)}`,
            step
                ? [
                    `**+${step.to}:** ${gainText(step.gain as Record<string, number>) || "a little stronger"}`,
                    `Costs ${have >= step.gold ? "" : "❌ "}${goldIcon} ${step.gold.toLocaleString()}${mat ? ` · ${matHave >= mat.quantity ? "" : "❌ "}${itemLabel(config, mat.itemId)} ${Math.min(matHave, mat.quantity)}/${mat.quantity}` : ""}`,
                    `**${step.chance}%** chance`,
                    `-# Strike 🟩 for +${r.strikeBonus}%, miss for −${r.strikeBonus}%. If it fails, the cost is spent but your gear is safe.`,
                ].join("\n")
                : "It's as strong as it gets.",
            ...(status ? [`-# ${status}`] : []),
        ].join("\n")));
        if (step) {
            const afford = have >= step.gold && (!mat || matHave >= mat.quantity);
            rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`upgrade:go:${ownerId}:${itemId}`).setLabel(r.name).setEmoji("⚒️").setStyle(ButtonStyle.Success).setDisabled(!afford),
            ));
        }
    }
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder()
        .setCustomId(`upgrade:pick:${ownerId}`)
        .setPlaceholder("Pick gear to upgrade")
        .addOptions(gear.slice(0, 25).map((id) => ({ label: name(config, profile, id).replace(/<a?:\w+:\d+>/g, "").trim().slice(0, 100) || id, value: id, default: id === itemId })))));
    for (const row of rows) c.addActionRowComponents(row);
    return { components: [c], flags: MessageFlags.IsComponentsV2 as const };
}

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
        await interaction.reply({ content: "Use /upgrade in a server.", flags: MessageFlags.Ephemeral });
        return;
    }
    const { profile, config } = await load(interaction.user.id, interaction.guildId);
    if (!upgradeRules(config).enabled) {
        await interaction.reply({ content: "Gear upgrades are turned off on this server.", flags: MessageFlags.Ephemeral });
        return;
    }
    await interaction.reply({ ...view(interaction.user.id, profile, config, null), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
}

// ─── The forge bar ────────────────────────────────────────────────────────────

const FRAME_MS = 700;
const SWEEPS = 2;
// The bar for upgrades: a 🟨 zone to keep the chance, a 🟩 centre to raise it. Fixed, not skill-based.
const ZONE = { zone: 6, centre: 2 };

type Run = {
    interaction: ButtonInteraction; itemId: string; place: ReturnType<typeof placeForge>;
    cell: number; dir: 1 | -1; sweeps: number; frames: { cell: number; shownAt: number }[];
    timer: NodeJS.Timeout | null; pending: Promise<unknown> | null;
};
// ponytail: in memory; a restart mid-strike just drops it, spending nothing.
const runs = new Map<string, Run>();
const runKey = (i: { user: { id: string }; guildId: string | null }) => `${i.user.id}-${i.guildId}`;

function renderBar(ownerId: string, run: Run, config: GuildConfig, profile: DbUserGuildProfile) {
    const r = upgradeRules(config);
    const { place } = run;
    const bar = Array.from({ length: FORGE_CELLS }, (_, i) => (i >= place.centreStart && i <= place.centreEnd ? "🟩" : i >= place.zoneStart && i <= place.zoneEnd ? "🟨" : "⬛")).join("");
    const marker = Array.from({ length: FORGE_CELLS }, (_, i) => (i === run.cell ? "🔺" : "▪️")).join("");
    const c = new ContainerBuilder().setAccentColor(accentColor(config.style.mainThemeColor))
        .addTextDisplayComponents((t) => t.setContent([`## ⚒️ ${r.name}: ${name(config, profile, run.itemId)}`, bar, marker, `-# 🟩 for +${r.strikeBonus}%, 🟨 keeps the chance, anywhere else −${r.strikeBonus}%.`].join("\n")))
        .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`upgrade:strike:${ownerId}`).setLabel("Strike").setEmoji("🔨").setStyle(ButtonStyle.Danger)));
    return { components: [c], flags: MessageFlags.IsComponentsV2 as const };
}

async function start(interaction: ButtonInteraction, itemId: string) {
    const { profile, config } = await load(interaction.user.id, interaction.guildId!);
    const key = runKey(interaction);
    if (runs.has(key)) return void await interaction.update(view(interaction.user.id, profile, config, itemId, "You're already at the forge."));
    const run: Run = { interaction, itemId, place: placeForge(ZONE), cell: 0, dir: 1, sweeps: 0, frames: [], timer: null, pending: null };
    runs.set(key, run);
    await interaction.update(renderBar(interaction.user.id, run, config, profile));
    run.frames.push({ cell: 0, shownAt: Date.now() });
    const tick = () => {
        if (runs.get(key) !== run) return;
        const next = run.cell + run.dir;
        if (next < 0 || next >= FORGE_CELLS) { run.dir = run.dir === 1 ? -1 : 1; run.sweeps++; }
        if (run.sweeps >= SWEEPS) return void strike(interaction, true).catch((err) => console.error("Upgrade timeout failed:", err));
        run.cell += run.dir;
        const cell = run.cell;
        run.pending = interaction.editReply(renderBar(interaction.user.id, run, config, profile)).then(() => { run.frames.push({ cell, shownAt: Date.now() }); }).catch(() => null);
        run.timer = setTimeout(tick, FRAME_MS);
        run.timer.unref();
    };
    run.timer = setTimeout(tick, FRAME_MS);
    run.timer.unref();
}

/** Ends the bar: judges the frame the player saw, attempts the upgrade, and shows the item again. */
async function strike(source: ButtonInteraction, timedOut: boolean) {
    const key = runKey(source);
    const run = runs.get(key);
    if (!run) return void (timedOut ? null : await source.deferUpdate().catch(() => null));
    runs.delete(key);
    if (run.timer) clearTimeout(run.timer);
    let outcome: ForgeOutcome = "ruin";
    if (!timedOut) {
        const seen = [...run.frames].reverse().find((f) => f.shownAt <= source.createdTimestamp) ?? run.frames.at(0);
        outcome = judgeForge(seen?.cell ?? -1, run.place);
    }
    const { ids, config } = await load(source.user.id, source.guildId!);
    const result = await attemptUpgrade({ ...ids, config, itemId: run.itemId, outcome });
    await run.pending;
    const { profile } = await getOrCreateProfile(ids);
    const strikeNote = timedOut ? "Too slow: " : outcome === "perfect" ? "🟩 Perfect strike! " : outcome === "made" ? "" : "Off the mark. ";
    const status = !result.ok ? result.message
        : result.success ? `✨ ${strikeNote}${itemLabel(config, run.itemId)} is now **+${result.level}** (${result.chance}% chance).`
        : `💥 ${strikeNote}It didn't take (${result.chance}% chance). The cost is spent; your ${itemLabel(config, run.itemId)} is safe at +${result.level}.`;
    const v = view(source.user.id, profile, config, run.itemId, status);
    if (timedOut) await run.interaction.editReply(v).catch(() => null);
    else await source.update(v);
}

export async function handleUpgradeInteraction(interaction: ButtonInteraction | StringSelectMenuInteraction) {
    const [, action, ownerId, itemId] = interaction.customId.split(":");
    if (!interaction.guildId || interaction.user.id !== ownerId) {
        await interaction.reply({ content: "Use /upgrade for your own gear.", flags: MessageFlags.Ephemeral });
        return;
    }
    if (action === "pick" && interaction.isStringSelectMenu()) {
        const { profile, config } = await load(interaction.user.id, interaction.guildId);
        return void await interaction.update(view(ownerId, profile, config, interaction.values[0] ?? null));
    }
    if (!interaction.isButton()) return;
    if (action === "go" && itemId) return start(interaction, itemId);
    if (action === "strike") return strike(interaction, false);
}
