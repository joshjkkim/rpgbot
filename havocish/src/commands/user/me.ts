import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateProfile } from "../../cache/profileService.js";
import { calculateStats, chatLevelBonus, minutesToFull, resolveCurrentHp, woundedUntil, woundLine } from "../../player/combat.js";
import { calculateLevelFromXp, calculateTotalXpForLevel, levelStartXp } from "../../leveling/levels.js";
import { accentColor } from "../../ui/pager.js";
import { SLOT_META } from "./inventory.js";
import { bestTool, enabledActivities, energyNow, skillProgress } from "../../player/gathering.js";
import { enabledStations } from "../../player/crafting.js";
import { combatProgress } from "../../player/combatLevel.js";
import type { GuildConfig } from "../../types/guild.js";
import type { DbUserGuildProfile } from "../../types/userprofile.js";
import { loadoutFor, moveById } from "../../player/moves.js";
import { memberFacts, type MemberFacts } from "../../player/requirements.js";
import { collectionSets } from "../../player/collections.js";
import { execute as openMoves } from "./moves.js";
import { execute as openCollection } from "./collection.js";
import { renderCharacterPane, type PaneSlot } from "../../ui/canvas/characterPane.js";
import type { EquipSlot } from "../../types/economy.js";

/**
 * /me: the character sheet. Level, HP, combat stats and equipped gear in one
 * private message, the things a player checks before every fight. /profile
 * stays the shareable card; this is the working view. Stats come from the same
 * calculateStats fights use, so the numbers are the ones combat will apply.
 */

export const data = new SlashCommandBuilder()
    .setName("me")
    .setDescription("Your character at a glance: HP, stats and gear")
    .addUserOption(opt =>
        opt.setName("user").setDescription("Look at someone else's character instead").setRequired(false));

const STAT_LABELS = { hp: "HP", atk: "ATK", def: "DEF", spd: "SPD", crit: "% crit" } as const;

export function bar(fraction: number, length = 12) {
    const filled = Math.max(0, Math.min(length, Math.round(fraction * length)));
    return "█".repeat(filled) + "░".repeat(length - filled);
}

/** "+8 ATK, +2 DEF" for one equipped item. */
function itemBonus(config: GuildConfig, itemId: string) {
    const stats = config.shop?.items?.[itemId]?.effects?.stats ?? {};
    return (Object.keys(STAT_LABELS) as Array<keyof typeof STAT_LABELS>)
        .filter((k) => stats[k])
        .map((k) => `${stats[k]! > 0 ? "+" : ""}${stats[k]}${k === "crit" ? STAT_LABELS[k] : ` ${STAT_LABELS[k]}`}`)
        .join(", ");
}

/** "-# 💬 From chat level 40: +80 HP, +20 ATK", or nothing when chat adds nothing. */
function chatBonusLine(profile: DbUserGuildProfile, config: GuildConfig) {
    const b = chatLevelBonus(profile, config);
    const parts = (Object.keys(STAT_LABELS) as Array<keyof typeof STAT_LABELS>)
        .filter((k) => Math.round(b[k]) > 0)
        .map((k) => `+${Math.round(b[k])}${k === "crit" ? STAT_LABELS[k] : ` ${STAT_LABELS[k]}`}`);
    return parts.length ? [`-# 💬 From chat level ${b.level}: ${parts.join(", ")}`] : [];
}

/** The title from equipped gear ("the Wanderer"), as /profile shows it. The last equipped one wins. */
function titleOf(profile: DbUserGuildProfile, config: GuildConfig): string | null {
    let title: string | null = null;
    for (const id of Object.values(profile.equips ?? {})) {
        const t = id ? config.shop?.items?.[id]?.effects?.cosmetic?.title : undefined;
        if (t) title = t;
    }
    return title;
}

/** Draws at once at most; past it, /me shows text only for that call (like battle scenes). */
const MAX_PANES_AT_ONCE = 3;
let panesInFlight = 0;

/** The drawn character pane, or null when the server turned it off, combat is off, or it couldn't be drawn in time. */
async function paneFile(profile: DbUserGuildProfile, config: GuildConfig, name: string, avatarUrl: string): Promise<AttachmentBuilder | null> {
    if (config.style?.characterPane === false || !config.combat?.enabled || panesInFlight >= MAX_PANES_AT_ONCE) return null;
    panesInFlight++;
    try {
        const items = config.shop?.items ?? {};
        const equips = profile.equips ?? {};
        const slotOf = (key: EquipSlot): PaneSlot => {
            const meta = SLOT_META.find((m) => m.key === key)!;
            const item = equips[key] ? items[equips[key]!] : undefined;
            const held = equips[key] ? profile.inventory?.[equips[key]!] : undefined;
            return { label: meta.label, emoji: item?.emoji ?? held?.emoji ?? null, rarity: (item?.rarity as PaneSlot["rarity"]) ?? null };
        };
        const stats = calculateStats(profile, config, items);
        const cp = combatProgress(profile, config);
        const render = renderCharacterPane({
            name, title: titleOf(profile, config), avatarUrl,
            combatLevel: cp.level, xp: cp.span ? cp.into / cp.span : null,
            hp: resolveCurrentHp(profile, stats, config), maxHp: stats.maxHp,
            status: woundedUntil(profile, config)?.status.emoji ?? null,
            left: (["head", "body", "hands", "legs", "feet"] as const).map(slotOf),
            right: (["weapon", "shield", "accessory", "aura"] as const).map(slotOf),
        });
        // A slow avatar or emoji fetch must not hold the reply.
        const timeout = new Promise<null>((resolve) => setTimeout(resolve, 4000, null).unref());
        const png = await Promise.race([render, timeout]).catch((err) => {
            console.error("Failed to draw a character pane:", err);
            return null;
        });
        return png ? new AttachmentBuilder(png, { name: "me.png" }) : null;
    } finally {
        panesInFlight--;
    }
}

export function renderSheet(profile: DbUserGuildProfile, config: GuildConfig, name: string, ownerId: string, canAct: boolean, facts: MemberFacts = memberFacts(null), withPane = false) {
    const xp = Number(profile.xp ?? 0);
    const level = calculateLevelFromXp(xp, config);
    const from = levelStartXp(level, config);
    const to = calculateTotalXpForLevel(level + 1, config);
    const into = Math.max(0, xp - from);
    const span = Math.max(1, to - from);
    const xpName = config.style.xp.name || "XP";
    const goldName = config.style.gold.name || "gold";

    const c = new ContainerBuilder().setAccentColor(accentColor(config.style.mainThemeColor));
    // Servers that keep another leveling bot turn havocish's off: no chat level to show.
    // The drawn pane leads, when there is one; the text below keeps the details.
    if (withPane) c.addMediaGalleryComponents((g) => g.addItems((i) => i.setURL("attachment://me.png")));
    const title = titleOf(profile, config);
    const heading = `## ${name}${title ? ` *${title}*` : ""}`;
    c.addTextDisplayComponents(t => t.setContent(config.xp.enabled === false ? heading : [
        `${heading} · Level ${level}`,
        `\`${bar(into / span)}\` ${into.toLocaleString()} / ${span.toLocaleString()} ${xpName} to level ${level + 1}`,
    ].join("\n")));

    if (config.combat?.enabled) {
        const stats = calculateStats(profile, config, config.shop?.items ?? {});
        const hp = resolveCurrentHp(profile, stats, config);
        const toFull = minutesToFull(hp, stats, config);
        const rest = toFull ? ` Back to full in ${toFull >= 60 ? `${Math.floor(toFull / 60)}h ${toFull % 60}m` : `${toFull} min`}.` : "";
        const cp = combatProgress(profile, config);
        c.addSeparatorComponents(s => s).addTextDisplayComponents(t => t.setContent([
            `⚔️ **Combat ${cp.level}** ${cp.span ? `\`${bar(cp.into / cp.span)}\` ${cp.into.toLocaleString()} / ${cp.span.toLocaleString()} XP` : "max"}`,
            `❤️ **HP** \`${bar(hp / stats.maxHp)}\` ${hp} / ${stats.maxHp}`,
            `⚔️ **ATK** ${stats.atk}  ·  🛡️ **DEF** ${stats.def}  ·  💨 **SPD** ${stats.spd}  ·  🎯 **CRIT** ${stats.critChance.toFixed(1)}%`,
            ...chatBonusLine(profile, config),
            `🗡️ **Moves** ${loadoutFor(profile, config, facts).map((id) => { const m = moveById(config, id); return `${m.emoji} ${m.name}`; }).join("  ·  ")}`,
            ...(() => {
                const wound = woundedUntil(profile, config);
                return wound ? [woundLine(wound.status, wound.until)] : [];
            })(),
            hp <= 0
                ? `-# ⚠️ 0 HP: rest, or heal with food, a potion or \`/daily\`.${rest}`
                : hp < stats.maxHp / 3 ? `-# Low on HP. Heal before a tough fight.${rest}` : hp < stats.maxHp ? `-# Ready to fight.${rest}` : "-# Ready to fight.",
        ].join("\n")));
    }

    const equips = profile.equips ?? {};
    const inventory = profile.inventory ?? {};
    const gear = SLOT_META.map(({ key, label, emoji }) => {
        const itemId = equips[key];
        if (!itemId) return `${emoji} ${label} · _empty_`;
        const item = config.shop?.items?.[itemId];
        const itemName = `${item?.emoji ?? inventory[itemId]?.emoji ?? ""} ${item?.name ?? inventory[itemId]?.name ?? itemId}`.trim();
        const bonus = itemBonus(config, itemId);
        return `${emoji} ${label} · **${itemName}**${bonus ? ` (${bonus})` : ""}`;
    });
    c.addSeparatorComponents(s => s).addTextDisplayComponents(t => t.setContent(`**Equipped**\n${gear.join("\n")}`));

    const activities = enabledActivities(config);
    const stations = enabledStations(config);
    if (activities.length || stations.length) {
        const skills = activities.map((a) => {
            const mine = profile.user_stats?.gathering?.[a.id];
            const { level, into, span } = skillProgress(mine?.xp ?? 0, config);
            const { energy, max } = energyNow(mine, a);
            const tool = bestTool(inventory, config, a.id);
            const toolName = tool ? config.shop?.items?.[tool.itemId]?.name : null;
            const progress = span ? `\`${bar(into / span)}\` ${into} / ${span}` : "max";
            return `${a.emoji} **${a.skillName} ${level}** ${progress} · ⚡ ${energy}/${max}${toolName ? ` · ${toolName}` : ""}`;
        });
        for (const st of stations) {
            const { level, into, span } = skillProgress(profile.user_stats?.crafting?.[st.id]?.xp ?? 0, config);
            skills.push(`${st.emoji} **${st.skillName} ${level}** ${span ? `\`${bar(into / span)}\` ${into}/${span}` : "max"}`);
        }
        const how = [activities.length ? "`/gather`" : "", stations.length ? "`/craft`" : ""].filter(Boolean).join(" and ");
        c.addSeparatorComponents(s => s).addTextDisplayComponents(t => t.setContent(`**Skills**\n${skills.join("\n")}\n-# Train them with ${how}.`));
    }

    c.addSeparatorComponents(s => s).addTextDisplayComponents(t => t.setContent(
        `${config.style.gold.icon || "💰"} ${Number(profile.gold ?? 0).toLocaleString()} ${goldName}  ·  🔥 ${profile.streak_count ?? 0}-day streak`,
    ));

    if (!canAct) return [c];
    // The inventory's own buttons: they turn this message into that view.
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`inventory:page:${ownerId}:0`).setLabel("Inventory").setEmoji("🎒").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`inventory:gear:${ownerId}:0`).setLabel("Change gear").setEmoji("⚔️").setStyle(ButtonStyle.Secondary),
    );
    if (config.combat?.enabled) row.addComponents(new ButtonBuilder().setCustomId("me:moves").setLabel("Moves").setEmoji("🗡️").setStyle(ButtonStyle.Secondary));
    if (collectionSets(config).length) row.addComponents(new ButtonBuilder().setCustomId("me:collection").setLabel("Collection").setEmoji("📖").setStyle(ButtonStyle.Secondary));
    return [c, row];
}

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inCachedGuild()) {
        await interaction.reply({ content: "Use `/me` in a server.", flags: MessageFlags.Ephemeral });
        return;
    }
    const target = interaction.options.getUser("user") ?? interaction.user;
    if (target.bot) {
        await interaction.reply({ content: "Bots don't have characters.", flags: MessageFlags.Ephemeral });
        return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { user: dbUser } = await getOrCreateDbUser({
        discordUserId: target.id, username: target.username, avatarUrl: target.displayAvatarURL(),
    });
    const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    const { profile } = await getOrCreateProfile({ userId: dbUser.id, guildId: dbGuild.id });

    const self = target.id === interaction.user.id;
    if (!self && profile.settings?.profilePrivate) {
        await interaction.editReply({ content: `${target.username} keeps their character private.` });
        return;
    }

    const member = self ? interaction.member : await interaction.guild.members.fetch(target.id).catch(() => null);
    const name = member?.displayName ?? target.displayName;
    const pane = await paneFile(profile, config, name, (member ?? target).displayAvatarURL({ extension: "png", size: 256 }));
    await interaction.editReply({
        components: renderSheet(profile, config, name, target.id, self, memberFacts(member), !!pane),
        files: pane ? [pane] : [],
        flags: MessageFlags.IsComponentsV2,
    });
}

/** /me's Moves and Collection buttons: open those views privately, for whoever pressed. */
export async function handleMeButton(interaction: ButtonInteraction) {
    if (interaction.customId === "me:moves") await openMoves(interaction);
    else if (interaction.customId === "me:collection") await openCollection(interaction);
}
