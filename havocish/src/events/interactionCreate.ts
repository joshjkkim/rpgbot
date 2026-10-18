import type { Client, Interaction } from "discord.js";
import { Events } from "discord.js";
import { commands } from "../commands/index.js";
import { MessageFlags } from "discord.js";
import { handleConfigPanelSelect } from "../ui/panel/panelSelection.js";
import { handleConfigPanelButton } from "../ui/panel/panelButton.js";
import { handleConfigPanelModalSubmit } from "../ui/panel/panelModal.js";
import { handleShopButton } from "../commands/user/shop.js";
import { handleProfileButton } from "../commands/user/profile.js";
import { handleInventoryButton } from "../commands/user/inventory.js";
import { handleQuestsButton } from "../commands/user/quests.js";
import { handleTradeOfferButton, handleTradeOfferModal } from "../commands/user/trade.js";
import { handleSettingsModal } from "../commands/user/settings.js";
import { handleFightButton } from "../commands/user/fight.js";
import { handleDuelButton } from "../commands/user/duel.js";
import { handleEncounterButton } from "../player/encounters.js";
import { handleBossButton } from "../player/bosses.js";
import { handleHelpButton } from "../commands/user/help.js";
import { handleConfigButton } from "../commands/admin/configGeneral.js";
import { busyFighting } from "../player/fight.js";

/** While fighting, you fight: /fight (which brings the fight back) and /help are all that work. */
function allowedMidFight(interaction: Interaction): boolean {
    if (interaction.isChatInputCommand()) return interaction.commandName === "fight" || interaction.commandName === "help";
    if ("customId" in interaction) return interaction.customId.startsWith("fight:") || interaction.customId.startsWith("help:");
    return true;
}

export function registerInteractionCreate(client: Client) {
    client.on(Events.InteractionCreate, async (interaction) => {
        try {

            if (interaction.isAutocomplete()) {
                await commands.get(interaction.commandName)?.autocomplete?.(interaction);
                return;
            }

            if (interaction.isRepliable() && interaction.guildId && !allowedMidFight(interaction)) {
                const busy = busyFighting(interaction.user.id, interaction.guildId, "Everything else waits until it's over.");
                if (busy) {
                    await interaction.reply({ content: busy, flags: MessageFlags.Ephemeral });
                    return;
                }
            }

            if (interaction.isChatInputCommand()) {

                const command = commands.get(interaction.commandName);
                if (!command) return;
                await command.execute(interaction);

                return;
            } 
            
            if (interaction.isStringSelectMenu()) {
                if (interaction.customId.startsWith("config-panel:")) {
                    await handleConfigPanelSelect(interaction);
                } else if (interaction.customId.startsWith("inventory:")) {
                    await handleInventoryButton(interaction);
                }

                return;
            }

            if (interaction.isButton()) {
                if (interaction.customId.startsWith("config-panel:")) {
                    await handleConfigPanelButton(interaction);
                } else if (interaction.customId.startsWith("shop:")) {
                    await handleShopButton(interaction);
                } else if (interaction.customId.startsWith("profile:")) {
                    await handleProfileButton(interaction);
                } else if (interaction.customId.startsWith("quests:")) {
                    await handleQuestsButton(interaction);
                } else if (interaction.customId.startsWith("trade:")) {
                    await handleTradeOfferButton(interaction);
                } else if (interaction.customId.startsWith("inventory:")) {
                    await handleInventoryButton(interaction);
                } else if (interaction.customId.startsWith("fight:")) {
                    await handleFightButton(interaction);
                } else if (interaction.customId.startsWith("duel:")) {
                    await handleDuelButton(interaction);
                } else if (interaction.customId.startsWith("encounter:")) {
                    await handleEncounterButton(interaction);
                } else if (interaction.customId.startsWith("boss:")) {
                    await handleBossButton(interaction);
                } else if (interaction.customId.startsWith("help:")) {
                    await handleHelpButton(interaction);
                } else if (interaction.customId.startsWith("config:")) {
                    await handleConfigButton(interaction);
                }

                return;
            }

            if (interaction.isModalSubmit()) {
                if (interaction.customId.startsWith("config-panel:")) {
                    await handleConfigPanelModalSubmit(interaction);
                } else if (interaction.customId.startsWith("trade:modal:")) {
                    await handleTradeOfferModal(interaction);
                } else if (interaction.customId.startsWith("settings:modal:")) {
                    await handleSettingsModal(interaction);
                }
                return;
            }

        } catch (err) {
            console.error("Error handling interaction:", err);
            await reportInteractionError(interaction);
        }
    });
}

/**
 * Surfaces a handler error to the user.
 *
 * Nearly every handler dispatched above defers first, and `reply()` throws on an
 * interaction that is already deferred or replied. That threw inside the catch,
 * was swallowed by `.catch(() => null)`, and left the user looking at a spinner
 * that never resolved -- an error the user could see reported as no response at
 * all. Pick the call that matches the interaction's actual state.
 */
async function reportInteractionError(interaction: Interaction) {
    if (!interaction.isRepliable()) return;

    const content = "There was an error while handling that interaction.";

    try {
        if (interaction.replied) {
            await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
        } else if (interaction.deferred) {
            // Deferred but not yet answered: the spinner is waiting on an edit.
            // A message already sent as Components V2 refuses plain content, so
            // fall back to a private follow-up rather than leave the spinner.
            await interaction.editReply({ content }).catch(() =>
                interaction.followUp({ content, flags: MessageFlags.Ephemeral }));
        } else {
            await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        }
    } catch (err) {
        // The token can be expired or already consumed; nothing left to do.
        console.error("Failed to report interaction error to the user:", err);
    }
}
