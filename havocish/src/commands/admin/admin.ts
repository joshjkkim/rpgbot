import type { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { resetRoleRewards } from "../../player/levelRewards.js";
import * as set from "./set.js";
import * as adminInventory from "./adminInventory.js";
import { autocompleteShopItems } from "../../ui/autocomplete.js";

/**
 * One command for fixing a member by hand: `/admin set …`, `/admin items …`
 * and `/admin reset-role-reward`.
 * The subcommands are the old /set and /admin-inv ones, moved into groups, so
 * their handlers (which read getSubcommand()) run unchanged.
 */
const subs = (cmd: SlashCommandBuilder) => cmd.options as unknown as SlashCommandSubcommandBuilder[];

export const data = new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Change a member's XP, level, gold, streak, items or role rewards")
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
        .addRoleOption((o) => o.setName("role").setDescription("Just this role's reward. Leave empty for all of them")));

export async function execute(interaction: ChatInputCommandInteraction) {
    const group = interaction.options.getSubcommandGroup();
    if (group === "set") return set.execute(interaction);
    if (group === "items") return adminInventory.execute(interaction);
    if (interaction.options.getSubcommand() === "reset-role-reward") return resetRoleReward(interaction);
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

export const autocomplete = autocompleteShopItems;
