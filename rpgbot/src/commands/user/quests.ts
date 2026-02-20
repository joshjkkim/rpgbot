import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, type ChatInputCommandInteraction, GuildMember, ModalBuilder, ModalSubmitInteraction, TextInputBuilder, TextInputStyle } from "discord.js";
import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateProfile } from "../../cache/profileService.js";
import { applyQuestRewards, applyQuestSideEffects, canStartQuest } from "../../player/quests.js";
import { MessageFlags } from "discord.js";
import type { PendingProfileChanges } from "../../types/cache.js";
import type { QuestConfig, UserQuestState } from "../../types/quest.js";
import { userGuildProfileCache, profileKey } from "../../cache/caches.js";

function formatProgress(state: any, def: any) {
  const cur = typeof state?.progress === "number" ? state.progress : 0;
  const target = def?.conditions?.target ?? def?.conditions?.value ?? 0;

  if (!target) return `\`${cur}\``;
  return `\`${Math.min(cur, target)}/${target}\``;
}

export function questStatus(state: any, def: any, now: number) {
  const accepted = !!state?.acceptedAt;
  const completed = !!state?.completedAt;
  const claimedAtMs = toMs(state?.claimedAt);
  const cooldownMs = (def?.cooldown ?? 0) * 1000;

  // cooldown (after claim)
  if (claimedAtMs && cooldownMs > 0) {
    const readyAt = claimedAtMs + cooldownMs;
    if (now < readyAt) return { kind: "cooldown", readyAt };
  }

  if (completed && !state?.claimedAt) return { kind: "needs_claim" };
  if (accepted && !completed) return { kind: "active" };

  // claimed but cooldown passed OR never started
  return { kind: "available" };
}

function buildQuestsRows(view: "my" | "all") {
  const viewRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("quests:view:my")
      .setLabel("My Quests")
      .setStyle(view === "my" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("quests:view:all")
      .setLabel("All Quests")
      .setStyle(view === "all" ? ButtonStyle.Success : ButtonStyle.Secondary),
  );

  const actionRow = new ActionRowBuilder<ButtonBuilder>();

  if (view === "all") {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId("quests:action:start")
        .setLabel("Start Quest")
        .setStyle(ButtonStyle.Primary),
    );
  } else {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId("quests:action:claim")
        .setLabel("Claim Quest")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("quests:action:claim_all")
        .setLabel("Claim All")
        .setStyle(ButtonStyle.Secondary),
    );
  }

  return [viewRow, actionRow];
}



function toMs(d: any): number | null {
    if (!d) return null;
    const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
    return Number.isFinite(t) ? t : null;
}

function relTime(ms: number) {
    return `<t:${Math.floor(ms / 1000)}:R>`;
}

function dateTime(ms: number) {
    return `<t:${Math.floor(ms / 1000)}:D>`;
}

function renderMyQuestsEmbed({ userQuests, questDefs, config, username }: any) {
  const now = Date.now();
  const lines: string[] = [];

  for (const [questId, state] of Object.entries<any>(userQuests)) {
    const def = questDefs[questId];

    if (!def) {
      lines.push(`• **${questId}** — *(quest removed)*`);
      continue;
    }

    const status = questStatus(state, def, now);
    if(status.kind === "available") {
      continue;
    }
    const claimedAtMs = toMs(state?.claimedAt);

    let lineStatus = "";
    switch (status.kind) {
      case "cooldown": {
        const readyAt = typeof status.readyAt === "number" ? status.readyAt : now;
        lineStatus = `✅ Claimed ${claimedAtMs ? dateTime(claimedAtMs) : ""} • ⏳ next ${relTime(readyAt)}`;
        break;
      }
      case "needs_claim":
        lineStatus = `🎁 Completed — ready to claim`;
        break;
      case "active":
        lineStatus = `🟡 In progress${config?.quests?.progress ? ` (${formatProgress(state, def)})` : ""}`;
        break;
      default:
        lineStatus = `🟢 Available`;
        break;
    }

    lines.push(`• **${def.name}** — ${lineStatus}`);
  }

  const embed = new EmbedBuilder()
    .setTitle(`🧭 ${username}'s Quests`)
    .setDescription(lines.length ? lines.slice(0, 20).join("\n") : "_No quest progress yet._")
    .setFooter({ text: "Tip: switch to All Quests to see everything available" });

  return embed;
}

function renderAllQuestsEmbed({ userQuests, questDefs, config }: any) {
  const now = Date.now();
  const lines: string[] = [];

  for (const def of Object.values<QuestConfig>(questDefs)) {
    if (def.active === false) continue;

    const state = userQuests[def.id];
    const status = questStatus(state, def, now);

    let lineStatus = "";
    switch (status.kind) {
      case "cooldown": {
        const readyAt = typeof status.readyAt === "number" ? status.readyAt : now;
        lineStatus = `⏳ Cooldown — ready ${relTime(readyAt)}`;
        break;
      }
      case "needs_claim":
        lineStatus = `✅ Completed — ready to claim`;
        break;
      case "active":
        lineStatus = `🟡 In progress${config?.quests?.progress ? ` (${formatProgress(state, def)})` : ""}`;
        break;
      default:
        lineStatus = `🟢 Available`;
        break;
    }

    lines.push(`• **${def.name}**, ${def.id} — ${lineStatus}`);
  }

  const embed = new EmbedBuilder()
    .setTitle(`📜 All Active Quests`)
    .setDescription(lines.length ? lines.slice(0, 20).join("\n") : "_No quests configured._");

  return embed;
}



export const data = new SlashCommandBuilder()
    .setName("quests")
    .setDescription("View your quests and available quests")
    .addStringOption(opt =>
        opt.setName("view")
        .setDescription("Which view to open")
        .addChoices(
            { name: "My Quests", value: "my" },
            { name: "All Quests", value: "all" }
        )
        .setRequired(false)
    );

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    const view = interaction.options.getString("view") ?? "my";

    const { user: dbUser } = await getOrCreateDbUser({
        discordUserId: interaction.user.id,
        username: interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL(),
    });
    const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
    const { profile } = await getOrCreateProfile({ userId: dbUser.id, guildId: dbGuild.id });

    

    const questDefs = config.quests?.quests ?? {};
    console.log(questDefs);
    const userQuests = (profile as any).quests ?? {};

    const embed = view === "all"
        ? renderAllQuestsEmbed({ userQuests, questDefs, config })
        : renderMyQuestsEmbed({ userQuests, questDefs, config, username: interaction.user.username });

    const rows = buildQuestsRows(view as any);
    await interaction.editReply({ embeds: [embed], components: rows });
}

export async function handleQuestsButton(interaction: ButtonInteraction) {
  if (!interaction.customId.startsWith("quests:")) return;
  if (!interaction.inGuild() || !interaction.guildId) return;

  const parts = interaction.customId.split(":");
  const kind = parts[1]; // "view" | "action"
  const op = parts[2];   // "my" | "all" | "start" | "claim" | "claim_all"

  if (kind === "action" && (op === "start" || op === "claim")) {
    if (op === "start") {
      const modal = new ModalBuilder()
        .setCustomId("quests:modal:start")
        .setTitle("Start a Quest");

      const questIdInput = new TextInputBuilder()
        .setCustomId("questId")
        .setLabel("Quest ID")
        .setPlaceholder("e.g. daily_messages_25")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(questIdInput));
      await interaction.showModal(modal);
      return;
    }

    if (op === "claim") {
      const modal = new ModalBuilder()
        .setCustomId("quests:modal:claim")
        .setTitle("Claim a Quest");

      const questIdInput = new TextInputBuilder()
        .setCustomId("questId")
        .setLabel("Quest ID")
        .setPlaceholder("e.g. daily_messages_25")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(questIdInput));
      await interaction.showModal(modal);
      return;
    }
  }

  await interaction.deferUpdate();

  // load data once for view switches + claim_all
  const { user: dbUser } = await getOrCreateDbUser({
    discordUserId: interaction.user.id,
    username: interaction.user.username,
    avatarUrl: interaction.user.displayAvatarURL(),
  });
  const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });
  const { profile } = await getOrCreateProfile({ userId: dbUser.id, guildId: dbGuild.id });

  const questDefs = config.quests?.quests ?? {};
  const userQuests = (profile as any).quests ?? {};

  // default view
  let view: "my" | "all" = "my";

  if (kind === "view" && (op === "my" || op === "all")) view = op;

  if (kind === "action" && op === "claim_all") {
    view = "my";
  }

  const embed =
    view === "all"
      ? renderAllQuestsEmbed({ userQuests, questDefs, config })
      : renderMyQuestsEmbed({ userQuests, questDefs, config, username: interaction.user.username });

  const rows = buildQuestsRows(view);
  await interaction.editReply({ embeds: [embed], components: rows });
}

export async function handleQuestsStartModal(interaction: ModalSubmitInteraction) {
  if (interaction.customId !== "quests:modal:start") return;

  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "This interaction can only be used in a server.", flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const questId = interaction.fields.getTextInputValue("questId").trim();

  const { user: dbUser } = await getOrCreateDbUser({
    discordUserId: interaction.user.id,
    username: interaction.user.username,
    avatarUrl: interaction.user.displayAvatarURL(),
  });

  const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });

  const cached = await getOrCreateProfile({ userId: dbUser.id, guildId: dbGuild.id });
  let profile = cached.profile;
  let pending = cached.pendingChanges ?? ({} as PendingProfileChanges);

  if (!config.quests?.enabled) {
    await interaction.editReply({ content: "Quests are disabled in this server." });
    return;
  }

  const qc = config.quests?.quests?.[questId];
  if (!qc || qc.active === false) {
    await interaction.editReply({ content: "Invalid quest ID (or quest is not active)." });
    return;
  }

  const userQuests = ((profile.quests ?? {}) as Record<string, UserQuestState>);
  const state = userQuests[questId];

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const result = canStartQuest(state, qc, nowMs);
  if (!result.ok) {
    if (result.reason === "cooldown" && result.readyAt) {
      const ts = Math.floor(result.readyAt / 1000);
      await interaction.editReply({ content: `That quest is on cooldown. Ready <t:${ts}:R>.` });
      return;
    }
    if (result.reason === "needs_claim") {
      await interaction.editReply({ content: "You already completed that quest — claim it first." });
      return;
    }
    if (result.reason === "already_active") {
      await interaction.editReply({ content: "You already started that quest." });
      return;
    }
    await interaction.editReply({ content: `Cannot start quest: ${result.reason}` });
    return;
  }

  // Create/reset quest state
  userQuests[questId] = {
    acceptedAt: nowIso,
    progress: 0,
    completedAt: null,
    claimedAt: null,
  };

  // Write into profile + pending
  profile = { ...profile, quests: userQuests };
  pending = { ...pending, quests: userQuests };

  userGuildProfileCache.set(profileKey(dbGuild.id, dbUser.id), {
    profile,
    pendingChanges: Object.keys(pending).length ? pending : undefined,
    dirty: true,
    lastWroteToDb: cached.lastWroteToDb,
    lastLoaded: Date.now(),
  });

  await interaction.editReply({ content: `Started **${qc.name}**.` });
}

export async function handleQuestsClaimModal(interaction: ModalSubmitInteraction) {
  if (interaction.customId !== "quests:modal:claim") return;

  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "This interaction can only be used in a server.", flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const questId = interaction.fields.getTextInputValue("questId").trim();

  const { user: dbUser } = await getOrCreateDbUser({
    discordUserId: interaction.user.id,
    username: interaction.user.username,
    avatarUrl: interaction.user.displayAvatarURL(),
  });

  const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });

  const cached = await getOrCreateProfile({ userId: dbUser.id, guildId: dbGuild.id });
  let profile = cached.profile;
  let pending = cached.pendingChanges ?? ({} as PendingProfileChanges);

  if (!config.quests?.enabled) {
    await interaction.editReply({ content: "Quests are disabled in this server." });
    return;
  }

  const qc = config.quests?.quests?.[questId];
  if (!qc || qc.active === false) {
    await interaction.editReply({ content: "Invalid quest ID (or quest is not active)." });
    return;
  }

  const userQuests = (profile.quests ?? {}) as Record<string, UserQuestState>;
  const state = userQuests[questId];

  if (!state) {
    await interaction.editReply({ content: "You haven't started that quest." });
    return;
  }
  if (!state.completedAt) {
    await interaction.editReply({ content: "That quest isn't completed yet." });
    return;
  }
  if (state.claimedAt) {
    await interaction.editReply({ content: "You already claimed that quest." });
    return;
  }

  // mark claimed + reset for repeatability
  const nowIso = new Date().toISOString();
  userQuests[questId] = {
    ...state,
    claimedAt: nowIso,
    acceptedAt: null,
    completedAt: null,
    progress: 0,
  };

  profile = { ...profile, quests: userQuests };
  pending = { ...pending, quests: userQuests };

  // apply rewards
  const rewardEffects = applyQuestRewards({ profile, pending, quest: qc, config });
  profile = rewardEffects.profile;
  pending = rewardEffects.pending;

  // write cache dirty
  userGuildProfileCache.set(profileKey(dbGuild.id, dbUser.id), {
    profile,
    pendingChanges: Object.keys(pending).length ? pending : undefined,
    dirty: true,
    lastWroteToDb: cached.lastWroteToDb,
    lastLoaded: Date.now(),
  });

  // side effects (roles/messages)
  await applyQuestSideEffects({
    client: interaction.client,
    discordGuildId: interaction.guildId,
    discordUserId: interaction.user.id,
    member: interaction.member instanceof GuildMember ? interaction.member : null,
    channelIdHint: interaction.channelId,
    config,
    rewards: rewardEffects ? { grantedRoles: rewardEffects.grantedRoles, messages: rewardEffects.messages } : null,
  });

  // reply
  const parts: string[] = [];
  if (rewardEffects.totalXp) parts.push(`+${rewardEffects.totalXp} xp`);
  if (rewardEffects.totalGold) parts.push(`+${rewardEffects.totalGold} gold`);
  if (rewardEffects.grantedItems.length) {
    for (const it of rewardEffects.grantedItems) parts.push(`+${it.quantity} ${it.itemId}`);
  }

  await interaction.editReply({
    content: parts.length ? `Claimed **${qc.name}**! (${parts.join(", ")})` : `Claimed **${qc.name}**!`,
  });
}