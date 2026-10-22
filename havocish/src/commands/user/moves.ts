import type { ChatInputCommandInteraction, StringSelectMenuInteraction } from "discord.js";
import { ActionRowBuilder, EmbedBuilder, MessageFlags, SlashCommandBuilder, StringSelectMenuBuilder, type ColorResolvable } from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { commitProfileChanges, getOrCreateProfile } from "../../cache/profileService.js";
import { checkRequirements, memberFacts, type MemberFacts } from "../../player/requirements.js";
import { LOADOUT_SIZE, describeMove, gearMoves, loadoutFor, movesOf, playerMoves } from "../../player/moves.js";
import type { GuildConfig } from "../../types/guild.js";
import type { DbUserGuildProfile, UserStats } from "../../types/userprofile.js";
import type { MoveConfig } from "../../types/combat.js";

export const data = new SlashCommandBuilder()
    .setName("moves")
    .setDescription("See your fight moves and pick the ones you take into fights");

/** A move on one line: what it does, its costs after ⚠️. */
function moveLine(move: MoveConfig, config: GuildConfig, note = ""): string {
    const { does, drawbacks } = describeMove(move, config);
    return `${move.emoji} **${move.name}**${note} · ${[...does, ...drawbacks.map((d) => `⚠️ ${d}`)].join(" ")}`;
}

/** Why a players' move isn't usable yet: its requirements, or that it has to be learned. */
function lockedReason(move: MoveConfig, profile: DbUserGuildProfile, config: GuildConfig, facts: MemberFacts): string {
    const learned = profile.user_stats?.moves?.learned ?? [];
    if (move.players?.learned && !learned.includes(move.id)) return "Learned from a scroll or given by gear.";
    return checkRequirements(move.players?.requirements, { profile, config, facts }).message;
}

function render(profile: DbUserGuildProfile, config: GuildConfig, facts: MemberFacts, ownerId: string) {
    const have = playerMoves(profile, config, facts);
    const loadout = loadoutFor(profile, config, facts);
    const items = config.shop?.items ?? {};
    const gear = new Set(gearMoves(profile, config));
    const fromGear = (id: string) => {
        if (!gear.has(id)) return "";
        const item = Object.values(profile.equips ?? {}).map((i) => i && items[i]).find((i) => i && i.effects?.moves?.includes(id));
        return item ? ` *(from ${item.emoji ?? ""} ${item.name})*` : "";
    };
    const haveIds = new Set(have.map((m) => m.id));
    const locked = Object.values(movesOf(config)).filter((m) => m.players && !haveIds.has(m.id));
    const byId = new Map(have.map((m) => [m.id, m]));

    const sections = [
        `**Taken into fights** (${loadout.length}/${LOADOUT_SIZE})`,
        ...loadout.map((id) => moveLine(byId.get(id)!, config, fromGear(id))),
    ];
    const spare = have.filter((m) => !loadout.includes(m.id));
    if (spare.length) sections.push("", "**Also known**", ...spare.map((m) => moveLine(m, config, fromGear(m.id))));
    if (locked.length) sections.push("", "**Locked**", ...locked.map((m) => `🔒 ${m.emoji} **${m.name}** · ${lockedReason(m, profile, config, facts)}`));

    const embed = new EmbedBuilder()
        .setTitle("⚔️ Your moves")
        .setColor(config.style.mainThemeColor as ColorResolvable ?? "#00AE86")
        .setDescription(sections.join("\n").slice(0, 4000));

    // Only worth a picker when there's a choice to make.
    const components = have.length > LOADOUT_SIZE ? [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`moves:loadout:${ownerId}`)
                .setPlaceholder(`Pick up to ${LOADOUT_SIZE} moves for your fights`)
                .setMinValues(1)
                .setMaxValues(Math.min(LOADOUT_SIZE, have.length))
                .addOptions(have.slice(0, 25).map((m) => {
                    const does = describeMove(m, config).does.join(" ").slice(0, 100);
                    return { label: m.name.slice(0, 100), value: m.id, default: loadout.includes(m.id), ...(does && { description: does }) };
                })),
        ),
    ] : [];
    return { embeds: [embed], components };
}

async function load(discordUserId: string, username: string, discordGuildId: string) {
    const { user } = await getOrCreateDbUser({ discordUserId, username });
    const { guild, config } = await getOrCreateGuildConfig({ discordGuildId });
    const { profile } = await getOrCreateProfile({ userId: user.id, guildId: guild.id });
    return { profile, config };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
        return;
    }
    const { profile, config } = await load(interaction.user.id, interaction.user.username, interaction.guildId);
    if (!config.combat.enabled) {
        await interaction.reply({ content: "⚔️ Combat isn't enabled on this server.", flags: MessageFlags.Ephemeral });
        return;
    }
    await interaction.reply({ ...render(profile, config, memberFacts(interaction.member), interaction.user.id), flags: MessageFlags.Ephemeral });
}

/** The loadout picker: saves the picked moves, in the order Discord gives them. */
export async function handleMovesSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    const ownerId = interaction.customId.split(":")[2];
    if (!interaction.guildId || interaction.user.id !== ownerId) {
        await interaction.reply({ content: "Use /moves to pick your own.", flags: MessageFlags.Ephemeral });
        return;
    }
    const { profile, config } = await load(interaction.user.id, interaction.user.username, interaction.guildId);
    const facts = memberFacts(interaction.member);
    const have = new Set(playerMoves(profile, config, facts).map((m) => m.id));
    const picked = interaction.values.filter((id) => have.has(id)).slice(0, LOADOUT_SIZE);

    const stats = { ...(profile.user_stats ?? {}) } as UserStats;
    stats.moves = { ...stats.moves, loadout: picked };
    profile.user_stats = stats;
    commitProfileChanges({
        userId: profile.user_id, guildId: profile.guild_id, profile,
        changes: { user_stats: stats }, baseline: { xp: profile.xp, gold: profile.gold },
    });
    await interaction.update(render(profile, config, facts, ownerId));
}
