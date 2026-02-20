import type { Client } from "discord.js";
import { Events } from "discord.js";
import { commands } from "../commands/index.js";
import { MessageFlags } from "discord.js";
import { handleConfigPanelSelect } from "../ui/panel/panelSelection.js";
import { handleConfigPanelButton } from "../ui/panel/panelButton.js";
import { handleConfigPanelModalSubmit } from "../ui/panel/panelModal.js";
import { handleBuyItemButton, handleMainShopButton, handlePurchaseItemModal } from "../commands/user/shop.js";
import { handleProfileButton } from "../commands/user/profile.js";
import { handleQuestsButton, handleQuestsClaimModal, handleQuestsStartModal } from "../commands/user/quests.js";

export function registerInteractionCreate(client: Client) {
    client.on(Events.InteractionCreate, async (interaction) => {
        try {

            if (interaction.isChatInputCommand()) {

                const command = commands.get(interaction.commandName);
                if (!command) return;
                await command.execute(interaction);

                return;
            } 
            
            if (interaction.isStringSelectMenu()) {
                if (interaction.customId.startsWith("config-panel:")) {
                    await handleConfigPanelSelect(interaction);
                }

                return;
            }

            if (interaction.isButton()) {
                if (interaction.customId.startsWith("config-panel:")) {
                    await handleConfigPanelButton(interaction);
                }else if (interaction.customId.startsWith("shop:buy")) {
                    await handleBuyItemButton(interaction);
                } else if (interaction.customId.startsWith("shop:")) {
                    await handleMainShopButton(interaction);
                } else if (interaction.customId.startsWith("profile:")) {
                    await handleProfileButton(interaction);
                } else if (interaction.customId.startsWith("quests:")) {
                    await handleQuestsButton(interaction);
                }

                return;
            }

            if (interaction.isModalSubmit()) {
                if (interaction.customId.startsWith("config-panel:")) {
                    await handleConfigPanelModalSubmit(interaction);
                } else if (interaction.customId.startsWith("shop:")) {
                    await handlePurchaseItemModal(interaction);
                } else if (interaction.customId.startsWith("quests:")) {
                    if(interaction.customId.startsWith("quests:modal:start")) {
                        await handleQuestsStartModal(interaction);
                    } else if (interaction.customId.startsWith("quests:modal:claim")) {
                        await handleQuestsClaimModal(interaction);
                    }
                }
                return;
            }

        } catch (err) {
            console.error("Error handling interaction:", err);
            if (interaction.isRepliable()) {

            await interaction.reply({
                content: "There was an error while handling that interaction.",
                flags: MessageFlags.Ephemeral,
            }).catch(() => null);
            }
        }
    });
}