import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { useItemFromInventory } from "../../player/inventory.js";

export const data = new SlashCommandBuilder()
    .setName("use")
    .setDescription("Use an item from your inventory")
    
    .addStringOption(option =>
        option.setName("item_id")
            .setDescription("The item id to use")
            .setRequired(true)
    )

    .addIntegerOption(option =>
        option.setName("quantity")
            .setDescription("The quantity of the item to use")
            .setRequired(false)
            .setMinValue(1)
    );

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply("This command can only be used in a server.");
        return;
    }

    await interaction.deferReply();

    const itemId = interaction.options.getString("item_id", true);
    const quantity = interaction.options.getInteger("quantity") || 1;

    const res = await useItemFromInventory(interaction, itemId, quantity); 

    if(res.success) {
        await interaction.editReply({ content: res.message });
    } else {
        await interaction.editReply({ content: res.message });
    }
}