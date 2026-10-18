import type { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import * as set from "./set.js";
import * as adminInventory from "./adminInventory.js";
import { autocompleteShopItems } from "../../ui/autocomplete.js";

/**
 * One command for fixing a member by hand: `/admin set …` and `/admin items …`.
 * The subcommands are the old /set and /admin-inv ones, moved into groups, so
 * their handlers (which read getSubcommand()) run unchanged.
 */
const subs = (cmd: SlashCommandBuilder) => cmd.options as unknown as SlashCommandSubcommandBuilder[];

export const data = new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Change a member's XP, level, gold, streak or items")
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
    });

export async function execute(interaction: ChatInputCommandInteraction) {
    const group = interaction.options.getSubcommandGroup();
    if (group === "set") return set.execute(interaction);
    if (group === "items") return adminInventory.execute(interaction);
}

export const autocomplete = autocompleteShopItems;
