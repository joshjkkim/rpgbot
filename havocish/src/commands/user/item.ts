import { type AutocompleteInteraction, ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from "discord.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { autocompleteShopItems } from "../../ui/autocomplete.js";
import { renderItemCard } from "../../ui/canvas/itemCard.js";

export const data = new SlashCommandBuilder()
    .setName("item")
    .setDescription("Look up what an item does")

    .addStringOption(option =>
        option.setName("item_id")
            .setDescription("The item to inspect")
            .setRequired(true)
            .setAutocomplete(true)
    )

    .addBooleanOption(option =>
        option.setName("share")
            .setDescription("Post the card in the channel instead of only to you")
            .setRequired(false)
    );

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply("This command can only be used in a server.");
        return;
    }

    const share = interaction.options.getBoolean("share") ?? false;
    await interaction.deferReply(share ? {} : { flags: MessageFlags.Ephemeral });

    const { config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    const itemId = interaction.options.getString("item_id", true);
    const item = config.shop?.items?.[itemId];

    if (!item) {
        await interaction.editReply({ content: "❌ This server has no item by that name." });
        return;
    }

    await interaction.editReply({ files: [await renderItemCard(item)] });
}

export async function autocomplete(interaction: AutocompleteInteraction) {
    await autocompleteShopItems(interaction);
}
