import type { Client } from "discord.js";
import { Events } from "discord.js";
import { commands } from "../commands/index.js";
import { MessageFlags } from "discord.js";
import { handleConfigPanelButton, handleConfigPanelModalSubmit, handleConfigPanelSelect } from "../ui/configPanel.js";

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
                }

                return;
            }

            if (interaction.isModalSubmit()) {
                if (interaction.customId.startsWith("config-panel:")) {
                    await handleConfigPanelModalSubmit(interaction);
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