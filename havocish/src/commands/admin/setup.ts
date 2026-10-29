import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, EmbedBuilder, MessageFlags,
    ModalBuilder, PermissionFlagsBits, SlashCommandBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
    type ButtonInteraction, type ChannelSelectMenuInteraction, type ChatInputCommandInteraction, type ModalSubmitInteraction,
    type StringSelectMenuInteraction,
} from "discord.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { setGuildConfig } from "../../db/guilds.js";
import { canManage, DASHBOARD_URL, dashboardButton } from "../../ui/dashboardLinks.js";
import { STARTER_PACKS, type GuildConfigJson, type StarterPack } from "../../content/packs.js";
import { buildSetup, PACES, type Answers, type Pace } from "../../content/setup.js";
import type { GuildConfig } from "../../types/guild.js";

/**
 * Server setup without leaving Discord: the same questions as the dashboard
 * wizard, answered with buttons in one private message, and the same
 * buildSetup (content/setup.ts) turning them into config.
 */

export const data = new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Set havocish up for this server: leveling, pace and a starting world")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

type Step = "leveling" | "pace" | "world" | "names" | "channel" | "confirm" | "writing" | "done";
type State = {
    step: Step;
    answers: Answers;
    /** Gold and XP renamed, or null to keep the server's own. */
    names: { gold: string; xp: string } | null;
    /** Their own world's description, written into a world when they press Set it up. */
    describe: string | null;
    /** What came of it: the world's name, or why it couldn't be made. */
    made: { name: string } | { failed: string } | null;
};

// ponytail: in memory, so a restart mid-setup means running /setup again.
const sessions = new Map<string, State>();
const sessionKey = (i: { guildId: string | null; user: { id: string } }) => `${i.guildId}:${i.user.id}`;

function fresh(): State {
    return {
        step: "leveling",
        names: null,
        describe: null,
        made: null,
        answers: {
            ownLeveling: true, pace: "standard",
            features: { shop: true, combat: true, duels: true, encounters: true, quests: true, achievements: true },
            levelUpChannelId: "", levelRoles: [], roleGold: [],
            packId: STARTER_PACKS[0]?.id ?? null,
        },
    };
}

const button = (id: string, label: string, style = ButtonStyle.Secondary) =>
    new ButtonBuilder().setCustomId(`setup:${id}`).setLabel(label).setStyle(style);
const row = (...parts: ButtonBuilder[]) => new ActionRowBuilder<ButtonBuilder>().addComponents(...parts);

function worldName(s: State) {
    if (s.made && "name" in s.made) return s.made.name;
    if (s.describe) return "your own, from your description";
    return s.answers.packId ? STARTER_PACKS.find((p) => p.id === s.answers.packId)?.name ?? s.answers.packId : "a blank world";
}

/** The message for where this setup is. */
function view(s: State, guildId: string) {
    const embed = new EmbedBuilder().setColor(0xc4a462).setTitle("⚡ Set up havocish");
    const done = [
        s.step !== "leveling" ? `✓ Leveling: ${s.answers.ownLeveling ? `havocish, ${PACES[s.answers.pace].label.toLowerCase()} pace` : "your own leveling bot"}` : "",
        ["names", "channel", "confirm", "done"].includes(s.step) ? `✓ Starting world: ${worldName(s)}` : "",
        ["channel", "confirm", "done"].includes(s.step) && s.names ? `✓ Names: ${s.names.gold}, ${s.names.xp}` : "",
        ["confirm", "done"].includes(s.step) && s.answers.ownLeveling ? `✓ Level-ups: ${s.answers.levelUpChannelId ? `<#${s.answers.levelUpChannelId}>` : "where they happen"}` : "",
    ].filter(Boolean);
    const head = done.length ? `${done.join("\n")}\n\n` : "";

    switch (s.step) {
        case "leveling":
            embed.setDescription("**Who handles leveling here?**\nhavocish can level members as they chat, or work beside a leveling bot you already have and run only the RPG: fights, gathering, crafting, quests.");
            return { embeds: [embed], components: [row(button("lvl:own", "havocish levels my server", ButtonStyle.Primary), button("lvl:other", "I keep my leveling bot"))] };
        case "pace":
            embed.setDescription(`${head}**How fast should members level up?**\n${(Object.keys(PACES) as Pace[]).map((p) => `**${PACES[p].label}:** ${PACES[p].blurb}`).join("\n")}`);
            return { embeds: [embed], components: [row(...(Object.keys(PACES) as Pace[]).map((p) => button(`pace:${p}`, PACES[p].label, p === "standard" ? ButtonStyle.Primary : ButtonStyle.Secondary)))] };
        case "world": {
            embed.setDescription(`${head}**What world should it start with?**\nA starter pack fills in enemies, places, items, gathering, crafting and quests, ready to play. Or describe your own world on the dashboard and AI writes the whole thing for you. Change any of it later.`);
            const menu = new StringSelectMenuBuilder().setCustomId("setup:world").setPlaceholder("Pick a starting world").addOptions(
                ...STARTER_PACKS.map((p) => ({ label: p.name, value: p.id, description: (p.tagline ?? p.description).slice(0, 100) })),
                { label: "Describe my own world", value: "ai", description: "AI writes a whole world from your description, on the dashboard." },
                { label: "Start blank", value: "blank", description: "Nothing added: build your own world on the dashboard." },
            );
            return { embeds: [embed], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] };
        }
        case "names":
            embed.setDescription(`${head}**What do you call money and XP?**\nThey're "gold" and "XP" now. Rename them to fit your server (credits and rep, coins and stars), or keep them.`);
            return { embeds: [embed], components: [row(button("names:keep", "Keep gold and XP", ButtonStyle.Primary), button("names:edit", "Rename them…"))] };
        case "channel": {
            embed.setDescription(`${head}**Where should level-ups be announced?**\nPick a channel, or skip to post them where they happen.`);
            const menu = new ChannelSelectMenuBuilder().setCustomId("setup:channel").setPlaceholder("Pick a channel").setChannelTypes(ChannelType.GuildText);
            return { embeds: [embed], components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(menu), row(button("channel:skip", "Skip"))] };
        }
        case "confirm":
            embed.setDescription(`${head}Nothing you've already made is changed or removed.`);
            return { embeds: [embed], components: [row(button("apply", "Set it up", ButtonStyle.Success), button("restart", "Start over"))] };
        case "writing":
            embed.setDescription(`${head}✍️ **Writing your world…** Enemies, places, gear, quests, gathering and crafting, from your description. This takes about a minute.`);
            return { embeds: [embed], components: [] };
        case "done": {
            const blank = !s.answers.packId;
            const failed = s.made && "failed" in s.made ? `Your world couldn't be made: ${s.made.failed} Everything else is set up; try again from the Library.\n\n` : "";
            embed.setTitle("✅ havocish is set up").setDescription(blank
                ? `${head}${failed}Your world is empty for now. On the Library page, describe the world you want and AI writes it: enemies, places, gear, quests, gathering and crafting. Or make things yourself on the dashboard.`
                : `${head}Members can play now: \`/fight\`, \`/gather\`, \`/craft\`, \`/shop\` and \`/quests\`. Tune anything on the dashboard, and map channels to places so enemies there fit.`);
            return { embeds: [embed], components: [row(dashboardButton(guildId, blank ? "presets" : undefined, blank ? "Open the Library" : "Open dashboard"))] };
        }
    }
}

/**
 * Has the dashboard write a world from the description (the API key and each
 * server's allowance live there), over the same secret the dashboard uses to
 * reach the bot.
 */
async function writeWorld(guildId: string, prompt: string): Promise<{ pack: StarterPack } | { message: string }> {
    const secret = process.env.PREVIEW_SECRET?.trim();
    if (!secret) return { message: "the AI builder isn't switched on here." };
    const res = await fetch(`${DASHBOARD_URL}/api/internal/ai-world`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-preview-secret": secret },
        body: JSON.stringify({ guildId, prompt }),
        signal: AbortSignal.timeout(280_000),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { pack?: StarterPack; message?: string } | null;
    return body?.pack ? { pack: body.pack } : { message: body?.message ?? "the dashboard couldn't be reached." };
}

/** The next question after `step`; pace and level-ups only matter with havocish leveling. */
function next(s: State): Step {
    const order: Step[] = ["leveling", "pace", "world", "names", "channel", "confirm", "done"];
    let i = order.indexOf(s.step) + 1;
    while (!s.answers.ownLeveling && (order[i] === "pace" || order[i] === "channel")) i++;
    return order[i]!;
}

const notManager = "Only the server owner and members with **Manage Server** can set havocish up.";

/** /setup, and the welcome message's "Set up here". */
export async function execute(interaction: ChatInputCommandInteraction | ButtonInteraction) {
    if (!interaction.guildId || !canManage(interaction)) {
        await interaction.reply({ content: notManager, flags: MessageFlags.Ephemeral });
        return;
    }
    const s = fresh();
    sessions.set(sessionKey(interaction), s);
    await interaction.reply({ ...view(s, interaction.guildId), flags: MessageFlags.Ephemeral });
}

export async function handleSetupInteraction(
    interaction: ButtonInteraction | StringSelectMenuInteraction | ChannelSelectMenuInteraction | ModalSubmitInteraction,
) {
    if (interaction.customId === "setup:start" && interaction.isButton()) return execute(interaction);
    if (!interaction.guildId || !canManage(interaction)) {
        await interaction.reply({ content: notManager, flags: MessageFlags.Ephemeral });
        return;
    }
    const s = sessions.get(sessionKey(interaction));
    if (!s) {
        await interaction.reply({ content: "That setup expired. Run `/setup` to start again.", flags: MessageFlags.Ephemeral });
        return;
    }
    const [, action, value] = interaction.customId.split(":");
    let answered = false;
    const a = s.answers;

    switch (action) {
        case "lvl": a.ownLeveling = value === "own"; break;
        case "pace": a.pace = value as Pace; break;
        case "world": {
            const pick = interaction.isStringSelectMenu() ? interaction.values[0]! : "blank";
            if (pick === "ai" && interaction.isStringSelectMenu()) {
                const input = new TextInputBuilder()
                    .setCustomId("describe").setLabel("What's your world like?").setStyle(TextInputStyle.Paragraph)
                    .setMinLength(10).setMaxLength(1500).setPlaceholder("A drowned city under a lighthouse that never goes out. Players are salvage divers…");
                // Discord refuses an empty prefilled value, so only a second try carries the first one over.
                if (s.describe) input.setValue(s.describe);
                await interaction.showModal(new ModalBuilder().setCustomId("setup:describe:save").setTitle("Describe your world").addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(input),
                ));
                return;
            }
            s.describe = null;
            // Their own world is written on the dashboard after this, so setup starts it blank; adding it turns its features on.
            const blank = pick === "blank" || pick === "ai";
            a.packId = blank ? null : pick;
            // Blank: the features stay off until there's something in them.
            for (const f of Object.keys(a.features) as (keyof Answers["features"])[]) a.features[f] = !blank;
            break;
        }
        case "describe":
            if (!interaction.isModalSubmit()) return;
            s.describe = interaction.fields.getTextInputValue("describe").trim();
            // Set up blank until the world is written; it arrives with its own features on.
            a.packId = null;
            for (const f of Object.keys(a.features) as (keyof Answers["features"])[]) a.features[f] = true;
            s.step = "world";
            break;
        case "names":
            if (value === "edit" && interaction.isButton()) {
                const input = (id: string, label: string, now: string) =>
                    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setMaxLength(20).setValue(now));
                await interaction.showModal(new ModalBuilder().setCustomId("setup:names:save").setTitle("Rename money and XP").addComponents(
                    input("gold", "Money (gold)", s.names?.gold ?? "gold"),
                    input("xp", "Experience (XP)", s.names?.xp ?? "XP"),
                ));
                return;
            }
            if (value === "save" && interaction.isModalSubmit()) {
                s.names = { gold: interaction.fields.getTextInputValue("gold").trim() || "gold", xp: interaction.fields.getTextInputValue("xp").trim() || "XP" };
            }
            break;
        case "channel": a.levelUpChannelId = interaction.isChannelSelectMenu() ? interaction.values[0] ?? "" : ""; break;
        case "restart": sessions.set(sessionKey(interaction), Object.assign(s, fresh())); break;
        case "apply": {
            let packs = STARTER_PACKS;
            if (s.describe && interaction.isButton()) {
                s.step = "writing";
                await interaction.update(view(s, interaction.guildId));
                answered = true;
                const made = await writeWorld(interaction.guildId, s.describe);
                if ("pack" in made) {
                    packs = [...STARTER_PACKS, made.pack];
                    a.packId = made.pack.id;
                    s.made = { name: made.pack.name };
                } else {
                    s.made = { failed: made.message };
                }
            }
            const { config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
            // Blank adds nothing, so it changes no switches either: a server already
            // playing keeps combat, the shop and the rest exactly as they are.
            if (!a.packId) a.features = {
                shop: !!config.shop?.enabled, combat: !!config.combat?.enabled,
                duels: !!config.combat?.pvp?.enabled, encounters: !!config.combat?.encounters?.enabled,
                quests: !!config.quests?.enabled, achievements: !!config.achievements?.enabled,
            };
            const built = buildSetup(config as unknown as GuildConfigJson, a, packs) as unknown as GuildConfig;
            if (s.names) built.style = { ...built.style, gold: { ...built.style?.gold, name: s.names.gold }, xp: { ...built.style?.xp, name: s.names.xp } };
            await setGuildConfig(interaction.guildId, built);
            sessions.delete(sessionKey(interaction));
            break;
        }
    }
    if (action !== "restart") s.step = action === "apply" ? "done" : next(s);

    const payload = view(s, interaction.guildId);
    if (answered) {
        await interaction.editReply(payload);
        return;
    }
    // A modal submit came from the setup message; everything else is a component on it.
    if (interaction.isModalSubmit() && interaction.isFromMessage()) await interaction.update(payload);
    else if (!interaction.isModalSubmit()) await interaction.update(payload);
}
