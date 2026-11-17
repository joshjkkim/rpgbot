import type { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { query } from "../../db/index.js";
import { achievementHolders, resetAchievement } from "../../player/achievements.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { resetRoleRewards } from "../../player/levelRewards.js";
import * as set from "./set.js";
import * as adminInventory from "./adminInventory.js";
import { autocompleteShopItems, autocompleteSkills, respondFiltered } from "../../ui/autocomplete.js";

/**
 * One command for fixing a member by hand: `/admin set …`, `/admin items …`
 * `/admin reset-role-reward` and `/admin reset-achievement`.
 * The subcommands are the old /set and /admin-inv ones, moved into groups, so
 * their handlers (which read getSubcommand()) run unchanged.
 */
const subs = (cmd: SlashCommandBuilder) => cmd.options as unknown as SlashCommandSubcommandBuilder[];

export const data = new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Change a member's XP, level, gold, streak, items, role rewards or achievements")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommandGroup((g) => {
        g.setName("set").setDescription("Set a member's XP, level, gold or streak");
        for (const s of subs(set.data as SlashCommandBuilder)) g.addSubcommand(s);
        return g;
    })
    .addSubcommandGroup((g) => {
        g.setName("items").setDescription("View, give or remove a member's items");
        for (const s of subs(adminInventory.data as SlashCommandBuilder)) g.addSubcommand(s);
        return g;
    })
    .addSubcommand((s) => s
        .setName("reset-role-reward")
        .setDescription("Let a member get a role reward again")
        .addUserOption((o) => o.setName("member").setDescription("Whose role rewards to reset").setRequired(true))
        .addRoleOption((o) => o.setName("role").setDescription("Just this role's reward. Leave empty for all of them")))
    .addSubcommand((s) => s
        .setName("reset-achievement")
        .setDescription("Let members earn an achievement again, e.g. each month")
        .addStringOption((o) => o.setName("achievement").setDescription("Which achievement").setRequired(true).setAutocomplete(true))
        .addUserOption((o) => o.setName("member").setDescription("Just this member. Leave empty for everyone who has it"))
        .addBooleanOption((o) => o.setName("take_role").setDescription("Also take back the role it gave (default: yes)")));

export async function execute(interaction: ChatInputCommandInteraction) {
    const group = interaction.options.getSubcommandGroup();
    if (group === "set") return set.execute(interaction);
    if (group === "items") return adminInventory.execute(interaction);
    if (interaction.options.getSubcommand() === "reset-role-reward") return resetRoleReward(interaction);
    if (interaction.options.getSubcommand() === "reset-achievement") return resetAchievementCommand(interaction);
}

/**
 * Lets members earn an achievement again, for a monthly event: after a reset it
 * unlocks once they lose its role and get it back. Asks first, since it can't
 * be undone, and only ever takes back the achievement's own reward role.
 */
async function resetAchievementCommand(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const id = interaction.options.getString("achievement", true);
    const target = interaction.options.getUser("member");
    const takeRole = interaction.options.getBoolean("take_role") ?? true;
    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guild.id });
    const ach = config.achievements?.achievements?.[id];
    const quiet = { flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } } as const;
    if (!ach) return interaction.reply({ content: "That achievement doesn't exist. Pick one from the list.", ...quiet });

    const targetId = target ? (await getOrCreateDbUser({ discordUserId: target.id, username: target.username })).user.id : null;
    const holders = (await achievementHolders(guild.id, id)).filter((u) => !targetId || u === targetId);
    const who = target ? `<@${target.id}>` : `${holders.length} member${holders.length === 1 ? "" : "s"}`;
    if (!holders.length) return interaction.reply({ content: `${target ? `<@${target.id}> hasn't` : "Nobody has"} unlocked **${ach.name}**, so there's nothing to reset.`, ...quiet });

    const roleId = takeRole ? ach.reward?.roleId : undefined;
    const confirm = new ButtonBuilder().setCustomId("admin:reset-ach:yes").setStyle(ButtonStyle.Danger).setLabel(`Reset for ${target ? "them" : who}`);
    const cancel = new ButtonBuilder().setCustomId("admin:reset-ach:no").setStyle(ButtonStyle.Secondary).setLabel("Cancel");
    const response = await interaction.reply({
        content: `Reset **${ach.name}** for ${who}? This can't be undone.\n` +
            `Rewards already paid stay paid${roleId ? `, except the <@&${roleId}> role, which is taken back` : ""}. ` +
            "It unlocks again once they lose what earned it (such as its role) and get it back.",
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirm, cancel)],
        withResponse: true, ...quiet,
    });
    const click = await response.resource?.message?.awaitMessageComponent({
        componentType: ComponentType.Button, time: 60_000, filter: (i) => i.user.id === interaction.user.id,
    }).catch(() => null);
    if (!click || click.customId !== "admin:reset-ach:yes") {
        return interaction.editReply({ content: click ? "Cancelled. Nothing was reset." : "Timed out. Nothing was reset.", components: [] });
    }
    await click.update({ content: `Resetting **${ach.name}** for ${who}…`, components: [] });

    const reset = await resetAchievement({ guildId: guild.id, achievementId: id, userIds: holders });
    let removed = 0, failed = 0;
    if (roleId) {
        const rows = await query<{ discord_user_id: string }>(`SELECT discord_user_id FROM users WHERE id = ANY($1)`, [holders]);
        for (const { discord_user_id } of rows.rows) {
            const member = await interaction.guild.members.fetch(discord_user_id).catch(() => null);
            if (!member?.roles.cache.has(roleId)) continue;
            if (await member.roles.remove(roleId).then(() => true, () => false)) removed++; else failed++;
        }
    }
    await interaction.editReply({
        content: `Reset **${ach.name}** for ${reset} member${reset === 1 ? "" : "s"}.` +
            (roleId ? ` Took <@&${roleId}> back from ${removed}.` : "") +
            (failed ? ` Couldn't take it from ${failed}: drag havocish's role above <@&${roleId}> in Server Settings → Roles.` : ""),
    });
}

async function resetRoleReward(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) return;
    const target = interaction.options.getUser("member", true);
    const role = interaction.options.getRole("role");
    const { user } = await getOrCreateDbUser({ discordUserId: target.id, username: target.username });
    const { guild } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    const cleared = await resetRoleRewards({ userId: user.id, guildId: guild.id, roleId: role?.id });

    const content = cleared === 0
        ? `<@${target.id}> hasn't been paid ${role ? `the <@&${role.id}> reward` : "any role rewards"}, so there was nothing to reset.`
        : `Reset ${role ? `the <@&${role.id}> reward` : `${cleared} role reward${cleared === 1 ? "" : "s"}`} for <@${target.id}>. ` +
          "If they still have the role, it pays again the next time they chat or their roles change.";
    await interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
}

export async function autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused(true).name;
    if (focused === "achievement") return autocompleteAchievements(interaction);
    return focused === "skill" ? autocompleteSkills(interaction) : autocompleteShopItems(interaction);
}

async function autocompleteAchievements(interaction: AutocompleteInteraction) {
    if (!interaction.guildId) return interaction.respond([]);
    const { config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    await respondFiltered(interaction, Object.values(config.achievements?.achievements ?? {}).map((a) => ({ name: a.name, value: a.id })));
}
