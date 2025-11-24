import { ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } from "discord.js";

export async function handleConfigPanelButton(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("config-panel:")) return;

    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply({
        content: "This button can only be used in a server.",
        flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const [ ,section, action] = interaction.customId.split(":");

    switch (section) {
        case "xp": {
            if (action === "set-base") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:xp:set-base-modal")
                    .setTitle("Set Base XP per Message");

                const input = new TextInputBuilder()
                    .setCustomId("xp-base-input")
                    .setLabel("New base XP per message")
                    .setPlaceholder("e.g. 20")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-cooldown") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:xp:set-cooldown-modal")
                    .setTitle("Set Global XP Cooldown");
                    
                const input = new TextInputBuilder()
                    .setCustomId("xp-cooldown-input")
                    .setLabel("New global XP message cooldown (seconds)")
                    .setPlaceholder("e.g. 60")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-channel-overrides") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:xp:set-channel-overrides-modal")
                    .setTitle("Set Channel XP Overrides");

                const channelIdInput = new TextInputBuilder()
                    .setCustomId("xp-channel-overrides-id-input")
                    .setLabel("Discord Channel ID")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const enabledInput = new TextInputBuilder()
                    .setCustomId("xp-channel-overrides-enabled-input")
                    .setLabel("Enable Channel Overrides (true/false)")
                    .setPlaceholder("e.g. true")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const multiplierInput = new TextInputBuilder()
                    .setCustomId("xp-channel-overrides-multiplier-input")
                    .setLabel("XP Multiplier for Channel")
                    .setPlaceholder("e.g. 1.5")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const flatBonusInput = new TextInputBuilder()
                    .setCustomId("xp-channel-overrides-flat-bonus-input")
                    .setLabel("Flat Bonus XP for Channel")
                    .setPlaceholder("e.g. 10")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const cooldownInput = new TextInputBuilder()
                    .setCustomId("xp-channel-overrides-cooldown-input")
                    .setLabel("Cooldown in Seconds for Channel Override")
                    .setPlaceholder("e.g. 30")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);


                const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(channelIdInput);
                const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(enabledInput);
                const row3 = new ActionRowBuilder<TextInputBuilder>().addComponents(multiplierInput);
                const row4 = new ActionRowBuilder<TextInputBuilder>().addComponents(flatBonusInput);
                const row5 = new ActionRowBuilder<TextInputBuilder>().addComponents(cooldownInput);

                modal.addComponents(row1, row2, row3, row4, row5);

                await interaction.showModal(modal);
            } else if (action === "remove-channel-overrides") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:xp:remove-channel-overrides-modal")
                    .setTitle("Remove Channel XP Overrides");

                const input = new TextInputBuilder()
                    .setCustomId("xp-remove-channel-overrides-id-input")
                    .setLabel("Discord Channel ID to Remove")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-role-xp") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:xp:set-role-xp-modal")
                    .setTitle("Set Role XP Config");

                const roleIdInput = new TextInputBuilder()
                    .setCustomId("xp-role-id-input")
                    .setLabel("Discord Role ID")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const extraXpInput = new TextInputBuilder()
                    .setCustomId("xp-role-extra-xp-input")
                    .setLabel("Extra XP for Role")
                    .setPlaceholder("e.g. 10")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const multiplierInput = new TextInputBuilder()
                    .setCustomId("xp-role-multiplier-input")
                    .setLabel("XP Multiplier for Role")
                    .setPlaceholder("e.g. 1.5")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const cooldownInput = new TextInputBuilder()
                    .setCustomId("xp-role-cooldown-input")
                    .setLabel("Cooldown in Seconds for Role (Strictly Less than Global)")
                    .setPlaceholder("e.g. 0")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(roleIdInput);
                const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(extraXpInput);
                const row3 = new ActionRowBuilder<TextInputBuilder>().addComponents(multiplierInput);
                const row4 = new ActionRowBuilder<TextInputBuilder>().addComponents(cooldownInput);

                modal.addComponents(row1, row2, row3, row4);

                await interaction.showModal(modal);
            } else if (action === "remove-role-xp") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:xp:remove-role-xp-modal")
                    .setTitle("Remove Role XP Config");

                const input = new TextInputBuilder()
                    .setCustomId("xp-remove-role-id-input")
                    .setLabel("Discord Role ID to Remove")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            }
            break;
        }

        case "daily": {
            if (action === "xp") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:daily:set-xp-modal")
                    .setTitle("Set Base XP for Daily Reward");

                const input = new TextInputBuilder()
                    .setCustomId("daily-xp-input")
                    .setLabel("New base XP for daily reward")
                    .setPlaceholder("e.g. 20")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "gold") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:daily:set-gold-modal")
                    .setTitle("Set Base Gold for Daily Reward");

                const input = new TextInputBuilder()
                    .setCustomId("daily-gold-input")
                    .setLabel("New base Gold for daily reward")
                    .setPlaceholder("e.g. 20")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "auto") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:daily:set-auto-modal")
                    .setTitle("Enable/Disable Auto Daily");

                const input = new TextInputBuilder()
                    .setCustomId("daily-auto-input")
                    .setLabel("Normal Text Message Triggers Daily (true/false)")
                    .setPlaceholder("e.g. true")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "reply") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:daily:set-reply-modal")
                    .setTitle("Enable/Disable Reply to Daily In Channel");

                const input = new TextInputBuilder()
                    .setCustomId("daily-reply-input")
                    .setLabel("Enable reply to daily in channel (true/false)")
                    .setPlaceholder("e.g. true")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "ephemeral") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:daily:set-ephemeral-modal")
                    .setTitle("Enable/Disable Ephemeral Reply to Daily");

                const input = new TextInputBuilder()
                    .setCustomId("daily-ephemeral-input")
                    .setLabel("Enable ephemeral reply to daily (true/false)")
                    .setPlaceholder("e.g. true")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "reply-message") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:daily:set-reply-message-modal")
                    .setTitle("Set Reply Message for Daily Reward");

                const input = new TextInputBuilder()
                    .setCustomId("daily-reply-message-input")
                    .setLabel("Use {xp}, {gold}, {streak} as placeholders")
                    .setPlaceholder("e.g. You received {xp} XP and {gold} gold! Your streak is now {streak} days.")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "announce-channel") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:daily:set-announce-channel-modal")
                    .setTitle("Set Announce Channel for Daily Reward");

                const input = new TextInputBuilder()
                    .setCustomId("daily-announce-channel-input")
                    .setLabel("Discord Channel ID or \"none\", blank, \"null\" to disable")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "announce-message") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:daily:set-announce-message-modal")
                    .setTitle("Set Announce Message for Daily Reward");

                const input = new TextInputBuilder()
                    .setCustomId("daily-announce-message-input")
                    .setLabel("Use {user}, {level} as placeholders")
                    .setPlaceholder("e.g. {user} has received {xp} XP and {gold} gold! Their streak is now {streak} days.")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-role-bonuses") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:daily:set-role-bonuses-modal")
                    .setTitle("Set Role Daily XP/Gold Bonuses");

                const roleIdInput = new TextInputBuilder()
                    .setCustomId("daily-role-id-input")
                    .setLabel("Discord Role ID")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const xpBonusInput = new TextInputBuilder()
                    .setCustomId("daily-role-xp-bonus-input")
                    .setLabel("Daily XP Bonus for Role")
                    .setPlaceholder("e.g. 10")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const goldBonusInput = new TextInputBuilder()
                    .setCustomId("daily-role-gold-bonus-input")
                    .setLabel("Daily Gold Bonus for Role")
                    .setPlaceholder("e.g. 5")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const multiplerInput = new TextInputBuilder()
                    .setCustomId("daily-role-multiplier-input")
                    .setLabel("Daily Multiplier for Role")
                    .setPlaceholder("e.g. 1.5")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(roleIdInput);
                const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(xpBonusInput);
                const row3 = new ActionRowBuilder<TextInputBuilder>().addComponents(goldBonusInput);
                const row4 = new ActionRowBuilder<TextInputBuilder>().addComponents(multiplerInput);

                modal.addComponents(row1, row2, row3, row4);

                await interaction.showModal(modal);
            } else if (action === "remove-role-bonuses") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:daily:remove-role-bonuses-modal")
                    .setTitle("Remove Role Daily XP/Gold Bonuses");

                const input = new TextInputBuilder()
                    .setCustomId("daily-remove-role-id-input")
                    .setLabel("Discord Role ID to Remove")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            }   

            break;
        }
    
        case "vc": {
            if (action === "toggle") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:vc:set-toggle-modal")
                    .setTitle("Enable/Disable Voice Channel XP");

                const input = new TextInputBuilder()
                    .setCustomId("vc-toggle-input")
                    .setLabel("Enable Voice Channel XP (true/false)")
                    .setPlaceholder("e.g. true or false")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-base") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:vc:set-base-modal")
                    .setTitle("Set Base XP per Minute for Voice Channel");

                const input = new TextInputBuilder()
                    .setCustomId("vc-base-input")
                    .setLabel("Base XP per Minute")
                    .setPlaceholder("e.g. 10")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-minutes") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:vc:set-minutes-modal")
                    .setTitle("Set Minimum Minutes for Voice Channel XP");

                const input = new TextInputBuilder()
                    .setCustomId("vc-minutes-input")
                    .setLabel("Minimum Minutes for XP")
                    .setPlaceholder("e.g. 5")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-channel-overrides") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:vc:set-channel-overrides-modal")
                    .setTitle("Set Voice Channel XP Overrides");

                const channelIdInput = new TextInputBuilder()
                    .setCustomId("vc-channel-overrides-id-input")
                    .setLabel("Discord Channel ID")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const enabledInput = new TextInputBuilder()
                    .setCustomId("vc-channel-overrides-enabled-input")
                    .setLabel("Enable Channel Overrides (true/false)")
                    .setPlaceholder("e.g. true")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const flatBonusInput = new TextInputBuilder()
                    .setCustomId("vc-channel-overrides-flat-bonus-input")
                    .setLabel("Flat Bonus XP for Channel")
                    .setPlaceholder("e.g. 10")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const multiplierInput = new TextInputBuilder()
                    .setCustomId("vc-channel-overrides-multiplier-input")
                    .setLabel("XP Multiplier for Channel")
                    .setPlaceholder("e.g. 1.5")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(channelIdInput);
                const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(enabledInput);
                const row3 = new ActionRowBuilder<TextInputBuilder>().addComponents(flatBonusInput);
                const row4 = new ActionRowBuilder<TextInputBuilder>().addComponents(multiplierInput);

                modal.addComponents(row1, row2, row3, row4);

                await interaction.showModal(modal);
            } else if (action === "remove-channel-overrides") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:vc:remove-channel-overrides-modal")
                    .setTitle("Remove Voice Channel XP Overrides");

                const input = new TextInputBuilder()
                    .setCustomId("vc-remove-channel-overrides-id-input")
                    .setLabel("Discord Channel ID to Remove")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-role-xp") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:vc:set-role-xp-modal")
                    .setTitle("Set Voice Channel Role XP Config");

                const roleIdInput = new TextInputBuilder()
                    .setCustomId("vc-role-id-input")
                    .setLabel("Discord Role ID")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const multiplierInput = new TextInputBuilder()
                    .setCustomId("vc-role-multiplier-input")
                    .setLabel("XP Multiplier for Role")
                    .setPlaceholder("e.g. 1.5")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(roleIdInput);
                const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(multiplierInput);

                modal.addComponents(row1, row2);

                await interaction.showModal(modal);
            } else if (action === "remove-role-xp") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:vc:remove-role-xp-modal")
                    .setTitle("Remove Voice Channel Role XP Config");

                const input = new TextInputBuilder()
                    .setCustomId("vc-remove-role-id-input")
                    .setLabel("Discord Role ID to Remove")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            }
            break;
        }

        case "levels": {
            if (action === "set-curve") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:levels:set-curve-modal")
                    .setTitle("Set Curve for Levels");

                const typeInput = new TextInputBuilder()
                    .setCustomId("levels-curve-input")
                    .setLabel("Curve for Levels")
                    .setPlaceholder("e.g. linear, exponential, polynomial, logarithmic")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const paramInput1 = new TextInputBuilder()
                    .setCustomId("levels-curve-params-input")
                    .setLabel("Curve Parameter 1 (Depends on curve type)")
                    .setPlaceholder('linear: rate, exponential: base, polynomial: degree, logarithmic: base')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const paramInput2 = new TextInputBuilder()
                    .setCustomId("levels-curve-params-2-input")
                    .setLabel("Curve Parameter 2 (Depends on curve type))")
                    .setPlaceholder('linear: N/A, exponential: factor, polynomial: factor, logarithmic: factor')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const typeRow = new ActionRowBuilder<TextInputBuilder>().addComponents(typeInput);
                const paramRow1 = new ActionRowBuilder<TextInputBuilder>().addComponents(paramInput1);
                const paramRow2 = new ActionRowBuilder<TextInputBuilder>().addComponents(paramInput2);

                modal.addComponents(typeRow, paramRow1, paramRow2);

                await interaction.showModal(modal);
            } else if (action === "set-max-level") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:levels:set-max-level-modal")
                    .setTitle("Set Max Level");

                const input = new TextInputBuilder()
                    .setCustomId("levels-max-level-input")
                    .setLabel("Max Level (use 0 for no limit)")
                    .setPlaceholder("e.g. 100")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-announce-channel") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:levels:set-announce-channel-modal")
                    .setTitle("Set Level-Up Announce Channel");

                const input = new TextInputBuilder()
                    .setCustomId("levels-announce-channel-input")
                    .setLabel("Discord Channel ID or \"none\", blank, \"null\" to disable")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-announce-message") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:levels:set-announce-message-modal")
                    .setTitle("Set Level-Up Announce Message");

                const input = new TextInputBuilder()
                    .setCustomId("levels-announce-message-input")
                    .setLabel("Use {user}, {level}, {xp} as placeholders")
                    .setPlaceholder("e.g. {user} has reached level {level} with {xp} XP!")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-xp-overrides") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:levels:set-xp-overrides-modal")
                    .setTitle("Set Level XP Overrides");

                const levelInput = new TextInputBuilder()
                    .setCustomId("levels-xp-overrides-level-input")
                    .setLabel("Level to Override")
                    .setPlaceholder("e.g. 10")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const xpInput = new TextInputBuilder()
                    .setCustomId("levels-xp-overrides-xp-input")
                    .setLabel("XP Required for Level")
                    .setPlaceholder("e.g. 1000")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const levelRow = new ActionRowBuilder<TextInputBuilder>().addComponents(levelInput);
                const xpRow = new ActionRowBuilder<TextInputBuilder>().addComponents(xpInput);

                modal.addComponents(levelRow, xpRow);

                await interaction.showModal(modal);
            }  else if (action === "remove-xp-overrides") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:levels:remove-xp-overrides-modal")
                    .setTitle("Remove Level XP Overrides");

                const input = new TextInputBuilder()
                    .setCustomId("levels-remove-xp-overrides-level-input")
                    .setLabel("Level to Remove Override")
                    .setPlaceholder("e.g. 10")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            }   
            break;
        }

        case "streaks": {
            if (action === "set-multiplier") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:streaks:set-multiplier-modal")
                    .setTitle("Set Streak Multiplier");

                const input = new TextInputBuilder()
                    .setCustomId("streak-multiplier-input")
                    .setLabel("New Streak Multiplier")
                    .setPlaceholder("e.g. 0.1 (10% per day)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-rewards") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:streaks:set-rewards-modal")
                    .setTitle("Set Streak Rewards");

                const countInput = new TextInputBuilder()
                    .setCustomId("streak-rewards-day-input")
                    .setLabel("Streak Day")
                    .setPlaceholder("e.g. 5")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const xpInput = new TextInputBuilder()
                    .setCustomId("streak-rewards-xp-input")
                    .setLabel("XP Reward")
                    .setPlaceholder("e.g. 100")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const goldInput = new TextInputBuilder()
                    .setCustomId("streak-rewards-gold-input")
                    .setLabel("Gold Reward")
                    .setPlaceholder("e.g. 50")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const channelInput = new TextInputBuilder()
                    .setCustomId("streak-rewards-channel-input")
                    .setLabel("Channel Reward (ID)")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const messageInput = new TextInputBuilder()
                    .setCustomId("streak-rewards-message-input")
                    .setLabel("Custom Reward Message")
                    .setPlaceholder("e.g. Congrats on your 5-day streak!")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const countRow = new ActionRowBuilder<TextInputBuilder>().addComponents(countInput);
                const xpRow = new ActionRowBuilder<TextInputBuilder>().addComponents(xpInput);
                const goldRow = new ActionRowBuilder<TextInputBuilder>().addComponents(goldInput);
                const channelRow = new ActionRowBuilder<TextInputBuilder>().addComponents(channelInput);
                const messageRow = new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput);

                modal.addComponents(countRow, xpRow, goldRow, channelRow, messageRow);

                await interaction.showModal(modal);
            } else if (action === "remove-rewards") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:streaks:remove-rewards-modal")
                    .setTitle("Remove Streak Rewards");

                const input = new TextInputBuilder()
                    .setCustomId("streak-remove-rewards-input")
                    .setLabel("Streak Day to Remove Reward")
                    .setPlaceholder("e.g. 5")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-announce-channel") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:streaks:set-announce-channel-modal")
                    .setTitle("Set Streak Announce Channel");

                const input = new TextInputBuilder()
                    .setCustomId("streak-announce-channel-input")
                    .setLabel("Discord Channel ID or \"none\", blank, \"null\" to disable")
                    .setPlaceholder("e.g. 123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-announce-message") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:streaks:set-announce-message-modal")
                    .setTitle("Set Streak Announce Message");

                const input = new TextInputBuilder()
                    .setCustomId("streak-announce-message-input")
                    .setLabel("Announce Message")
                    .setPlaceholder("e.g. Congratulations on your streak!")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            }
            break;
        }

        case "shop": {
            if (action === "toggle") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:shop:set-toggle-modal")
                    .setTitle("Enable/Disable Shop");

                const input = new TextInputBuilder()
                    .setCustomId("shop-toggle-input")
                    .setLabel("Enable Shop (true/false)")
                    .setPlaceholder("e.g. true or false")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "add-category") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:shop:add-category-modal")
                    .setTitle("Add Shop Category");

                const idInput = new TextInputBuilder()
                    .setCustomId("shop-category-id-input")
                    .setLabel("Category ID")
                    .setPlaceholder("e.g. weapons")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const nameInput = new TextInputBuilder()
                    .setCustomId("shop-category-name-input")
                    .setLabel("Category Name")
                    .setPlaceholder("e.g. Weapons")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const iconInput = new TextInputBuilder()
                    .setCustomId("shop-category-icon-input")
                    .setLabel("Category Icon (emoji)")
                    .setPlaceholder("e.g. ⚔️")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const descriptionInput = new TextInputBuilder()
                    .setCustomId("shop-category-description-input")
                    .setLabel("Category Description")
                    .setPlaceholder("e.g. Buy weapons to enhance your combat skills.")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false);

                const hiddenInput = new TextInputBuilder()
                    .setCustomId("shop-category-hidden-input")
                    .setLabel("Hidden (true/false)")
                    .setPlaceholder("e.g. false")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const idRow = new ActionRowBuilder<TextInputBuilder>().addComponents(idInput);
                const nameRow = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
                const iconRow = new ActionRowBuilder<TextInputBuilder>().addComponents(iconInput);
                const descriptionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);
                const hiddenRow = new ActionRowBuilder<TextInputBuilder>().addComponents(hiddenInput);

                modal.addComponents(idRow, nameRow, iconRow, descriptionRow, hiddenRow);
                    
                await interaction.showModal(modal);
            } else if (action === "delete-category") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:shop:remove-category-modal")
                    .setTitle("Remove Shop Category");

                const input = new TextInputBuilder()
                    .setCustomId("shop-remove-category-id-input")
                    .setLabel("Category ID to Remove")
                    .setPlaceholder("e.g. weapons")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "edit-category") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:shop:edit-category-modal")
                    .setTitle("Edit Shop Category");

                const idInput = new TextInputBuilder()
                    .setCustomId("shop-edit-category-id-input")
                    .setLabel("Category ID to Edit")
                    .setPlaceholder("e.g. weapons")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const fieldInput = new TextInputBuilder()
                    .setCustomId("shop-edit-category-field-input")
                    .setLabel("(name, icon, description, hidden, roles)")
                    .setPlaceholder("e.g. name")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const valueInput = new TextInputBuilder()
                    .setCustomId("shop-edit-category-value-input")
                    .setLabel("New Value for Field")
                    .setPlaceholder("e.g. New Weapons Name")   
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const idRow = new ActionRowBuilder<TextInputBuilder>().addComponents(idInput);
                const fieldRow = new ActionRowBuilder<TextInputBuilder>().addComponents(fieldInput);
                const valueRow = new ActionRowBuilder<TextInputBuilder>().addComponents(valueInput);

                modal.addComponents(idRow, fieldRow, valueRow);

                await interaction.showModal(modal);
            } else if (action ==="add-item") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:shop:add-item-modal")
                    .setTitle("Add Shop Item");
                    
                const idInput = new TextInputBuilder()
                    .setCustomId("shop-item-id-input")
                    .setLabel("Item ID")
                    .setPlaceholder("e.g. sword001")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const nameInput = new TextInputBuilder()
                    .setCustomId("shop-item-name-input")
                    .setLabel("Item Name")
                    .setPlaceholder("e.g. Iron Sword")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const emojiInput = new TextInputBuilder()
                    .setCustomId("shop-item-emoji-input")
                    .setLabel("Item Emoji/Icon")
                    .setPlaceholder("e.g. ⚔️")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const priceInput = new TextInputBuilder()
                    .setCustomId("shop-item-price-input")
                    .setLabel("Item Price (in gold)")
                    .setPlaceholder("e.g. 100")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const categoryInput = new TextInputBuilder()
                    .setCustomId("shop-item-category-input")
                    .setLabel("Item Category ID")
                    .setPlaceholder("e.g. weapons")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const idRow = new ActionRowBuilder<TextInputBuilder>().addComponents(idInput);
                const nameRow = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
                const emojiRow = new ActionRowBuilder<TextInputBuilder>().addComponents(emojiInput);
                const priceRow = new ActionRowBuilder<TextInputBuilder>().addComponents(priceInput);
                const categoryRow = new ActionRowBuilder<TextInputBuilder>().addComponents(categoryInput);

                modal.addComponents(
                    idRow,
                    nameRow,
                    emojiRow,
                    priceRow,
                    categoryRow,
                );

                await interaction.showModal(modal);
            } else if (action === "delete-item") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:shop:remove-item-modal")
                    .setTitle("Remove Shop Item");

                const input = new TextInputBuilder()
                    .setCustomId("shop-remove-item-id-input")
                    .setLabel("Item ID to Remove")
                    .setPlaceholder("e.g. sword001")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "edit-item") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:shop:edit-item-modal")
                    .setTitle("Edit Shop Item");

                const idInput = new TextInputBuilder()
                    .setCustomId("shop-edit-item-id-input")
                    .setLabel("Item ID to Edit")
                    .setPlaceholder("e.g. sword001")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const fieldInput = new TextInputBuilder()
                    .setCustomId("shop-edit-item-field-input")
                    .setLabel("Honestly I recommend just using /config-shop edit-tem")
                    .setPlaceholder("e.g. price")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const valueInput = new TextInputBuilder()
                    .setCustomId("shop-edit-item-value-input")
                    .setLabel("New Value for Field")
                    .setPlaceholder("e.g. 150")   
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const idRow = new ActionRowBuilder<TextInputBuilder>().addComponents(idInput);
                const fieldRow = new ActionRowBuilder<TextInputBuilder>().addComponents(fieldInput);
                const valueRow = new ActionRowBuilder<TextInputBuilder>().addComponents(valueInput);

                modal.addComponents(idRow, fieldRow, valueRow);

                await interaction.showModal(modal);
            } else if (action === "add-item-action") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:shop:add-item-action-modal")
                    .setTitle("Add Shop Item Action");

                const itemIdInput = new TextInputBuilder()
                    .setCustomId("shop-item-action-item-id-input")
                    .setLabel("Item ID")
                    .setPlaceholder("e.g. sword001")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const actionType = new TextInputBuilder()
                    .setCustomId("shop-item--action-type-input")
                    .setLabel("assignRole, removeRole, sendMessage, runCommand")
                    .setPlaceholder("e.g. give-role:123456789012345678")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const roleId = new TextInputBuilder()
                    .setCustomId("shop-item-action-role-id-input")
                    .setLabel("Role Id for assignRole/removeRole actions")
                    .setPlaceholder("e.g. 123456789012345678 for role ID")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const channelId = new TextInputBuilder()
                    .setCustomId("shop-item-action-channel-id-input")
                    .setLabel("Channel Id for sendMessage action")
                    .setPlaceholder("e.g. 123456789012345678 for channel ID")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const messageContent = new TextInputBuilder()
                    .setCustomId("shop-item-action-message-content-input")
                    .setLabel("Message Content for sendMessage action")
                    .setPlaceholder("e.g. Congratulations on your purchase!")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false);

                const commandContent = new TextInputBuilder()
                    .setCustomId("shop-item-action-command-content-input")
                    .setLabel("Command Content for runCommand action")
                    .setPlaceholder("e.g. give {user} VIP")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false);

                const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(actionType);
                const itemIdRow = new ActionRowBuilder<TextInputBuilder>().addComponents(itemIdInput);
                const roleIdRow = new ActionRowBuilder<TextInputBuilder>().addComponents(roleId);
                const channelIdRow = new ActionRowBuilder<TextInputBuilder>().addComponents(channelId);
                const messageContentRow = new ActionRowBuilder<TextInputBuilder>().addComponents(messageContent);
                const commandContentRow = new ActionRowBuilder<TextInputBuilder>().addComponents(commandContent);

                modal.addComponents(itemIdRow, actionRow, roleIdRow, channelIdRow, messageContentRow, commandContentRow );

                await interaction.showModal(modal);
            } else if (action === "remove-item-action") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:shop:remove-item-action-modal")
                    .setTitle("Remove Shop Item Action");
                    
                const itemIdInput = new TextInputBuilder()
                    .setCustomId("shop-remove-item-action-item-id-input")
                    .setLabel("Item ID")
                    .setPlaceholder("e.g. sword001")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const actionId = new TextInputBuilder()
                    .setCustomId("shop-remove-item-action-type-input")
                    .setLabel("Action Id to Remove")
                    .setPlaceholder("e.g. assignRole")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const itemIdRow = new ActionRowBuilder<TextInputBuilder>().addComponents(itemIdInput);
                const actionIdRow = new ActionRowBuilder<TextInputBuilder>().addComponents(actionId);
                modal.addComponents(itemIdRow, actionIdRow);

                await interaction.showModal(modal);
            }
            break;
        }

        case "styles": {
            if (action === "set-main-theme-color") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:styles:set-main-theme-color-modal")
                    .setTitle("Set Main Theme Color");

                const input = new TextInputBuilder()
                    .setCustomId("styles-main-theme-color-input")
                    .setLabel("New Main Theme Color (hex code)")
                    .setPlaceholder("e.g. #00AE86")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);

                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (action === "set-gold") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:styles:set-gold-modal")
                    .setTitle("Set Gold Name and Icon");

                const nameInput = new TextInputBuilder()
                    .setCustomId("styles-gold-name-input")
                    .setLabel("Gold Name")
                    .setPlaceholder("e.g. Gold, Coins")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const iconInput = new TextInputBuilder()
                    .setCustomId("styles-gold-icon-input")
                    .setLabel("Gold Icon (emoji or unicode)")
                    .setPlaceholder("e.g. :coin: or 💰")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const nameRow = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
                const iconRow = new ActionRowBuilder<TextInputBuilder>().addComponents(iconInput);

                modal.addComponents(nameRow, iconRow);

                await interaction.showModal(modal);
            } else if (action === "set-xp") {
                const modal = new ModalBuilder()
                    .setCustomId("config-panel:styles:set-xp-modal")
                    .setTitle("Set XP Name and Icon");

                const nameInput = new TextInputBuilder()
                    .setCustomId("styles-xp-name-input")
                    .setLabel("XP Name")
                    .setPlaceholder("e.g. XP, Experience")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const iconInput = new TextInputBuilder()
                    .setCustomId("styles-xp-icon-input")
                    .setLabel("XP Icon (emoji or unicode)")
                    .setPlaceholder("e.g. :star: or ⭐")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const nameRow = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
                const iconRow = new ActionRowBuilder<TextInputBuilder>().addComponents(iconInput);

                modal.addComponents(nameRow, iconRow);

                await interaction.showModal(modal);
            }
            break;
        }
    }
}