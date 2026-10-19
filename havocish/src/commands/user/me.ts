import type { ChatInputCommandInteraction } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateProfile } from "../../cache/profileService.js";
import { calculateStats, resolveCurrentHp } from "../../player/combat.js";
import { calculateLevelFromXp, calculateTotalXpForLevel, levelStartXp } from "../../leveling/levels.js";
import { accentColor } from "../../ui/pager.js";
import { SLOT_META } from "./inventory.js";
import { bestTool, enabledActivities, energyNow, skillProgress } from "../../player/gathering.js";
import type { GuildConfig } from "../../types/guild.js";
import type { DbUserGuildProfile } from "../../types/userprofile.js";

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

function bar(fraction: number, length = 12) {
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

export function renderSheet(profile: DbUserGuildProfile, config: GuildConfig, name: string, ownerId: string, canAct: boolean) {
    const xp = Number(profile.xp ?? 0);
    const level = calculateLevelFromXp(xp, config);
    const from = levelStartXp(level, config);
    const to = calculateTotalXpForLevel(level + 1, config);
    const into = Math.max(0, xp - from);
    const span = Math.max(1, to - from);
    const xpName = config.style.xp.name || "XP";
    const goldName = config.style.gold.name || "gold";

    const c = new ContainerBuilder().setAccentColor(accentColor(config.style.mainThemeColor));
    c.addTextDisplayComponents(t => t.setContent([
        `## ${name} · Level ${level}`,
        `\`${bar(into / span)}\` ${into.toLocaleString()} / ${span.toLocaleString()} ${xpName} to level ${level + 1}`,
    ].join("\n")));

    if (config.combat?.enabled) {
        const stats = calculateStats(profile, config, config.shop?.items ?? {});
        const hp = resolveCurrentHp(profile, stats);
        c.addSeparatorComponents(s => s).addTextDisplayComponents(t => t.setContent([
            `❤️ **HP** \`${bar(hp / stats.maxHp)}\` ${hp} / ${stats.maxHp}`,
            `⚔️ **ATK** ${stats.atk}  ·  🛡️ **DEF** ${stats.def}  ·  💨 **SPD** ${stats.spd}  ·  🎯 **CRIT** ${stats.critChance.toFixed(1)}%`,
            hp <= 0
                ? "-# ⚠️ 0 HP: heal with `/daily` or a potion before fighting."
                : hp < stats.maxHp / 3 ? "-# Low on HP. Heal before a tough fight." : "-# Ready to fight.",
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
    if (activities.length) {
        const skills = activities.map((a) => {
            const mine = profile.user_stats?.gathering?.[a.id];
            const { level, into, span } = skillProgress(mine?.xp ?? 0, config);
            const { energy, max } = energyNow(mine, a);
            const tool = bestTool(inventory, config, a.id);
            const toolName = tool ? config.shop?.items?.[tool.itemId]?.name : null;
            const progress = span ? `\`${bar(into / span)}\` ${into} / ${span}` : "max";
            return `${a.emoji} **${a.skillName} ${level}** ${progress} · ⚡ ${energy}/${max}${toolName ? ` · ${toolName}` : ""}`;
        });
        c.addSeparatorComponents(s => s).addTextDisplayComponents(t => t.setContent(`**Skills**\n${skills.join("\n")}\n-# Train them with \`/gather\`.`));
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
    await interaction.editReply({
        components: renderSheet(profile, config, name, target.id, self),
        flags: MessageFlags.IsComponentsV2,
    });
}
