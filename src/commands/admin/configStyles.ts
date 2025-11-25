import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from "discord.js";
import { setGuildConfig } from "../../db/guilds.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";

export const data = new SlashCommandBuilder()
    .setName("config-styles")
    .setDescription("Configure styles settings for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(sub =>
        sub.setName("set-main-theme-color").setDescription("Set the main theme color for embeds (other specifics override this)")
            .addStringOption(opt =>
                opt.setName("color").setDescription("The main theme color in hex format (e.g. #3498db)").setRequired(true)
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
    
    case "set-xp": {
            const name = interaction.options.getString("name");
            const icon = interaction.options.getString("icon");

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
        }
    }
}
