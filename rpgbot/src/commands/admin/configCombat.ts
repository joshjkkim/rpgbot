import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { setGuildConfig } from "../../db/guilds.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";

export const data = new SlashCommandBuilder()
    .setName("config-combat")
    .setDescription("Configure combat settings for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(sub =>
        sub.setName("show").setDescription("Show current combat configuration")
    )

    .addSubcommand(sub =>
        sub.setName("enabled").setDescription("Enable or disable combat")
        .addBooleanOption(opt =>
            opt.setName("enabled").setDescription("Enable or disable combat").setRequired(true)
        )
    )

    .addSubcommand(sub =>
        sub.setName("hp").setDescription("Set HP base and per-level values")
        .addIntegerOption(opt =>
            opt.setName("base").setDescription("Base HP (default: 100)").setRequired(true)
        )
        .addIntegerOption(opt =>
            opt.setName("per_level").setDescription("HP added per level (default: 10)").setRequired(true)
        )
    )

    .addSubcommand(sub =>
        sub.setName("attack").setDescription("Set attack base and per-level values")
        .addIntegerOption(opt =>
            opt.setName("base").setDescription("Base attack (default: 10)").setRequired(true)
        )
        .addIntegerOption(opt =>
            opt.setName("per_level").setDescription("Attack added per level (default: 2)").setRequired(true)
        )
    )

    .addSubcommand(sub =>
        sub.setName("defense").setDescription("Set defense base and per-level values")
        .addIntegerOption(opt =>
            opt.setName("base").setDescription("Base defense (default: 5)").setRequired(true)
        )
        .addIntegerOption(opt =>
            opt.setName("per_level").setDescription("Defense added per level (default: 1)").setRequired(true)
        )
    )

    .addSubcommand(sub =>
        sub.setName("speed").setDescription("Set speed base and per-level values")
        .addIntegerOption(opt =>
            opt.setName("base").setDescription("Base speed (default: 5)").setRequired(true)
        )
        .addIntegerOption(opt =>
            opt.setName("per_level").setDescription("Speed added per level (default: 1)").setRequired(true)
        )
    )

    .addSubcommand(sub =>
        sub.setName("crit").setDescription("Set crit chance and multiplier base/per-level values")
        .addNumberOption(opt =>
            opt.setName("chance_base").setDescription("Base crit chance % (default: 5)").setRequired(true)
        )
        .addNumberOption(opt =>
            opt.setName("chance_per_level").setDescription("Crit chance % added per level (default: 0.5)").setRequired(true)
        )
        .addNumberOption(opt =>
            opt.setName("multiplier_base").setDescription("Base crit damage multiplier (default: 1.5)").setRequired(true)
        )
        .addNumberOption(opt =>
            opt.setName("multiplier_per_level").setDescription("Crit multiplier added per level (default: 0.05)").setRequired(true)
        )
    )

    .addSubcommand(sub =>
        sub.setName("pve-death-penalty").setDescription("Configure gold/XP loss when a player dies in PvE combat")
        .addNumberOption(opt =>
            opt.setName("gold_percent").setDescription("% of current gold lost on death (e.g. 5 = 5%). Default: 0").setRequired(false)
        )
        .addIntegerOption(opt =>
            opt.setName("gold_flat").setDescription("Minimum flat gold always lost on death. Default: 0").setRequired(false)
        )
        .addNumberOption(opt =>
            opt.setName("xp_percent").setDescription("% of current XP lost on death. Default: 0 (not recommended)").setRequired(false)
        )
    )

    .addSubcommand(sub =>
        sub.setName("pvp-death-penalty").setDescription("Configure gold/XP loss when a player dies in PvP combat")
        .addNumberOption(opt =>
            opt.setName("gold_percent").setDescription("% of current gold lost on death. Default: 0").setRequired(false)
        )
        .addIntegerOption(opt =>
            opt.setName("gold_flat").setDescription("Minimum flat gold always lost on death. Default: 0").setRequired(false)
        )
        .addNumberOption(opt =>
            opt.setName("xp_percent").setDescription("% of current XP lost on death. Default: 0").setRequired(false)
        )
        .addBooleanOption(opt =>
            opt.setName("loser_gold_to_winner").setDescription("If true, the gold lost by the loser is given to the winner. Default: false").setRequired(false)
        )
    );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guildId || !interaction.inGuild()) {
        await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
        return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: "You need the Manage Server permission to use this command.", flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    const sub = interaction.options.getSubcommand();
    const combat = { ...config.combat };

    switch (sub) {
        case "show": {
            const embed = new EmbedBuilder()
                .setTitle("⚔️ Combat Configuration")
                .setColor(config.style.mainThemeColor as any ?? "#00AE86")
                .addFields(
                    { name: "Enabled", value: combat.enabled ? "✅ Yes" : "❌ No", inline: true },
                    { name: "\u200b", value: "\u200b", inline: true },
                    { name: "\u200b", value: "\u200b", inline: true },
                    {
                        name: "❤️ HP",
                        value: `Base: **${combat.hpBase ?? 100}**\nPer level: **${combat.hpPerLevel ?? 10}**`,
                        inline: true,
                    },
                    {
                        name: "⚔️ Attack",
                        value: `Base: **${combat.attackBase ?? 10}**\nPer level: **${combat.attackPerLevel ?? 2}**`,
                        inline: true,
                    },
                    {
                        name: "🛡️ Defense",
                        value: `Base: **${combat.defenseBase ?? 5}**\nPer level: **${combat.defensePerLevel ?? 1}**`,
                        inline: true,
                    },
                    {
                        name: "💨 Speed",
                        value: `Base: **${combat.speedBase ?? 5}**\nPer level: **${combat.speedPerLevel ?? 1}**`,
                        inline: true,
                    },
                    {
                        name: "🎯 Crit Chance",
                        value: `Base: **${combat.critChanceBase ?? 5}%**\nPer level: **${combat.critChancePerLevel ?? 0.5}%**`,
                        inline: true,
                    },
                    {
                        name: "💥 Crit Multiplier",
                        value: `Base: **${combat.critMultiplierBase ?? 1.5}×**\nPer level: **${combat.critMultiplierPerLevel ?? 0.05}×**`,
                        inline: true,
                    },
                    {
                        name: "💀 PvE Death Penalty",
                        value: combat.pveDeathPenalty
                            ? `Gold: **${combat.pveDeathPenalty.goldPercent ?? 0}%** + **${combat.pveDeathPenalty.goldFlat ?? 0}** flat\nXP: **${combat.pveDeathPenalty.xpPercent ?? 0}%**`
                            : "None",
                        inline: true,
                    },
                    {
                        name: "⚔️ PvP Death Penalty",
                        value: combat.pvpDeathPenalty
                            ? `Gold: **${combat.pvpDeathPenalty.goldPercent ?? 0}%** + **${combat.pvpDeathPenalty.goldFlat ?? 0}** flat\nXP: **${combat.pvpDeathPenalty.xpPercent ?? 0}%**\nGold to winner: **${combat.pvpDeathPenalty.loserGoldToWinner ? "Yes" : "No"}**`
                            : "None",
                        inline: true,
                    },
                );
            await interaction.editReply({ embeds: [embed] });
            return;
        }

        case "enabled": {
            combat.enabled = interaction.options.getBoolean("enabled", true);
            await interaction.editReply(`Combat is now **${combat.enabled ? "enabled ✅" : "disabled ❌"}**.`);
            break;
        }

        case "hp": {
            combat.hpBase = interaction.options.getInteger("base", true);
            combat.hpPerLevel = interaction.options.getInteger("per_level", true);
            await interaction.editReply(`HP set to **${combat.hpBase}** base + **${combat.hpPerLevel}** per level.`);
            break;
        }

        case "attack": {
            combat.attackBase = interaction.options.getInteger("base", true);
            combat.attackPerLevel = interaction.options.getInteger("per_level", true);
            await interaction.editReply(`Attack set to **${combat.attackBase}** base + **${combat.attackPerLevel}** per level.`);
            break;
        }

        case "defense": {
            combat.defenseBase = interaction.options.getInteger("base", true);
            combat.defensePerLevel = interaction.options.getInteger("per_level", true);
            await interaction.editReply(`Defense set to **${combat.defenseBase}** base + **${combat.defensePerLevel}** per level.`);
            break;
        }

        case "speed": {
            combat.speedBase = interaction.options.getInteger("base", true);
            combat.speedPerLevel = interaction.options.getInteger("per_level", true);
            await interaction.editReply(`Speed set to **${combat.speedBase}** base + **${combat.speedPerLevel}** per level.`);
            break;
        }

        case "crit": {
            combat.critChanceBase = interaction.options.getNumber("chance_base", true);
            combat.critChancePerLevel = interaction.options.getNumber("chance_per_level", true);
            combat.critMultiplierBase = interaction.options.getNumber("multiplier_base", true);
            combat.critMultiplierPerLevel = interaction.options.getNumber("multiplier_per_level", true);
            await interaction.editReply(
                `Crit set to **${combat.critChanceBase}%** base (+**${combat.critChancePerLevel}%**/lvl) • ` +
                `**${combat.critMultiplierBase}×** multiplier (+**${combat.critMultiplierPerLevel}×**/lvl).`
            );
            break;
        }

        case "pve-death-penalty": {
            const goldPercent = interaction.options.getNumber("gold_percent");
            const goldFlat    = interaction.options.getInteger("gold_flat");
            const xpPercent   = interaction.options.getNumber("xp_percent");

            combat.pveDeathPenalty = {
                ...(combat.pveDeathPenalty ?? {}),
                ...(goldPercent !== null && { goldPercent }),
                ...(goldFlat    !== null && { goldFlat }),
                ...(xpPercent   !== null && { xpPercent }),
            };

            const p = combat.pveDeathPenalty;
            await interaction.editReply(
                `PvE death penalty set — ` +
                `Gold: **${p.goldPercent ?? 0}%** + **${p.goldFlat ?? 0}** flat · ` +
                `XP: **${p.xpPercent ?? 0}%**.`
            );
            break;
        }

        case "pvp-death-penalty": {
            const goldPercent        = interaction.options.getNumber("gold_percent");
            const goldFlat           = interaction.options.getInteger("gold_flat");
            const xpPercent          = interaction.options.getNumber("xp_percent");
            const loserGoldToWinner  = interaction.options.getBoolean("loser_gold_to_winner");

            combat.pvpDeathPenalty = {
                ...(combat.pvpDeathPenalty ?? {}),
                ...(goldPercent       !== null && { goldPercent }),
                ...(goldFlat          !== null && { goldFlat }),
                ...(xpPercent         !== null && { xpPercent }),
                ...(loserGoldToWinner !== null && { loserGoldToWinner }),
            };

            const p = combat.pvpDeathPenalty;
            await interaction.editReply(
                `PvP death penalty set — ` +
                `Gold: **${p.goldPercent ?? 0}%** + **${p.goldFlat ?? 0}** flat · ` +
                `XP: **${p.xpPercent ?? 0}%** · ` +
                `Gold to winner: **${p.loserGoldToWinner ? "Yes" : "No"}**.`
            );
            break;
        }

        default:
            await interaction.editReply("Unknown subcommand.");
            return;
    }

    const newConfig = { ...config, combat };
    await setGuildConfig(interaction.guildId, newConfig);
}
