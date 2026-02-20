import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, type ChatInputCommandInteraction, type ColorResolvable, type MessageActionRowComponentBuilder } from "discord.js";
import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateProfile } from "../../cache/profileService.js";
import { calculateTotalXpForLevel } from "../../leveling/levels.js";
import { refreshTempRolesForMember } from "../../player/roles.js";
import type { StreakReward } from "../../types/guild.js";
import type { UserStats } from "../../types/userprofile.js";
import { AttachmentBuilder } from "discord.js";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
GlobalFonts.registerFromPath("assets/fonts/Inter-Regular.ttf", "Inter");
GlobalFonts.registerFromPath("assets/fonts/Inter-SemiBold.ttf", "InterSemi");
GlobalFonts.registerFromPath("assets/fonts/Inter-Bold.ttf", "InterBold");
import { drawTextWithEmojis } from "../../ui/canvas/drawEmojis.js";

function createProgressBar(current: number, max: number, length: number = 10): string {
    const progress = Math.min(current / max, 1);
    const filledBars = Math.floor(progress * length);
    const emptyBars = length - filledBars;
    
    const filled = '█'.repeat(filledBars);
    const empty = '░'.repeat(emptyBars);
    
    return `${filled}${empty}`;
}

function formatDuration(ms: number): string {
    if (ms <= 0) return "expired";

    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${totalSeconds}s`;
}

function roundRectPath(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

async function drawAvatarCircle(ctx: any, url: string, cx: number, cy: number, radius: number) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch avatar: ${res.status}`);
  const arr = await res.arrayBuffer();
  const img = await loadImage(Buffer.from(arr));

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  // cover-fit crop into circle
  const size = radius * 2;
  const scale = Math.max(size / img.width, size / img.height);
  const w = img.width * scale;
  const h = img.height * scale;

  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

export const data = new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your profile")

    .addSubcommand(sub =>
        sub.setName("test")
        .setDescription("Test subcommand")
    )

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply("This command can only be used in a server.");
        return;
    }

    await interaction.deferReply();

    const { user: dbUser } = await getOrCreateDbUser({
        discordUserId: interaction.user.id,
        username: interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL(),
    });

    const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });

    let { profile } = await getOrCreateProfile({
        userId: dbUser.id,
        guildId: dbGuild.id,
    });

    const W = 1100;
    const H = 400;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");

    // ---------- data ----------
    const username = interaction.user.username;

    const totalXp = Number(profile.xp ?? "0");
    const level = Number(profile.level ?? 0);

    const currentLevelXp = calculateTotalXpForLevel(level, config);
    const nextLevelXp = calculateTotalXpForLevel(level + 1, config);

    const xpInCurrentLevel = Math.max(0, totalXp - currentLevelXp);
    const xpNeededForNext = Math.max(1, nextLevelXp - currentLevelXp);

    const pct = Math.max(0, Math.min(1, xpInCurrentLevel / xpNeededForNext));
    const pctLabel = `${Math.floor(pct * 100)}%`;

    const goldNum = Number(profile.gold ?? "0");
    const goldLabel = goldNum.toLocaleString();

    const streak = Number(profile.streak_count ?? 0);

    const accent = config.style.mainThemeColor || "#00AE86";
    const goldIcon = config.style?.gold?.icon || "💰";
    const xpIcon = config.style?.xp?.icon || "⭐";

    // ---------- helpers ----------
    function hexToRgb(hex: string) {
        const n = parseInt(hex.replace("#", ""), 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    const ac = hexToRgb(accent);

    // ---------- background ----------
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, "#080c18");
    bgGrad.addColorStop(1, "#0f1525");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // subtle grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.025)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // accent glow blobs
    const blobGrad = ctx.createRadialGradient(200, 200, 0, 200, 200, 300);
    blobGrad.addColorStop(0, `rgba(${ac.r},${ac.g},${ac.b},0.12)`);
    blobGrad.addColorStop(1, "transparent");
    ctx.fillStyle = blobGrad;
    ctx.fillRect(0, 0, W, H);

    const blobGrad2 = ctx.createRadialGradient(W - 150, 80, 0, W - 150, 80, 200);
    blobGrad2.addColorStop(0, `rgba(${ac.r},${ac.g},${ac.b},0.08)`);
    blobGrad2.addColorStop(1, "transparent");
    ctx.fillStyle = blobGrad2;
    ctx.fillRect(0, 0, W, H);

    // ---------- main card ----------
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    roundRectPath(ctx, 28, 28, W - 56, H - 56, 28);
    ctx.fill();

    ctx.fillStyle = "rgba(13,18,35,0.95)";
    roundRectPath(ctx, 36, 36, W - 72, H - 72, 24);
    ctx.fill();

    // card border
    ctx.strokeStyle = `rgba(${ac.r},${ac.g},${ac.b},0.25)`;
    ctx.lineWidth = 1.5;
    roundRectPath(ctx, 36, 36, W - 72, H - 72, 24);
    ctx.stroke();

    // ---------- left accent bar ----------
    const barGrad = ctx.createLinearGradient(36, 36, 36, H - 36);
    barGrad.addColorStop(0, accent);
    barGrad.addColorStop(0.6, `rgba(${ac.r},${ac.g},${ac.b},0.5)`);
    barGrad.addColorStop(1, "transparent");
    ctx.fillStyle = barGrad;
    roundRectPath(ctx, 36, 36, 6, H - 72, 4);
    ctx.fill();

    // glow on accent bar
    ctx.shadowColor = accent;
    ctx.shadowBlur = 20;
    ctx.fillStyle = barGrad;
    roundRectPath(ctx, 36, 36, 6, H - 72, 4);
    ctx.fill();
    ctx.shadowBlur = 0;

    // ---------- divider line ----------
    const divX = 760;
    const divGrad = ctx.createLinearGradient(divX, 60, divX, H - 60);
    divGrad.addColorStop(0, "transparent");
    divGrad.addColorStop(0.3, `rgba(${ac.r},${ac.g},${ac.b},0.3)`);
    divGrad.addColorStop(0.7, `rgba(${ac.r},${ac.g},${ac.b},0.3)`);
    divGrad.addColorStop(1, "transparent");
    ctx.strokeStyle = divGrad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(divX, 70);
    ctx.lineTo(divX, H - 70);
    ctx.stroke();

    // ---------- avatar ----------
    const avatarUrl = interaction.user.displayAvatarURL({ extension: "png", size: 256 });
    const AX = 145, AY = H / 2, AR = 72;

    // outer glow ring
    ctx.shadowColor = accent;
    ctx.shadowBlur = 24;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(AX, AY, AR + 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // avatar clip
    await drawAvatarCircle(ctx, avatarUrl, AX, AY, AR);

    // inner border
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(AX, AY, AR + 2, 0, Math.PI * 2);
    ctx.stroke();

    // level badge
    const badgeR = 22;
    const badgeX = AX + AR * 0.68;
    const badgeY = AY + AR * 0.68;

    ctx.fillStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = "#0d1223";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${level >= 100 ? 13 : 15}px InterBold`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(level), badgeX, badgeY);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    // ---------- name & title ----------
    const textX = 255;

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 42px InterBold";
    ctx.fillText(username, textX, 122);

    // underline accent
    const nameW = ctx.measureText(username).width;
    const ulGrad = ctx.createLinearGradient(textX, 0, textX + nameW, 0);
    ulGrad.addColorStop(0, accent);
    ulGrad.addColorStop(1, "transparent");
    ctx.fillStyle = ulGrad;
    ctx.fillRect(textX, 128, nameW, 2);

    ctx.fillStyle = `rgba(${ac.r},${ac.g},${ac.b},0.85)`;
    ctx.font = "18px InterSemi";
    ctx.fillText(`Level ${level}  •  ${pctLabel} to Level ${level + 1}`, textX, 158);

    // ---------- XP progress bar ----------
    const pbX = textX;
    const pbY = 180;
    const pbW = 450;
    const pbH = 14;

    // track
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRectPath(ctx, pbX, pbY, pbW, pbH, 7);
    ctx.fill();

    // fill
    const fillW = Math.max(pbH, Math.floor(pbW * pct));
    const fillGrad = ctx.createLinearGradient(pbX, 0, pbX + pbW, 0);
    fillGrad.addColorStop(0, `rgba(${ac.r},${ac.g},${ac.b},0.7)`);
    fillGrad.addColorStop(1, accent);
    ctx.fillStyle = fillGrad;
    roundRectPath(ctx, pbX, pbY, fillW, pbH, 7);
    ctx.fill();

    // shimmer
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    roundRectPath(ctx, pbX, pbY, fillW, pbH / 2, 7);
    ctx.fill();

    // glow
    ctx.shadowColor = accent;
    ctx.shadowBlur = 10;
    ctx.fillStyle = "transparent";
    roundRectPath(ctx, pbX, pbY, fillW, pbH, 7);
    ctx.fill();
    ctx.shadowBlur = 0;

    // xp label
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "16px Inter";
    ctx.fillText(`${xpInCurrentLevel.toLocaleString()} / ${xpNeededForNext.toLocaleString()} XP`, pbX, pbY + pbH + 20);

    // ---------- stat chips ----------
    async function drawChip(label: string, iconText: string, chipX: number, chipY: number, chipW: number) {
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        roundRectPath(ctx, chipX, chipY, chipW, 52, 12);
        ctx.fill();

        ctx.strokeStyle = `rgba(${ac.r},${ac.g},${ac.b},0.2)`;
        ctx.lineWidth = 1;
        roundRectPath(ctx, chipX, chipY, chipW, 52, 12);
        ctx.stroke();

        ctx.fillStyle = `rgba(${ac.r},${ac.g},${ac.b},0.8)`;
        ctx.font = "14px InterSemi";
        await drawTextWithEmojis({ ctx, text: iconText, x: chipX + 14, y: chipY + 22, emojiSize: 14 });

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 18px InterBold";
        await drawTextWithEmojis({ ctx, text: label, x: chipX + 14, y: chipY + 42, emojiSize: 18 });
    }

    const chipY = 240;
    await drawChip(goldLabel, `${goldIcon} Gold`, textX, chipY, 160);
    await drawChip(`${streak} days`, "🔥 Streak", textX + 175, chipY, 160);
    await drawChip(totalXp.toLocaleString(), `${xpIcon} Total XP`, textX + 350, chipY, 170);

    // ---------- right panel ----------
    const rX = 800;

    ctx.fillStyle = `rgba(${ac.r},${ac.g},${ac.b},0.08)`;
    roundRectPath(ctx, rX, 62, W - rX - 48, H - 124, 18);
    ctx.fill();

    // RANK label
    ctx.fillStyle = `rgba(${ac.r},${ac.g},${ac.b},0.7)`;
    ctx.font = "13px InterSemi";
    ctx.letterSpacing = "3px";
    ctx.fillText("LEVEL", rX + 20, 102);
    ctx.letterSpacing = "0px";

    // big level number
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 80px InterBold";
    ctx.fillText(String(level), rX + 20, 186);

    // accent underline
    const lvlW = ctx.measureText(String(level)).width;
    ctx.fillStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 8;
    ctx.fillRect(rX + 20, 194, lvlW, 3);
    ctx.shadowBlur = 0;

    // xp summary
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "15px Inter";
    ctx.fillText("XP Progress", rX + 20, 230);

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "bold 17px InterBold";
    ctx.fillText(`${xpInCurrentLevel.toLocaleString()} / ${xpNeededForNext.toLocaleString()}`, rX + 20, 255);

    // mini progress bar
    const mpW = W - rX - 88;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRectPath(ctx, rX + 20, 268, mpW, 8, 4);
    ctx.fill();

    const mpFill = Math.max(8, Math.floor(mpW * pct));
    ctx.fillStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 8;
    roundRectPath(ctx, rX + 20, 268, mpFill, 8, 4);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = `rgba(${ac.r},${ac.g},${ac.b},0.7)`;
    ctx.font = "bold 16px InterBold";
    ctx.fillText(pctLabel, rX + 20, 300);

    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = "13px Inter";
    ctx.fillText(`to Level ${level + 1}`, rX + 20, 320);

    // ---------- output ----------
    const buffer = canvas.toBuffer("image/png");
    const file = new AttachmentBuilder(buffer, { name: "profile-card.png" });

    // const member = await interaction.guild?.members.fetch(interaction.user.id);

    // if (member) {
    //     profile = await refreshTempRolesForMember(member, profile);
    // }

    // const tempRolesMap = profile.temp_roles ?? {};
    // const now = Date.now();

    // const activeTempEntries = Object.entries(tempRolesMap).filter(([roleId]) =>
    //     member?.roles.cache.has(roleId)
    // );

    // const tempRoleLines: string[] = [];

    // for (const [roleId, state] of activeTempEntries) {
    //     const role = member?.roles.cache.get(roleId);
    //     if (!role) continue;

    //     const remainingMs = new Date(state.expiresAt).getTime() - now;
    //     const remainingText = formatDuration(remainingMs);

    //     tempRoleLines.push(`${role} — expires in **${remainingText}**`);
    // }

    // const tempRoleIds = new Set(Object.keys(tempRolesMap));
    // const permanentRoles = member?.roles.cache.filter(
    //     r => r.id !== interaction.guildId && !tempRoleIds.has(r.id)
    // );

    // const permanentRoleLines = permanentRoles?.map(r => r.toString()).slice(0, 15) || [];

    // const color = config.style.mainThemeColor || 0x00AE86;

    // const currentLevelXp = calculateTotalXpForLevel(profile.level, config);
    // const nextLevelXp = calculateTotalXpForLevel(profile.level + 1, config);
    // const xpInCurrentLevel = Number(profile.xp) - currentLevelXp;
    // const xpNeededForNext = nextLevelXp - currentLevelXp;
    // const progressBar = createProgressBar(xpInCurrentLevel, xpNeededForNext, 15);
    // const percentage = Math.floor((xpInCurrentLevel / xpNeededForNext) * 100);

    // const streakRewards = config.xp.streakRewards;

    // const nextStreakReward = Object.entries(streakRewards)
    //     .map(([days, reward]) => ({ days: Number(days), reward: reward as StreakReward }))
    //     .find(reward => reward.days > profile.streak_count);

    // const embed = new EmbedBuilder()
    //     .setTitle(`✨ ${interaction.user.username}'s Profile`)
    //     .setThumbnail(interaction.user.displayAvatarURL())
    //     .setDescription(`**Level ${profile.level}** • ${percentage}% to Level ${profile.level + 1}`)
    //     .addFields(
    //         {
    //             name: "📊 Progress",
    //             value: `\`${progressBar}\` ${xpInCurrentLevel}/${xpNeededForNext} XP`,
    //             inline: false
    //         },
    //         {
    //             name: `${config.style.gold.icon || "💰"} ${config.style.gold.name || "Gold"}`,
    //             value: `\`${profile.gold.toLocaleString()}\``,
    //             inline: true
    //         },
    //         {
    //             name: `${config.style.xp.icon || "⭐"} ${config.style.xp.name || "XP"}`,
    //             value: `\`${profile.xp.toLocaleString()}\``,
    //             inline: true
    //         },
    //         {
    //             name: "🔥 Streak",
    //             value: `\`${profile.streak_count}\` days`,
    //             inline: true
    //         },
    //     );

    // if (nextStreakReward) {
    //     embed.addFields({
    //         name: "🎁 Next Streak Reward",
    //         value: `Reach a ${nextStreakReward.days}-day streak to earn **${nextStreakReward.reward.xpBonus} ${config.style.xp.name || "XP"}** and **${nextStreakReward.reward?.goldBonus} ${config.style.gold.name || "Gold"}**!`,
    //         inline: false
    //     });
    // }

    // if (tempRoleLines.length > 0) {
    //     embed.addFields({
    //         name: "⏳ Temporary Roles",
    //         value: tempRoleLines.join("\n"),
    //         inline: false,
    //     });
    // }

    // if (permanentRoleLines.length > 0) {
    //     embed.addFields({
    //         name: "🏷️ Roles",
    //         value: permanentRoleLines.join(", "),
    //         inline: false,
    //     });
    // } else {
    //     embed.addFields({
    //         name: "🏷️ Roles",
    //         value: "No visible roles.",
    //         inline: false,
    //     });
    // }

    const buttons: ButtonBuilder[] = [
        new ButtonBuilder()
            .setCustomId("profile:stats")
            .setLabel("Stats")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId("profile:achievements")
            .setLabel("Achievements")
            .setStyle(ButtonStyle.Primary),
    ];

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);

    // embed.setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
    //     .setColor(color as ColorResolvable)
    //     .setFooter({ text: `Keep up the great work!` })
    //     .setTimestamp();

    await interaction.editReply({ files: [file], components: [row] });
}

export async function handleProfileButton(interaction: ButtonInteraction) {
    if(!interaction.customId.startsWith("profile:")) return;

    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply("This command can only be used in a server.");
        return;
    }

    await interaction.deferReply();

    const { user: dbUser } = await getOrCreateDbUser({
        discordUserId: interaction.user.id,
        username: interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL(),
    });

    const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });

    const { profile } = await getOrCreateProfile({
        userId: dbUser.id,
        guildId: dbGuild.id,
    });

    const stats: UserStats = profile.user_stats || {};
    const achievements = profile.achievements || {};
    
    const themeColor = config.style.mainThemeColor || 0x00AE86;

    const choice = interaction.customId.split(":")[1];

    const embed = new EmbedBuilder()
        .setColor(themeColor as any);

    switch (choice) {
        case "stats": {
            embed.setTitle("Profile Stats for " + interaction.user.username)
            .setDescription([
                `**Total Messages Sent:** \`${stats.messagesSent ?? 0}\``,
                `**Total Voice Minutes:** \`${stats.timeSpentInVC ?? 0}\``,
                `**Items Purchased:** \`${stats.itemsPurchased ?? 0}\``,
                `**Items Used:** \`${stats.itemsUsed ?? 0}\``,
                `**Gold from Dailies:** \`${stats.goldFromDailies ?? 0}\``,
                `**Gold from Items:** \`${stats.goldFromItems ?? 0}\``,
                `**Total Gold Earned:** \`${stats.goldEarned ?? 0}\``,
                `**Total Gold Spent:** \`${stats.goldSpent ?? 0}\``,
                `**XP from Messages:** \`${stats.xpFromMessages ?? 0}\``,
                `**XP from Dailies:** \`${stats.xpFromDaily ?? 0}\``,
                `**XP from Voice Chat:** \`${stats.xpFromVC ?? 0}\``,
                `**XP from Items:** \`${stats.xpFromItems ?? 0}\``,
                `**Dailies Claimed:** \`${stats.dailiesClaimed ?? 0}\``,
                `**Max Streak:** \`${stats.maxStreak ?? 0}\``,
            ].join("\n"));
            break;
        }

        case "achievements": {
            const unlockedMap = profile.achievements ?? {};
            const achCfg = config.achievements?.achievements ?? {};

            const unlockedIds = Object.keys(unlockedMap);

            const unlockedLines = unlockedIds
                .map((id) => {
                const def = achCfg[id];
                const unlockedAt = unlockedMap[id]?.unlockedAt;

                if (!def) {
                    return `**${id}** (unlocked)`;
                }

                const ts = unlockedAt ? Math.floor(new Date(unlockedAt).getTime() / 1000) : null;
                const dateStr = ts ? ` — <t:${ts}:D>` : "";

                return `**${def.name}** — ${def.description}${dateStr}`;
                });

            const allDefs = Object.values(achCfg);
            const lockedVisibleCount = allDefs.filter(d => !d.secret && !unlockedMap[d.id]).length;

            embed
                .setTitle(`Achievements for ${interaction.user.username}`)
                .setDescription(
                unlockedLines.length
                    ? unlockedLines.join("\n")
                    : "No achievements unlocked yet."
                )
                .setFooter({ text: lockedVisibleCount > 0 ? `${lockedVisibleCount} locked achievements remaining` : "All visible achievements unlocked" });

            break;
        }
    }

    await interaction.editReply({ embeds: [embed] });
}
