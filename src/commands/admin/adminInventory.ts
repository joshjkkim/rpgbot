import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { handleViewInventory, handleClearInventory, handleRemoveItem, handleGiveItem } from "../../inventory/inventory.js";

export const data = new SlashCommandBuilder()
    .setName("admin-inv")
    .setDescription("Admin inventory management commands")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(sub =>
        sub.setName("view").setDescription("View a user's inventory")
            .addUserOption(option =>
                option.setName("user")
                    .setDescription("The user whose inventory to view")
                    .setRequired(true)
            )
    )

    .addSubcommand(sub =>
        sub.setName("clear").setDescription("Clear a user's inventory")
            .addUserOption(option =>
                option.setName("user")
                    .setDescription("The user whose inventory to clear")
                    .setRequired(true)
            )
    )

    .addSubcommand(sub =>
        sub.setName("remove").setDescription("Remove a specific item from a user's inventory")
            .addUserOption(option =>
                option.setName("user")
                    .setDescription("The user whose item to remove")
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName("item_id")
                    .setDescription("The ID of the item to remove")
                    .setRequired(true)
            )
            .addIntegerOption(option =>
                option.setName("quantity")
                    .setDescription("The quantity of the item to remove")
                    .setRequired(false)
            )
    )

    .addSubcommand(sub =>
        sub.setName("give").setDescription("Give a specific item to a user's inventory")
            .addUserOption(option =>
                option.setName("user")
                    .setDescription("The user to give the item to")
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName("item_id")
                    .setDescription("The ID of the item to give")
                    .setRequired(true)
            )
            .addIntegerOption(option =>
                option.setName("quantity")
                    .setDescription("The quantity of the item to give")
                    .setRequired(true)
            )
    );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild || !interaction.inGuild()) {
        await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
        return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: "You do not have permission to use this command.", flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const sub = interaction.options.getSubcommand();
    
    switch (sub) {
        case "view":
            const targetUser = interaction.options.getUser("user", true);
            await handleViewInventory(interaction, targetUser.id);
            break;
        case "clear":
            const clearUser = interaction.options.getUser("user", true);
            await handleClearInventory(interaction, clearUser.id);
            break;
        case "remove":
            const removeUser = interaction.options.getUser("user", true);
            const removeItemId = interaction.options.getString("item_id", true);
            const removeQuantity = interaction.options.getInteger("quantity", false) ?? undefined;
            await handleRemoveItem(interaction, removeUser.id, removeItemId, removeQuantity);
            break;
        case "give":
            const giveUser = interaction.options.getUser("user", true);
            const giveItemId = interaction.options.getString("item_id", true);
            const giveQuantity = interaction.options.getInteger("quantity", true);
            await handleGiveItem(interaction, giveUser.id, giveItemId, giveQuantity);
            break;
        default:
            await interaction.reply({ content: "Unknown subcommand.", flags: MessageFlags.Ephemeral });
    }
}
