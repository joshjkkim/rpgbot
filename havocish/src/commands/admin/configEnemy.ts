import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { setGuildConfig } from "../../db/guilds.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import type { EnemyConfig } from "../../types/combat.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { logAndBroadcastEvent } from "../../db/events.js";

export const data = new SlashCommandBuilder()
    .setName("config-enemy")
    .setDescription("Configure enemies that players can fight")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(sub =>
        sub.setName("show").setDescription("List all configured enemies")
    )

    .addSubcommand(sub =>
        sub.setName("add").setDescription("Add a new enemy")
            .addStringOption(opt =>
                opt.setName("id").setDescription("Unique ID for this enemy (cannot be changed later)").setRequired(true)
            )
            .addStringOption(opt =>
                opt.setName("name").setDescription("Display name of the enemy").setRequired(true)
            )
            .addStringOption(opt =>
                opt.setName("emoji").setDescription("Emoji representing the enemy").setRequired(true)
            )
            .addIntegerOption(opt =>
                opt.setName("hp").setDescription("Enemy max HP").setRequired(true)
            )
            .addIntegerOption(opt =>
                opt.setName("atk").setDescription("Enemy attack stat").setRequired(true)
            )
            .addIntegerOption(opt =>
                opt.setName("def").setDescription("Enemy defense stat").setRequired(true)
            )
            .addIntegerOption(opt =>
                opt.setName("spd").setDescription("Enemy speed stat").setRequired(true)
            )
            .addIntegerOption(opt =>
                opt.setName("xp-reward").setDescription("XP awarded on kill").setRequired(true)
            )
            .addIntegerOption(opt =>
                opt.setName("gold-reward").setDescription("Gold awarded on kill").setRequired(true)
            )
            .addIntegerOption(opt =>
                opt.setName("min-level").setDescription("Minimum player level to encounter (default: 1)").setRequired(false)
            )
            .addIntegerOption(opt =>
                opt.setName("max-level").setDescription("Maximum player level to encounter (leave blank for no cap)").setRequired(false)
            )
            .addNumberOption(opt =>
                opt.setName("crit-chance").setDescription("Crit chance % (default: 5)").setRequired(false)
            )
            .addNumberOption(opt =>
                opt.setName("crit-multiplier").setDescription("Crit damage multiplier (default: 1.5)").setRequired(false)
            )
    )

    .addSubcommand(sub =>
        sub.setName("edit").setDescription("Edit an existing enemy")
            .addStringOption(opt =>
                opt.setName("id").setDescription("The ID of the enemy to edit").setRequired(true)
            )
            .addStringOption(opt =>
                opt.setName("name").setDescription("New display name").setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName("emoji").setDescription("New emoji").setRequired(false)
            )
            .addIntegerOption(opt =>
                opt.setName("hp").setDescription("New max HP").setRequired(false)
            )
            .addIntegerOption(opt =>
                opt.setName("atk").setDescription("New attack stat").setRequired(false)
            )
            .addIntegerOption(opt =>
                opt.setName("def").setDescription("New defense stat").setRequired(false)
            )
            .addIntegerOption(opt =>
                opt.setName("spd").setDescription("New speed stat").setRequired(false)
            )
            .addIntegerOption(opt =>
                opt.setName("xp-reward").setDescription("New XP reward on kill").setRequired(false)
            )
            .addIntegerOption(opt =>
                opt.setName("gold-reward").setDescription("New gold reward on kill").setRequired(false)
            )
            .addIntegerOption(opt =>
                opt.setName("min-level").setDescription("New minimum player level").setRequired(false)
            )
            .addIntegerOption(opt =>
                opt.setName("max-level").setDescription("New maximum player level (-1 to remove the cap)").setRequired(false)
            )
            .addNumberOption(opt =>
                opt.setName("crit-chance").setDescription("New crit chance %").setRequired(false)
            )
            .addNumberOption(opt =>
                opt.setName("crit-multiplier").setDescription("New crit damage multiplier").setRequired(false)
            )
    )

    .addSubcommand(sub =>
        sub.setName("remove").setDescription("Remove an enemy")
            .addStringOption(opt =>
                opt.setName("id").setDescription("The ID of the enemy to remove").setRequired(true)
            )
    )

    .addSubcommand(sub =>
        sub.setName("add-drop").setDescription("Add an item drop to an enemy")
            .addStringOption(opt =>
                opt.setName("enemy-id").setDescription("The ID of the enemy").setRequired(true)
            )
            .addStringOption(opt =>
                opt.setName("item-id").setDescription("The ID of the shop item to drop").setRequired(true)
            )
            .addNumberOption(opt =>
                opt.setName("chance").setDescription("Drop chance 0–1 (e.g. 0.25 = 25%)").setRequired(true)
            )
            .addIntegerOption(opt =>
                opt.setName("quantity").setDescription("How many of the item to drop").setRequired(true)
            )
    )

    .addSubcommand(sub =>
        sub.setName("remove-drop").setDescription("Remove a drop from an enemy")
            .addStringOption(opt =>
                opt.setName("enemy-id").setDescription("The ID of the enemy").setRequired(true)
            )
            .addIntegerOption(opt =>
                opt.setName("drop-index").setDescription("Index of the drop to remove (use /config-enemy list-drops to see indices)").setRequired(true)
            )
    )

    .addSubcommand(sub =>
        sub.setName("list-drops").setDescription("List all drops configured for an enemy")
            .addStringOption(opt =>
                opt.setName("enemy-id").setDescription("The ID of the enemy").setRequired(true)
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
    const newConfig = structuredClone(config);
    const sub = interaction.options.getSubcommand();

    // Ensure enemies map exists
    newConfig.combat.enemies ??= {};
    const enemies = newConfig.combat.enemies;

    switch (sub) {
        case "show": {
            const list = Object.values(enemies);
            if (list.length === 0) {
                await interaction.editReply("No enemies configured. Use `/config-enemy add` to add one.");
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle("👾 Configured Enemies")
                .setColor(config.style.mainThemeColor as any ?? "#00AE86")
                .setDescription(`**${list.length}** enemy${list.length === 1 ? "" : "s"} configured.`);

            for (const enemy of list) {
                const levelRange = enemy.maxLevel == null
                    ? `Lv. ${enemy.minLevel}+`
                    : `Lv. ${enemy.minLevel}–${enemy.maxLevel}`;
                embed.addFields({
                    name: `${enemy.emoji} ${enemy.name}  \`[${enemy.id}]\``,
                    value: [
                        `❤️ **${enemy.hp}** HP · ⚔️ **${enemy.atk}** ATK · 🛡️ **${enemy.def}** DEF · 💨 **${enemy.spd}** SPD`,
                        `🎯 **${enemy.critChance}%** crit × **${enemy.critMultiplier}** · ${levelRange}`,
                        `🏆 **${enemy.xpReward}** XP · 💰 **${enemy.goldReward}** gold · 🎁 **${enemy.drops?.length ?? 0}** drop(s)`,
                    ].join("\n"),
                    inline: false,
                });
            }

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        case "add": {
            const id = interaction.options.getString("id", true).toLowerCase().replace(/\s+/g, "_");

            if (enemies[id]) {
                await interaction.editReply(`An enemy with ID \`${id}\` already exists.`);
                return;
            }

            const enemy: EnemyConfig = {
                id,
                name: interaction.options.getString("name", true),
                emoji: interaction.options.getString("emoji", true),
                hp: interaction.options.getInteger("hp", true),
                atk: interaction.options.getInteger("atk", true),
                def: interaction.options.getInteger("def", true),
                spd: interaction.options.getInteger("spd", true),
                critChance: interaction.options.getNumber("crit-chance") ?? 5,
                critMultiplier: interaction.options.getNumber("crit-multiplier") ?? 1.5,
                minLevel: interaction.options.getInteger("min-level") ?? 1,
                maxLevel: interaction.options.getInteger("max-level") ?? null,
                xpReward: interaction.options.getInteger("xp-reward", true),
                goldReward: interaction.options.getInteger("gold-reward", true),
                drops: [],
            };

            enemies[id] = enemy;
            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply(`Enemy **${enemy.emoji} ${enemy.name}** (\`${id}\`) added.`);
            break;
        }

        case "edit": {
            const id = interaction.options.getString("id", true);
            const enemy = enemies[id];

            if (!enemy) {
                await interaction.editReply(`No enemy found with ID \`${id}\`.`);
                return;
            }

            const name          = interaction.options.getString("name");
            const emoji         = interaction.options.getString("emoji");
            const hp            = interaction.options.getInteger("hp");
            const atk           = interaction.options.getInteger("atk");
            const def           = interaction.options.getInteger("def");
            const spd           = interaction.options.getInteger("spd");
            const xpReward      = interaction.options.getInteger("xp-reward");
            const goldReward    = interaction.options.getInteger("gold-reward");
            const minLevel      = interaction.options.getInteger("min-level");
            const maxLevel      = interaction.options.getInteger("max-level");
            const critChance    = interaction.options.getNumber("crit-chance");
            const critMultiplier = interaction.options.getNumber("crit-multiplier");

            if (name !== null)          enemy.name = name;
            if (emoji !== null)         enemy.emoji = emoji;
            if (hp !== null)            enemy.hp = hp;
            if (atk !== null)           enemy.atk = atk;
            if (def !== null)           enemy.def = def;
            if (spd !== null)           enemy.spd = spd;
            if (xpReward !== null)      enemy.xpReward = xpReward;
            if (goldReward !== null)    enemy.goldReward = goldReward;
            if (minLevel !== null)      enemy.minLevel = minLevel;
            if (maxLevel !== null)      enemy.maxLevel = maxLevel === -1 ? null : maxLevel;
            if (critChance !== null)    enemy.critChance = critChance;
            if (critMultiplier !== null) enemy.critMultiplier = critMultiplier;

            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply(`Enemy \`${id}\` updated.`);
            break;
        }

        case "remove": {
            const id = interaction.options.getString("id", true);

            if (!enemies[id]) {
                await interaction.editReply(`No enemy found with ID \`${id}\`.`);
                return;
            }

            const removedName = enemies[id].name;
            delete enemies[id];
            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply(`Enemy **${removedName}** (\`${id}\`) removed.`);
            break;
        }

        case "add-drop": {
            const enemyId = interaction.options.getString("enemy-id", true);
            const enemy = enemies[enemyId];

            if (!enemy) {
                await interaction.editReply(`No enemy found with ID \`${enemyId}\`.`);
                return;
            }

            const itemId   = interaction.options.getString("item-id", true);
            const chance   = interaction.options.getNumber("chance", true);
            const quantity = interaction.options.getInteger("quantity", true);

            if (chance < 0 || chance > 1) {
                await interaction.editReply("Chance must be between `0` and `1` (e.g. `0.25` for 25%).");
                return;
            }
            if (quantity < 1) {
                await interaction.editReply("Quantity must be at least 1.");
                return;
            }
            if (config.shop?.items && !config.shop.items[itemId]) {
                await interaction.editReply(`No shop item found with ID \`${itemId}\`. Make sure the item exists in the shop first.`);
                return;
            }

            enemy.drops ??= [];
            enemy.drops.push({ itemId, chance, quantity });

            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply(
                `Added drop \`${itemId}\` ×${quantity} at **${(chance * 100).toFixed(1)}%** chance to **${enemy.emoji} ${enemy.name}**.`
            );
            break;
        }

        case "remove-drop": {
            const enemyId   = interaction.options.getString("enemy-id", true);
            const enemy     = enemies[enemyId];

            if (!enemy) {
                await interaction.editReply(`No enemy found with ID \`${enemyId}\`.`);
                return;
            }

            const drops     = enemy.drops ?? [];
            const dropIndex = interaction.options.getInteger("drop-index", true);

            if (dropIndex < 0 || dropIndex >= drops.length) {
                await interaction.editReply(`Invalid drop index \`${dropIndex}\`. Use \`/config-enemy list-drops\` to see valid indices (0-based).`);
                return;
            }

            const [removed] = drops.splice(dropIndex, 1);
            enemy.drops = drops;

            await setGuildConfig(interaction.guildId, newConfig);
            await interaction.editReply(`Removed drop \`${removed?.itemId}\` from **${enemy.emoji} ${enemy.name}**.`);
            break;
        }

        case "list-drops": {
            const enemyId = interaction.options.getString("enemy-id", true);
            const enemy   = enemies[enemyId];

            if (!enemy) {
                await interaction.editReply(`No enemy found with ID \`${enemyId}\`.`);
                return;
            }

            const drops = enemy.drops ?? [];
            if (drops.length === 0) {
                await interaction.editReply(`**${enemy.emoji} ${enemy.name}** has no drops. Use \`/config-enemy add-drop\` to add one.`);
                return;
            }

            const lines = drops.map((d, i) =>
                `**${i}.** \`${d.itemId}\` ×${d.quantity} — **${(d.chance * 100).toFixed(1)}%** chance`
            );
            await interaction.editReply(`Drops for **${enemy.emoji} ${enemy.name}**:\n${lines.join("\n")}`);
            return;
        }

        default:
            await interaction.editReply("Unknown subcommand.");
            return;
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
            source: "enemy",
            metaData: { actorDiscordId: interaction.user.id, subcommand: sub },
            timestamp: new Date(),
        }, newConfig);
    }
}
