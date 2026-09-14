import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from "discord.js";
import { setGuildConfig } from "../../db/guilds.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { logAndBroadcastEvent } from "../../db/events.js"; 

export const data = new SlashCommandBuilder()
    .setName("config-styles")
    .setDescription("Configure styles settings for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(sub =>
        sub.setName("show").setDescription("Show current style configuration")
    )

    .addSubcommand(sub =>
        sub.setName("set-main-theme-color").setDescription("Set the main theme color for embeds (other specifics override this)")
            .addStringOption(opt =>
                opt.setName("color").setDescription("The main theme color in hex format (e.g. #3498db)").setRequired(true)
            )
    )

    .addSubcommand(sub =>
        sub.setName("set-main-text-color").setDescription("Set the main text color for embeds (other specifics override this)")
            .addStringOption(opt =>
                opt.setName("color").setDescription("The main text color in hex format (e.g. #FFFFFF)").setRequired(true)
            )
    )

    .addSubcommand(sub =>
        sub.setName("set-theme-template").setDescription("Set a predefined theme template for the server")
            .addStringOption(opt =>
                opt.setName("template").setDescription("The name of the theme template to apply").setRequired(true)
                .addChoices(
                    { name: "Default", value: "default" },
                    { name: "Fantasy", value: "fantasy" },
                )
            )
    )

    .addSubcommand(sub =>
        sub.setName("set-xp").setDescription("Set name and icon for XP (any leveling thing)")
        .addStringOption(opt =>
            opt.setName("name").setDescription("The name for XP (e.g. 'Experience, Mana, Life')").setRequired(false)
        )
        .addStringOption(opt =>
            opt.setName("icon").setDescription("The icon for XP (e.g. ⭐)").setRequired(false)
        )
    )

    .addSubcommand(sub =>
        sub.setName("set-gold").setDescription("Set name and icon for gold (any currency thing)")
        .addStringOption(opt =>
            opt.setName("name").setDescription("The name for gold (e.g. 'Gold, Coins, Money')").setRequired(false)
        )
        .addStringOption(opt =>
            opt.setName("icon").setDescription("The icon for gold (e.g. 💰)").setRequired(false)
        )
    );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guildId || !interaction.inGuild()) {
        await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
        return;
    }

    if ( !interaction.memberPermissions || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: "You need the Manage Server permission to use this command.", ephemeral: true });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const sub = interaction.options.getSubcommand();

    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId! });

    let newConfig = { ...config, style: { ...(config.style ?? {})}}

    switch (sub) {
        case "show": {
            const embed = new EmbedBuilder()
                .setTitle("🎨 Style Configuration")
                .setColor((config.style?.mainThemeColor ?? "#00AE86") as any)
                .addFields(
                    { name: "Theme Template", value: config.style.template ?? "default", inline: true },
                    { name: "Main Theme Color", value: config.style.mainThemeColor ?? "#00AE86", inline: true },
                    { name: "Main Text Color", value: config.style.mainTextColor ?? "#FFFFFF", inline: true },
                    { name: "XP Style", value: `Name: **${config.style.xp?.name ?? "XP"}**  Icon: ${config.style.xp?.icon ?? "⭐"}`, inline: true },
                    { name: "Gold Style", value: `Name: **${config.style.gold?.name ?? "Gold"}**  Icon: ${config.style.gold?.icon ?? "💰"}`, inline: true },
                );
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        case "set-main-theme-color": {
            const color = interaction.options.getString("color", true);
            
            if (!/^#?[0-9A-Fa-f]{6}$/.test(color)) {
                await interaction.editReply("Please provide a valid hex color code (e.g. #3498db).");
                return;
            }

            newConfig.style.mainThemeColor = color.startsWith("#") ? color : `#${color}`;
            await setGuildConfig(interaction.guildId, newConfig);

            await interaction.editReply(`Main theme color set to ${newConfig.style.mainThemeColor}.`);
            break;
        }

        case "set-main-text-color": {
            const color = interaction.options.getString("color", true);
            
            if (!/^#?[0-9A-Fa-f]{6}$/.test(color)) {
                await interaction.editReply("Please provide a valid hex color code (e.g. #FFFFFF).");
                return;
            }

            newConfig.style.mainTextColor = color.startsWith("#") ? color : `#${color}`;
            await setGuildConfig(interaction.guildId, newConfig);

            await interaction.editReply(`Main text color set to ${newConfig.style.mainTextColor}.`);
            break;
        }

        case "set-theme-template": {
            const template = interaction.options.getString("template", true);

            newConfig.style.template = template as "default" | "fantasy";
            await setGuildConfig(interaction.guildId, newConfig);

            await interaction.editReply(`Theme template set to ${template}.`);
            break;
        }

    case "set-xp": {
            const name = interaction.options.getString("name");
            const icon = interaction.options.getString("icon");

            newConfig.style.xp = { ...(newConfig.style.xp ?? {}) };
            if (name) {
                newConfig.style.xp.name = name;
            }
            if (icon) {
                newConfig.style.xp.icon = icon;
            }

            await setGuildConfig(interaction.guildId, newConfig);

            await interaction.editReply(`XP style updated.${name ? ` Name set to "${name}".` : ""}${icon ? ` Icon set to "${icon}".` : ""}`);
            break;
        }

    case "set-gold": {
            const name = interaction.options.getString("name");
            const icon = interaction.options.getString("icon");

            newConfig.style.gold = { ...(newConfig.style.gold ?? {}) };
            if (name) {
                newConfig.style.gold.name = name;
            }
            if (icon) {
                newConfig.style.gold.icon = icon;
            }

            await setGuildConfig(interaction.guildId, newConfig);

            await interaction.editReply(`Gold style updated.${name ? ` Name set to "${name}".` : ""}${icon ? ` Icon set to "${icon}".` : ""}`);
            break;
        }

        default: {
            await interaction.editReply("Unknown subcommand.");
            return;
        }
    }

     if (config.logging.enabled) {
            const { user } = await getOrCreateDbUser({
                discordUserId: interaction.user.id,
                username: interaction.user.username,
                avatarUrl: interaction.user.displayAvatarURL(),
            });
    
            await logAndBroadcastEvent(interaction, {
                guildId: guild.id,
                discordGuildId: guild.discord_guild_id,
                userId: user.id,
                category: "config",
                eventType: "configChange",
                source: "styles",
                metaData: { actorDiscordId: interaction.user.id, subcommand: sub },
                timestamp: new Date(),
            }, newConfig);
        }
}
