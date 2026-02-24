import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChatInputCommandInteraction,
    MessageFlags,
    ModalBuilder,
    ModalSubmitInteraction,
    SlashCommandBuilder,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import { getOrCreateProfile } from "../../cache/profileService.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { acceptTrade, cancelTrade, createTrade, denyTrade, viewTrades } from "../../db/trade.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseItemLines(raw: string): Record<string, number> | null {
    const result: Record<string, number> = {};
    const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
        const [id, qtyStr] = line.split(":").map(s => s.trim());
        if (!id) continue;
        const qty = parseInt(qtyStr ?? "1");
        if (isNaN(qty) || qty <= 0) return null;
        result[id] = qty;
    }
    return result;
}

function formatItems(items: Record<string, number> | null | undefined): string {
    if (!items || Object.keys(items).length === 0) return "None";
    return Object.entries(items).map(([id, qty]) => `\`${id}\` ×${qty}`).join(", ");
}

// ─── Slash Command Definition ────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
    .setName("trade")
    .setDescription("Trade items/gold with another player")

    .addSubcommand(sub =>
        sub.setName("offer")
            .setDescription("Open your inventory and start a trade offer")
            .addUserOption(opt =>
                opt.setName("receiver")
                    .setDescription("The player to send the trade offer to")
                    .setRequired(true)
            )
    )

    .addSubcommand(sub =>
        sub.setName("inbound")
            .setDescription("View your inbound trade offers")
    )

    .addSubcommand(sub =>
        sub.setName("outbound")
            .setDescription("View your outbound trade offers")
    )

    .addSubcommand(sub =>
        sub.setName("accept")
            .setDescription("Accept a trade offer")
            .addStringOption(opt =>
                opt.setName("trade_id")
                    .setDescription("The trade ID to accept")
                    .setRequired(true)
            )
    )

    .addSubcommand(sub =>
        sub.setName("deny")
            .setDescription("Deny an inbound trade offer")
            .addStringOption(opt =>
                opt.setName("trade_id")
                    .setDescription("The trade ID to deny")
                    .setRequired(true)
            )
    )

    .addSubcommand(sub =>
        sub.setName("cancel")
            .setDescription("Cancel one of your outbound trade offers")
            .addStringOption(opt =>
                opt.setName("trade_id")
                    .setDescription("The trade ID to cancel")
                    .setRequired(true)
            )
    );

// ─── /trade (slash command entry) ───────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
        return;
    }

    const sub = interaction.options.getSubcommand();

    // offer shows inventory + button before deferring so we can show a modal later
    if (sub === "offer") {
        const receiver = interaction.options.getUser("receiver", true);

        if (receiver.id === interaction.user.id) {
            await interaction.reply({ content: "You can't trade with yourself.", flags: MessageFlags.Ephemeral });
            return;
        }

        const { user: askerUser } = await getOrCreateDbUser({ discordUserId: interaction.user.id });
        const { guild } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
        const { profile: askerProfile } = await getOrCreateProfile({ userId: askerUser.id, guildId: guild.id });
        const { user: receiverUser } = await getOrCreateDbUser({ discordUserId: receiver.id });
        const { profile: receiverProfile } = await getOrCreateProfile({ userId: receiverUser.id, guildId: guild.id });

        const inventory = askerProfile.inventory ?? {};
        const receiverInventory = receiverProfile.inventory ?? {}
        const inventoryLines = Object.values(inventory).length === 0
            ? "_Your inventory is empty._"
            : Object.values(inventory)
                .map(item => `• \`${item.id}\` — ${item.emoji ?? ""} **${item.name}** ×${item.quantity}`)
                .join("\n");

        const receiverInventoryLines = Object.values(receiverInventory).length === 0
            ? "_Their inventory is empty._"
            : Object.values(receiverInventory)
                .map(item => `• \`${item.id}\` — ${item.emoji ?? ""} **${item.name}** ×${item.quantity}`)
                .join("\n");

        const button = new ButtonBuilder()
            .setCustomId(`trade:offer-modal:${receiver.id}`)
            .setLabel(`Send Trade Offer to ${receiver.username}`)
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

        await interaction.reply({
            flags: MessageFlags.Ephemeral,
            embeds: [{
                title: "🎒 Yours and Theirs Inventories",
                description: `${inventoryLines}\n\n**Gold:** ${askerProfile.gold ?? 0}\n==================================
                    ${receiverInventoryLines}\n\n **Their Gold** ${receiverProfile.gold ?? 0}\n\nClick below to fill out your trade offer
                `,
                color: 0x5865f2,
                footer: { text: "Use the item IDs shown above in the trade modal" },
            }],
            components: [row],
        });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { user: askerUser } = await getOrCreateDbUser({ discordUserId: interaction.user.id });
    const { config, guild } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    const { profile: askerProfile } = await getOrCreateProfile({ userId: askerUser.id, guildId: guild.id });

    switch (sub) {
        case "inbound": {
            const trades = await viewTrades({ guildId: String(guild.id), receiverId: String(askerProfile.id), status: "pending" });
            if (!Array.isArray(trades) || trades.length === 0) {
                await interaction.editReply({ content: "You have no pending inbound trade offers." });
                return;
            }
            await interaction.editReply({
                embeds: [{
                    title: "📥 Inbound Trade Offers",
                    color: 0x00bfff,
                    description: trades.map(t =>
                        `**Trade \`#${t.id}\`**\n` +
                        `👤 From: <@${t.asker_discord_id}>\n` +
                        `🎒 They offer: ${formatItems(t.asker_items)} + **${t.asker_gold ?? 0}** gold\n` +
                        `🎒 You owe: ${formatItems(t.receiver_items)} + **${t.receiver_gold ?? 0}** gold\n` +
                        `⏰ Expires: <t:${Math.floor(new Date(t.expires_at).getTime() / 1000)}:R>`
                    ).join("\n\n"),
                    footer: { text: `${trades.length} pending offer(s) • use /trade accept <id> or /trade deny <id>` },
                    timestamp: new Date().toISOString(),
                }],
            });
            break;
        }

        case "outbound": {
            const trades = await viewTrades({ guildId: String(guild.id), askerId: String(askerProfile.id), status: "pending" });
            if (!Array.isArray(trades) || trades.length === 0) {
                await interaction.editReply({ content: "You have no pending outbound trade offers." });
                return;
            }
            await interaction.editReply({
                embeds: [{
                    title: "📤 Outbound Trade Offers",
                    color: 0xffa500,
                    description: trades.map(t =>
                        `**Trade \`#${t.id}\`**\n` +
                        `👤 To: <@${t.receiver_discord_id}>\n` +
                        `🎒 You offer: ${formatItems(t.asker_items)} + **${t.asker_gold ?? 0}** gold\n` +
                        `🎒 They owe: ${formatItems(t.receiver_items)} + **${t.receiver_gold ?? 0}** gold\n` +
                        `⏰ Expires: <t:${Math.floor(new Date(t.expires_at).getTime() / 1000)}:R>`
                    ).join("\n\n"),
                    footer: { text: `${trades.length} pending offer(s) • use /trade cancel <id> to withdraw` },
                    timestamp: new Date().toISOString(),
                }],
            });
            break;
        }

        case "accept": {
            const tradeId = interaction.options.getString("trade_id", true);
            const res = await acceptTrade(tradeId, askerProfile, guild);
            await interaction.editReply({ content: res.message });
            break;
        }

        case "deny": {
            const tradeId = interaction.options.getString("trade_id", true);
            const res = await denyTrade(tradeId, String(askerProfile.id));
            await interaction.editReply({ content: res.message });
            break;
        }

        case "cancel": {
            const tradeId = interaction.options.getString("trade_id", true);
            const res = await cancelTrade(tradeId, String(askerProfile.id));
            await interaction.editReply({ content: res.message });
            break;
        }

        default:
            await interaction.editReply({ content: "Invalid subcommand." });
    }
}

// ─── Button: open trade offer modal ─────────────────────────────────────────

export async function handleTradeOfferButton(interaction: ButtonInteraction) {
    // customId: trade:offer-modal:{receiverDiscordId}
    const receiverDiscordId = interaction.customId.split(":")[2];

    const modal = new ModalBuilder()
        .setCustomId(`trade:modal:offer:${receiverDiscordId}`)
        .setTitle("Send Trade Offer");

    const yourItems = new TextInputBuilder()
        .setCustomId("your_items")
        .setLabel("Your items (item_id:quantity, one per line)")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("sword:1\nhealth_potion:3")
        .setRequired(false);

    const theirItems = new TextInputBuilder()
        .setCustomId("their_items")
        .setLabel("Their items (item_id:quantity, one per line)")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("shield:1")
        .setRequired(false);

    const yourGold = new TextInputBuilder()
        .setCustomId("your_gold")
        .setLabel("Your gold")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("0")
        .setValue("0")
        .setRequired(false);

    const theirGold = new TextInputBuilder()
        .setCustomId("their_gold")
        .setLabel("Their gold")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("0")
        .setValue("0")
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(yourItems),
        new ActionRowBuilder<TextInputBuilder>().addComponents(theirItems),
        new ActionRowBuilder<TextInputBuilder>().addComponents(yourGold),
        new ActionRowBuilder<TextInputBuilder>().addComponents(theirGold),
    );

    await interaction.showModal(modal);
}

// ─── Modal submit: create trade ───────────────────────────────────────────────

export async function handleTradeOfferModal(interaction: ModalSubmitInteraction) {
    // customId: trade:modal:offer:{receiverDiscordId}
    const receiverDiscordId = interaction.customId.split(":")[3];

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!receiverDiscordId) {
        await interaction.editReply({ content: "Invalid trade modal — missing receiver." });
        return;
    }

    const rawYourItems = interaction.fields.getTextInputValue("your_items").trim();
    const rawTheirItems = interaction.fields.getTextInputValue("their_items").trim();
    const rawYourGold = interaction.fields.getTextInputValue("your_gold").trim();
    const rawTheirGold = interaction.fields.getTextInputValue("their_gold").trim();

    const askerItems = rawYourItems ? parseItemLines(rawYourItems) : {};
    const receiverItems = rawTheirItems ? parseItemLines(rawTheirItems) : {};

    if (askerItems === null || receiverItems === null) {
        await interaction.editReply({ content: "Invalid item format. Use `item_id:quantity` on each line." });
        return;
    }

    if (Object.keys(askerItems).length === 0 && Object.keys(receiverItems).length === 0 &&
        !Number(rawYourGold) && !Number(rawTheirGold)) {
        await interaction.editReply({ content: "A trade offer can't be completely empty." });
        return;
    }

    const askerGold = Math.max(0, parseInt(rawYourGold) || 0);
    const receiverGold = Math.max(0, parseInt(rawTheirGold) || 0);

    if (!interaction.guildId) {
        await interaction.editReply({ content: "This can only be used in a server." });
        return;
    }

    const { user: askerUser } = await getOrCreateDbUser({ discordUserId: interaction.user.id });
    const { user: receiverUser } = await getOrCreateDbUser({ discordUserId: receiverDiscordId });
    const { guild } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    const { profile: askerProfile } = await getOrCreateProfile({ userId: askerUser.id, guildId: guild.id });
    const { profile: receiverProfile } = await getOrCreateProfile({ userId: receiverUser.id, guildId: guild.id });

    const res = await createTrade({
        asker: askerProfile,
        askerDiscordId: askerUser.discord_user_id,
        receiver: receiverProfile,
        receiverDiscordId: receiverUser.discord_user_id,
        askerItems,
        receiverItems,
        askerGold,
        receiverGold,
    }, guild);

    if (res.success) {
        await interaction.editReply({
            embeds: [{
                title: "✅ Trade Offer Sent",
                color: 0x57f287,
                description:
                    `**Trade ID:** \`#${res.tradeId}\`\n` +
                    `**To:** <@${receiverDiscordId}>\n\n` +
                    `🎒 **You offer:** ${formatItems(askerItems)} + **${askerGold}** gold\n` +
                    `🎒 **They owe:** ${formatItems(receiverItems)} + **${receiverGold}** gold\n\n` +
                    `They can accept or deny with \`/trade inbound\`.`,
                footer: { text: "Expires in 24 hours" },
            }],
        });

        const receiverDiscordUser = await interaction.client.users.fetch(receiverDiscordId);
        if(receiverDiscordUser) {
            await receiverDiscordUser.send({
                content: `You have a new trade offer from <@${interaction.user.id}> in **${interaction.guild?.name}**.`
            });
        }
    } else {
        await interaction.editReply({ content: "Failed to create trade offer. Make sure both parties have the required items and gold." });
    }
}