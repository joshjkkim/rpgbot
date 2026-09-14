import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from "discord.js";
import { getOrCreateProfile } from "../../cache/profileService.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { transferItem } from "../../player/trading.js";

export const data = new SlashCommandBuilder()
    .setName("gift")
    .setDescription("Gift an item to another player")

    .addUserOption(option =>
        option.setName("receiver")
            .setDescription("The player to receive the gift")
            .setRequired(true)
    )
    
    .addStringOption(option =>
        option.setName("item_id")
            .setDescription("The item id to gift")
            .setRequired(true)
    )

    .addIntegerOption(option =>
        option.setName("quantity")
            .setDescription("The quantity of the item to gift")
            .setRequired(true)
    );



export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply("This command can only be used in a server.");
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const itemId = interaction.options.getString("item_id", true);
    const receiver = interaction.options.getUser("receiver", true);
    const quantity = interaction.options.getInteger("quantity", true);

    const { config: guildConfig, guild: dbGuild } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });

    if(!guildConfig.shop.gifting?.enabled) {
        await interaction.editReply({ content: "Gifting is not enabled on this server." });
        return;
    }

    const { user: giverDBUser } = await getOrCreateDbUser({ discordUserId: interaction.user.id});
    const { user: receiverDBUser } = await getOrCreateDbUser({ discordUserId: receiver.id });

    const { profile: giverProfile } = await getOrCreateProfile({ userId: giverDBUser.id, guildId: dbGuild.id });
    const { profile: receiverProfile } = await getOrCreateProfile({ userId: receiverDBUser.id, guildId: dbGuild.id });

    const res = await transferItem(giverProfile, receiverProfile, itemId, quantity, guildConfig);

    const announceChannel = guildConfig.shop.gifting?.announceChannel || null;
    const dmBool = guildConfig.shop.gifting?.dm || false;
    const message = guildConfig.shop.gifting?.message || null;

    if(res.success) {
        await interaction.editReply({ content: res.message });
        if (announceChannel) {
            const channel = await interaction.guild?.channels.fetch(announceChannel);
            if (channel?.isTextBased()) {
                await channel.send({ content: message ? message.replace("{giver}", interaction.user.username).replace("{receiver}", receiver.username).replace("{item}", itemId).replace("{quantity}", quantity.toString()) : res.message });
            }
        }

        if (dmBool) {
            await receiver.send({ content: message ? message.replace("{giver}", interaction.user.username).replace("{receiver}", receiver.username).replace("{item}", itemId).replace("{quantity}", quantity.toString()) : res.message });
        }
    } else {
        await interaction.editReply({ content: res.message });
    }
}