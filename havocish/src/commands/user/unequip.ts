import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { equipItemFromInventory } from "../../player/inventory.js";
import type { EquipSlot } from "../../types/economy.js";

export const data = new SlashCommandBuilder()
    .setName("unequip")
    .setDescription("Unequip a slot from your equipment")
    
    .addStringOption(option =>
        option.setName("slot")
            .setDescription("The slot id to unequip")
            .setRequired(true)
            .addChoices(
                { name: 'Head', value: 'head' },
                { name: 'Body', value: 'body' },
                { name: 'Legs', value: 'legs' },
                { name: 'Feet', value: 'feet' },
                { name: 'Hands', value: 'hands' },
                { name: 'Weapon', value: 'weapon' },
                { name: 'Shield', value: 'shield' },
                { name: 'Accessory', value: 'accessory' },
                { name: 'Aura', value: 'aura' }
            )
    )

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply("This command can only be used in a server.");
        return;
    }

    await interaction.deferReply();

    const slot = interaction.options.getString("slot", true) as EquipSlot;

    const res = await equipItemFromInventory(interaction, "", slot); 

    if(res.success) {
        await interaction.editReply({ content: res.message });
    } else {
        await interaction.editReply({ content: res.message });
    }
}