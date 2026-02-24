import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { equipItemFromInventory } from "../../player/inventory.js";

export const data = new SlashCommandBuilder()
    .setName("equip")
    .setDescription("Equip an item from your inventory")
    
    .addStringOption(option =>
        option.setName("item_id")
            .setDescription("The item id to equip")
            .setRequired(true)
    )

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply("This command can only be used in a server.");
        return;
    }

    await interaction.deferReply();

    const itemId = interaction.options.getString("item_id", true);

    const res = await equipItemFromInventory(interaction, itemId); 

    if(res.success) {
        await interaction.editReply({ content: res.message });
    } else {
        await interaction.editReply({ content: res.message });
    }
}