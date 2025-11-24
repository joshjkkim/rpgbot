import { ModalSubmitInteraction, MessageFlags } from "discord.js";
import { getGuildConfig, setGuildConfig } from "../../db/guilds.js";

export async function handleConfigPanelModalSubmit(interaction: ModalSubmitInteraction) {
    if (!interaction.customId.startsWith("config-panel:")) return;

    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply({
        content: "This modal can only be used in a server.",
        flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const [ ,section, action] = interaction.customId.split(":");

    const { guild, config } = await getGuildConfig(interaction.guildId);
    const newConfig = structuredClone(config);

    switch (section) {
        case "xp": {
            if (action === "set-base-modal") {
                const input = interaction.fields.getTextInputValue("xp-base-input");
                const value = Number(input);

                newConfig.xp.basePerMessage = value;

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Base XP per message updated to \`${value}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-cooldown-modal") {
                const input = interaction.fields.getTextInputValue("xp-cooldown-input");
                const value = Number(input);

                newConfig.xp.xpMessageCooldown = value;

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Global XP message cooldown updated to \`${value}s\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-channel-overrides-modal") {
                const channelId = interaction.fields.getTextInputValue("xp-channel-overrides-id-input");
                const enabledInput = interaction.fields.getTextInputValue("xp-channel-overrides-enabled-input");
                const flatBonusInput = interaction.fields.getTextInputValue("xp-channel-overrides-flat-bonus-input");
                const multiplierInput = interaction.fields.getTextInputValue("xp-channel-overrides-multiplier-input");
                const cooldownInput = interaction.fields.getTextInputValue("xp-channel-overrides-cooldown-input");

                const enabled = enabledInput.toLowerCase() === "true";
                const flatBonus = flatBonusInput ? Number(flatBonusInput) : 0;
                const multiplier = Number(multiplierInput) || 1;
                const cooldown = cooldownInput ? Number(cooldownInput) : newConfig.xp.xpMessageCooldown;

                newConfig.xp.xpChannelIds = newConfig.xp.xpChannelIds || {};
                newConfig.xp.xpChannelIds[channelId] = {
                    enabled,
                    channelId,
                    flatBonus,
                    multiplier,
                    cooldownOverride: cooldown,
                };

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `XP Channel Override for <#${channelId}> has been set.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "remove-channel-overrides-modal") {
                const channelId = interaction.fields.getTextInputValue("xp-remove-channel-overrides-id-input");

                if (newConfig.xp.xpChannelIds && newConfig.xp.xpChannelIds[channelId]) {
                    delete newConfig.xp.xpChannelIds[channelId];

                    await setGuildConfig(interaction.guildId, newConfig);

                    await interaction.reply({
                        content: `XP Channel Override for <#${channelId}> has been removed.`,
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await interaction.reply({
                        content: `No XP Channel Override found for <#${channelId}>.`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            } else if (action === "set-role-xp-modal") {
                const roleId = interaction.fields.getTextInputValue("xp-role-id-input");
                const extraXpInput = interaction.fields.getTextInputValue("xp-role-extra-xp-input");
                const extraXp = extraXpInput ? Number(extraXpInput) : 0;
                const multiplierInput = interaction.fields.getTextInputValue("xp-role-multiplier-input");
                const multiplier = Number(multiplierInput) || 1;
                const cooldownInput = interaction.fields.getTextInputValue("xp-role-cooldown-input");
                const cooldown = cooldownInput ? Number(cooldownInput) : newConfig.xp.xpMessageCooldown;

                newConfig.xp.roleXp = newConfig.xp.roleXp || {};
                newConfig.xp.roleXp[roleId] = {
                    extraXp,
                    multiplier,
                    cooldownSeconds: cooldown,
                };

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `XP Role Config for <@&${roleId}> has been set.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "remove-role-xp-modal") {
                const roleId = interaction.fields.getTextInputValue("xp-remove-role-id-input");

                if (newConfig.xp.roleXp && newConfig.xp.roleXp[roleId]) {
                    delete newConfig.xp.roleXp[roleId];

                    await setGuildConfig(interaction.guildId, newConfig);

                    await interaction.reply({
                        content: `XP Role Config for <@&${roleId}> has been removed.`,
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await interaction.reply({
                        content: `No XP Role Config found for <@&${roleId}>.`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
            break;
        }

        case "daily": {
            if (action === "set-xp-modal") {
                const input = interaction.fields.getTextInputValue("daily-xp-input");
                const value = Number(input);

                newConfig.xp.dailyXp = value;

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Daily XP updated to \`${value}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-gold-modal") {
                const input = interaction.fields.getTextInputValue("daily-gold-input");
                const value = Number(input);

                newConfig.xp.dailyGold = value;

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Daily Gold updated to \`${value}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-auto-modal") {
                const input = interaction.fields.getTextInputValue("daily-auto-input");
                const value = input.toLowerCase() === "true";

                newConfig.xp.autoDailyEnabled = value;

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Auto Daily Enabled updated to \`${value}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-reply-modal") {
                const input = interaction.fields.getTextInputValue("daily-reply-input");
                const value = input.toLowerCase() === "true";

                newConfig.xp.replyToDailyInChannel = value;
                
                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Reply to Daily in Channel updated to \`${value}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-ephemeral-modal") {
                const input = interaction.fields.getTextInputValue("daily-ephemeral-input");
                const value = input.toLowerCase() === "true";

                newConfig.xp.replyToDailyEphemeral = value;
                
                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Ephemeral Reply to Daily updated to \`${value}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-reply-message-modal") {
                const input = interaction.fields.getTextInputValue("daily-reply-message-input");

                newConfig.xp.replyToDailyMessage = input;
                
                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Reply Message for Daily Reward updated.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-announce-channel-modal") {
                const input = interaction.fields.getTextInputValue("daily-announce-channel-input");

                if (input.toLowerCase() === "none" || input.toLowerCase() === "null" || input.trim() === "") {
                    newConfig.xp.announceDailyInChannelId = null;
                } else {
                    newConfig.xp.announceDailyInChannelId = input;
                }
                
                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Announce Channel ID for Daily Reward updated to \`${input}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-announce-message-modal") {
                const input = interaction.fields.getTextInputValue("daily-announce-message-input");

                newConfig.xp.announceDailyMessage = input;
                
                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Announce Message for Daily Reward updated.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-role-bonuses-modal") {
                const roleId = interaction.fields.getTextInputValue("daily-role-id-input");
                const xpBonusInput = interaction.fields.getTextInputValue("daily-role-xp-bonus-input");
                const xpBonus = xpBonusInput ? Number(xpBonusInput) : 0;
                const goldBonusInput = interaction.fields.getTextInputValue("daily-role-gold-bonus-input");
                const goldBonus = goldBonusInput ? Number(goldBonusInput) : 0;
                const multiplierInput = interaction.fields.getTextInputValue("daily-multiplier-input");
                const multiplier = multiplierInput ? Number(multiplierInput) : 1;

                newConfig.xp.roleDailyBonus = newConfig.xp.roleDailyBonus || {};
                newConfig.xp.roleDailyBonus[roleId] = {
                    xpBonus,
                    goldBonus,
                    multiplier,
                };

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Daily Role Bonus for <@&${roleId}> has been set.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "remove-role-bonuses-modal") {
                const roleId = interaction.fields.getTextInputValue("daily-remove-role-id-input");

                if (newConfig.xp.roleDailyBonus && newConfig.xp.roleDailyBonus[roleId]) {
                    delete newConfig.xp.roleDailyBonus[roleId];

                    await setGuildConfig(interaction.guildId, newConfig);

                    await interaction.reply({
                        content: `Daily Role Bonus for <@&${roleId}> has been removed.`,
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await interaction.reply({
                        content: `No Daily Role Bonus found for <@&${roleId}>.`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
            break;
        }

        case "vc": {
            if (action === "set-toggle-modal") {
                const input = interaction.fields.getTextInputValue("vc-toggle-input");
                const value = input.toLowerCase() === "true";

                newConfig.xp.vc.enabled = value;

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Voice Channel XP Enabled updated to \`${value}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-base-modal") {
                const input = interaction.fields.getTextInputValue("vc-base-input");
                const value = Number(input);

                newConfig.xp.vc.basePerMinute = value;

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Base XP per Minute for Voice Channel updated to \`${value}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-minutes-modal") {
                const input = interaction.fields.getTextInputValue("vc-minutes-input");
                const value = Number(input);

                newConfig.xp.vc.minMinutesForXp = value;

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Minimum Minutes for Voice Channel XP updated to \`${value}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-channel-overrides-modal") {
                const channelId = interaction.fields.getTextInputValue("vc-channel-overrides-id-input");
                const enabledInput = interaction.fields.getTextInputValue("vc-channel-overrides-enabled-input");
                const flatBonusInput = interaction.fields.getTextInputValue("vc-channel-overrides-flat-bonus-input");
                const multiplierInput = interaction.fields.getTextInputValue("vc-channel-overrides-multiplier-input");

                const enabled = enabledInput.toLowerCase() === "true";
                const flatBonus = flatBonusInput ? Number(flatBonusInput) : 0;
                const multiplier = Number(multiplierInput) || 1;

                newConfig.xp.vc.channelIds = newConfig.xp.vc.channelIds || {};
                newConfig.xp.vc.channelIds[channelId] = {
                    enabled,
                    channelId,
                    flatBonus,
                    multiplier

                };

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Voice Channel XP Override for <#${channelId}> has been set.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "remove-channel-overrides-modal") {
                const channelId = interaction.fields.getTextInputValue("vc-remove-channel-overrides-id-input");

                if (newConfig.xp.vc.channelIds && newConfig.xp.vc.channelIds[channelId]) {
                    delete newConfig.xp.vc.channelIds[channelId];

                    await setGuildConfig(interaction.guildId, newConfig);

                    await interaction.reply({
                        content: `Voice Channel XP Override for <#${channelId}> has been removed.`,
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await interaction.reply({
                        content: `No Voice Channel XP Override found for <#${channelId}>.`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            } else if (action === "set-role-xp-modal") {
                const roleId = interaction.fields.getTextInputValue("vc-role-id-input");
                const multiplierInput = interaction.fields.getTextInputValue("vc-role-multiplier-input");
                const multiplier = Number(multiplierInput) || 1;

                newConfig.xp.vc.roleXpBonus = newConfig.xp.vc.roleXpBonus || {};
                newConfig.xp.vc.roleXpBonus[roleId] = {
                    multiplier,
                };

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Voice Channel XP Role Config for <@&${roleId}> has been set.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "remove-role-xp-modal") {
                const roleId = interaction.fields.getTextInputValue("vc-remove-role-id-input");

                if (newConfig.xp.vc.roleXpBonus && newConfig.xp.vc.roleXpBonus[roleId]) {
                    delete newConfig.xp.vc.roleXpBonus[roleId];

                    await setGuildConfig(interaction.guildId, newConfig);

                    await interaction.reply({
                        content: `Voice Channel XP Role Config for <@&${roleId}> has been removed.`,
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await interaction.reply({
                        content: `No Voice Channel XP Role Config found for <@&${roleId}>.`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
            break;
        }

        case "levels": {
            if (action === "set-curve-modal") {
                const input = interaction.fields.getTextInputValue("levels-curve-input");
                if (!["linear", "exponential", "polynomial", "logarithmic"].includes(input.toLowerCase())) {
                    await interaction.reply({
                        content: `Invalid curve type. Please use one of: linear, exponential, polynomial, logarithmic.`,
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                const param1 = interaction.fields.getTextInputValue("levels-curve-params-input");
                const param2 = interaction.fields.getTextInputValue("levels-curve-params-2-input");
                
                newConfig.levels.curveParams = {};

                switch (input.toLowerCase()) {
                    case "linear":
                        newConfig.levels.curveParams["rate"] = Number(param1);
                        break;
                    case "exponential":
                        newConfig.levels.curveParams["base"] = Number(param1);
                        newConfig.levels.curveParams["factor"] = Number(param2);
                        break;
                    case "polynomial":
                        newConfig.levels.curveParams["degree"] = Number(param1);
                        newConfig.levels.curveParams["factor"] = Number(param2);
                        break;
                    case "logarithmic":
                        newConfig.levels.curveParams["base"] = Number(param1);
                        newConfig.levels.curveParams["factor"] = Number(param2);
                        break;
                }

                newConfig.levels.curveType = input.toLowerCase() as "linear" | "exponential" | "polynomial" | "logarithmic";

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Levels Curve Type updated to \`${input}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-max-level-modal") {
                const input = interaction.fields.getTextInputValue("levels-max-level-input");
                const value = Number(input);
                newConfig.levels.maxLevel = value === 0 ? null : value;

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Max Level updated to \`${value === 0 ? "No limit" : value}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-announce-channel-modal") {
                const input = interaction.fields.getTextInputValue("levels-announce-channel-input");

                if (input === "none" || input === "" || input.toLowerCase() === "null") {
                    newConfig.levels.announceLevelUpInChannelId = null;
                } else {
                    newConfig.levels.announceLevelUpInChannelId = input;
                }
                
                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Level-Up Announce Channel ID updated to \`${input}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-announce-message-modal") {
                const input = interaction.fields.getTextInputValue("levels-announce-message-input");

                newConfig.levels.announceLevelUpMessage = input;
                
                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Level-Up Announce Message updated.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-xp-overrides-modal") {
                const levelInput = interaction.fields.getTextInputValue("levels-xp-overrides-level-input");
                const xpInput = interaction.fields.getTextInputValue("levels-xp-overrides-xp-input");

                const level = Number(levelInput);
                const xp = Number(xpInput);

                if (!newConfig.levels.xpOverrides) {
                    newConfig.levels.xpOverrides = {};
                }

                newConfig.levels.xpOverrides[level] = xp;

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `XP Override for Level ${level} set to ${xp}.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "remove-xp-overrides-modal") {
                const input = interaction.fields.getTextInputValue("levels-remove-xp-overrides-level-input");
                const level = Number(input);

                if (newConfig.levels.xpOverrides && newConfig.levels.xpOverrides[level]) {
                    delete newConfig.levels.xpOverrides[level];
                    await setGuildConfig(interaction.guildId, newConfig);

                    await interaction.reply({
                        content: `XP Override for Level ${level} removed.`,
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await interaction.reply({
                        content: `No XP Override found for Level ${level}.`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
            break;
        }

        case "streaks": {
            if (action === "set-multiplier-modal") {
                const input = interaction.fields.getTextInputValue("streak-multiplier-input");
                const value = Number(input);

                newConfig.xp.streakMultiplier = value;

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Streak Multiplier updated to \`${value}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-announce-channel-modal") {
                const input = interaction.fields.getTextInputValue("streak-announce-channel-input");

                if (input === "none" || input === "" || input.toLowerCase() === "null") {
                    newConfig.xp.streakAnnounceChannelId = null;
                } else {
                    newConfig.xp.streakAnnounceChannelId = input;
                }
                
                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Streak Announce Channel ID updated to \`${input}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-announce-message-modal") {
                const input = interaction.fields.getTextInputValue("streak-announce-message-input");

                newConfig.xp.streakAnnounceMessage = input;
                
                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Streak Announce Message updated.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-rewards-modal") {
                const dayInput = interaction.fields.getTextInputValue("streak-rewards-day-input");
                const xpInput = interaction.fields.getTextInputValue("streak-rewards-xp-input");
                const goldInput = interaction.fields.getTextInputValue("streak-rewards-gold-input");
                const channelInput = interaction.fields.getTextInputValue("streak-rewards-channel-input");
                const messageInput = interaction.fields.getTextInputValue("streak-rewards-message-input");

                const day = Number(dayInput);
                const xp = xpInput ? Number(xpInput) : 0;
                const gold = goldInput ? Number(goldInput) : 0;
                const channelId = channelInput || null;
                const message = messageInput || null;

                if (!newConfig.xp.streakRewards) {
                    newConfig.xp.streakRewards = {};
                }

                newConfig.xp.streakRewards[day] = {
                    streakCount: day,
                    xpBonus: xp,
                    goldBonus: gold,
                    channelId: channelId,
                    message: message,
                };

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Streak Reward for ${day} days set.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "remove-rewards-modal") {
                const input = interaction.fields.getTextInputValue("streak-remove-rewards-input");
                const day = Number(input);

                if (newConfig.xp.streakRewards && newConfig.xp.streakRewards[day]) {
                    delete newConfig.xp.streakRewards[day];
                    await setGuildConfig(interaction.guildId, newConfig);

                    await interaction.reply({
                        content: `Streak Reward for ${day} days removed.`,
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await interaction.reply({
                        content: `No streak reward found for ${day} days.`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
            break;
        }

        case "shop": {
            if (action === "set-toggle-modal") {
                const input = interaction.fields.getTextInputValue("shop-toggle-input");
                const value = input.toLowerCase() === "true";

                newConfig.shop = newConfig.shop || {};
                newConfig.shop.enabled = value;

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Shop Enabled updated to \`${value}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "add-category-modal") {
                const categoryId = interaction.fields.getTextInputValue("shop-category-id-input");
                const name = interaction.fields.getTextInputValue("shop-category-name-input");
                const icon = interaction.fields.getTextInputValue("shop-category-icon-input");
                const description = interaction.fields.getTextInputValue("shop-category-description-input");
                const hidden = interaction.fields.getTextInputValue("shop-category-hidden-input");
                newConfig.shop = newConfig.shop || {};
                newConfig.shop.categories = newConfig.shop.categories || {};
                newConfig.shop.categories[categoryId] = {
                    id: categoryId,
                    name,
                    ...(icon && { icon }),
                    ...(description && { description }),
                    hidden: hidden.toLowerCase() === "true",
                };

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Shop Category \`${name}\` has been added.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "remove-category-modal") {
                const categoryId = interaction.fields.getTextInputValue("shop-remove-category-id-input");

                if (newConfig.shop?.categories && newConfig.shop.categories[categoryId]) {
                    delete newConfig.shop.categories[categoryId];

                    await setGuildConfig(interaction.guildId, newConfig);

                    await interaction.reply({
                        content: `Shop Category \`${categoryId}\` has been removed.`,
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await interaction.reply({
                        content: `No Shop Category found with ID \`${categoryId}\`.`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            } else if (action === "edit-category-modal") {
                const categoryId = interaction.fields.getTextInputValue("shop-edit-category-id-input");
               const field = interaction.fields.getTextInputValue("shop-edit-category-field-input");
               const newValue = interaction.fields.getTextInputValue("shop-edit-category-value-input");

                if (newConfig.shop?.categories && newConfig.shop.categories[categoryId]) {
                    if (field === "name" || field === "icon" || field === "description") {
                        newConfig.shop.categories[categoryId][field] = newValue;
                    } else if (field === "hidden") {
                        newConfig.shop.categories[categoryId].hidden = newValue.toLowerCase() === "true";
                    } else if (field === "roles") {
                        if (newValue.trim() === "") {
                            delete newConfig.shop.categories[categoryId].roleRequiredIds;
                        } else {
                            const roleIds = newValue.split(",").map(r => r.trim());
                            newConfig.shop.categories[categoryId].roleRequiredIds = roleIds;
                        }
                    } else {
                        await interaction.reply({
                            content: `Invalid field \`${field}\`. Valid fields are: name, icon, description, hidden, roles.`,
                            flags: MessageFlags.Ephemeral,
                        });
                        return;
                    }

                    await setGuildConfig(interaction.guildId, newConfig);

                    await interaction.reply({
                        content: `Shop Category \`${categoryId}\` has been updated.`,
                        flags: MessageFlags.Ephemeral,
                    }); 
                } else {
                    await interaction.reply({
                        content: `No Shop Category found with ID \`${categoryId}\`.`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            } else if (action === "add-item-modal") {
                const itemId = interaction.fields.getTextInputValue("shop-item-id-input");
                const name = interaction.fields.getTextInputValue("shop-item-name-input");
                const priceInput = interaction.fields.getTextInputValue("shop-item-price-input");
                const categoryId = interaction.fields.getTextInputValue("shop-item-category-id-input");
                const emoji = interaction.fields.getTextInputValue("shop-item-emoji-input");

                const price = Number(priceInput);

                newConfig.shop = newConfig.shop || {};
                newConfig.shop.items = newConfig.shop.items || {};
                newConfig.shop.items[itemId] = {
                    id: itemId,
                    name,
                    price,
                    categoryId,
                    ...(emoji && { emoji }),
                };

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Shop Item \`${name}\` has been added.`,
                    flags: MessageFlags.Ephemeral,
                });

            } else if (action === "remove-item-modal") {
                const itemId = interaction.fields.getTextInputValue("shop-remove-item-id-input");

                if (newConfig.shop?.items && newConfig.shop.items[itemId]) {
                    delete newConfig.shop.items[itemId];

                    await setGuildConfig(interaction.guildId, newConfig);
                    
                    await interaction.reply({
                        content: `Shop Item with ID \`${itemId}\` has been removed.`,
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await interaction.reply({
                        content: `No Shop Item found with ID \`${itemId}\`.`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            } else if (action === "edit-item-modal") {
                const itemId = interaction.fields.getTextInputValue("shop-edit-item-id-input");
                const field = interaction.fields.getTextInputValue("shop-edit-item-field-input");
                const newValue = interaction.fields.getTextInputValue("shop-edit-item-value-input");

                if (newConfig.shop?.items && newConfig.shop.items[itemId]) {
                    if (field === "name" || field === "description" || field === "categoryId" || field === "emoji") {
                        newConfig.shop.items[itemId][field] = newValue;
                    } else if (field === "price" || field === "minLevel" || field === "stock" || field === "maxPerUser") {
                        newConfig.shop.items[itemId][field] = Number(newValue);
                    } else if (field === "hidden") {
                        newConfig.shop.items[itemId].hidden = newValue.toLowerCase() === "true";
                    } else if (field === "roles") {
                        if (newValue.trim() === "") {
                            delete newConfig.shop.items[itemId].requiresRoleIds;
                        } else {
                            const roleIds = newValue.split(",").map(r => r.trim());
                            newConfig.shop.items[itemId].requiresRoleIds = roleIds;
                        }
                    } else {
                        await interaction.reply({
                            content: `Invalid field \`${field}\`. Valid fields are: name, description, price, categoryId, emoji, minLevel, stock, hidden, maxPerUser, roles.`,
                            flags: MessageFlags.Ephemeral,
                        });
                        return;
                    }

                    await setGuildConfig(interaction.guildId, newConfig);

                    await interaction.reply({
                        content: `Shop Item \`${itemId}\` has been updated.`,
                        flags: MessageFlags.Ephemeral,
                    }); 
                } else {
                    await interaction.reply({
                        content: `No Shop Item found with ID \`${itemId}\`.`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            } else if (action === "add-item-action-modal") {
                const itemId = interaction.fields.getTextInputValue("shop-item-action-item-id-input");
                const actionType = interaction.fields.getTextInputValue("shop-item-action-type-input");
                const roleId = interaction.fields.getTextInputValue("shop-item-action-role-id-input");
                const channelId = interaction.fields.getTextInputValue("shop-item-action-channel-id-input");
                const messageContent = interaction.fields.getTextInputValue("shop-item-action-message-content-input");
                const commandContent = interaction.fields.getTextInputValue("shop-item-action-command-content-input");

                if (!newConfig.shop?.items || !newConfig.shop.items[itemId]) {
                    await interaction.reply({
                        content: `No Shop Item found with ID \`${itemId}\`.`,
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                if (!newConfig.shop.items[itemId].actions) {
                    newConfig.shop.items[itemId].actions = [];
                }

                const actionObj: any = { type: actionType };

                if (actionType === "role") {
                    actionObj.roleId = roleId;
                } else if (actionType === "channel") {
                    actionObj.channelId = channelId;
                } else if (actionType === "message") {
                    actionObj.content = messageContent;
                } else if (actionType === "command") {
                    actionObj.command = commandContent;
                } else {
                    await interaction.reply({
                        content: `Invalid action type \`${actionType}\`. Valid types are: role, channel, message, command.`,
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                const index = Object.keys(newConfig.shop.items[itemId].actions).length;
                newConfig.shop.items[itemId].actions[index] = actionObj;

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Action of type \`${actionType}\` added to Shop Item \`${itemId}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "remove-item-action-modal") {
                const itemId = interaction.fields.getTextInputValue("shop-remove-item-action-item-id-input");
                const actionIndexInput = interaction.fields.getTextInputValue("shop-remove-item-action-index-input");
                const actionIndex = Number(actionIndexInput);

                if (!newConfig.shop?.items || !newConfig.shop.items[itemId]) {
                    await interaction.reply({
                        content: `No Shop Item found with ID \`${itemId}\`.`,
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                if (newConfig.shop.items[itemId].actions && newConfig.shop.items[itemId].actions[actionIndex]) {
                    delete newConfig.shop.items[itemId].actions[actionIndex];

                    await setGuildConfig(interaction.guildId, newConfig);

                    await interaction.reply({
                        content: `Action at index \`${actionIndex}\` removed from Shop Item \`${itemId}\`.`,
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await interaction.reply({
                        content: `No action found at index \`${actionIndex}\` for Shop Item \`${itemId}\`.`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
            break;
        }

        case "styles": {
            if (action === "set-main-theme-color-modal") {
                const input = interaction.fields.getTextInputValue("styles-main-theme-color-input");
                if (!/^#?[0-9A-Fa-f]{6}$/.test(input)) {
                    await interaction.reply({
                        content: `Invalid color code. Please provide a valid hex color code (e.g. #00AE86).`,
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                newConfig.style.mainThemeColor = input;
                
                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Main Theme Color updated to \`${input}\`.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-gold-modal") {
                const nameInput = interaction.fields.getTextInputValue("styles-gold-name-input");
                const iconInput = interaction.fields.getTextInputValue("styles-gold-icon-input");

                newConfig.style.gold.name = nameInput || "Gold";
                newConfig.style.gold.icon = iconInput || "💰";

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `Gold Name/Icon updated.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else if (action === "set-xp-modal") {
                const nameInput = interaction.fields.getTextInputValue("styles-xp-name-input");
                const iconInput = interaction.fields.getTextInputValue("styles-xp-icon-input");

                newConfig.style.xp.name = nameInput || "XP";
                newConfig.style.xp.icon = iconInput || "⭐";

                await setGuildConfig(interaction.guildId, newConfig);

                await interaction.reply({
                    content: `XP Name/Icon updated.`,
                    flags: MessageFlags.Ephemeral,
                });
            }
            break;
        }
    }
}