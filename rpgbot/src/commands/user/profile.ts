import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, MessageFlags, type ChatInputCommandInteraction, type ColorResolvable, type MessageActionRowComponentBuilder } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { getOrCreateDbUser } from "../../cache/userService.js";
import { getOrCreateGuildConfig } from "../../cache/guildService.js";
import { getOrCreateProfile } from "../../cache/profileService.js";
import { calculateTotalXpForLevel } from "../../leveling/levels.js";
import type { GuildConfig } from "../../types/guild.js";
import type { DbUserGuildProfile, UserStats } from "../../types/userprofile.js";
import { AttachmentBuilder } from "discord.js";
import { createCanvas, loadImage, GlobalFonts, type CanvasRenderingContext2D } from "@napi-rs/canvas";
GlobalFonts.registerFromPath("assets/fonts/Inter-Regular.ttf", "Inter");
GlobalFonts.registerFromPath("assets/fonts/Inter-SemiBold.ttf", "InterSemi");
GlobalFonts.registerFromPath("assets/fonts/Inter-Bold.ttf", "InterBold");
import { drawTextWithEmojis } from "../../ui/canvas/drawEmojis.js";

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

    .addUserOption(option =>
        option.setName("user")
            .setDescription("The user to view the profile of")
            .setRequired(false)
    );

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply("This command can only be used in a server.");
        return;
    }

    const user = interaction.options.getUser("user") ?? interaction.user;

    const { user: dbUser } = await getOrCreateDbUser({
        discordUserId: user.id,
        username: user.username,
        avatarUrl: user.displayAvatarURL(),
    });

    const { guild: dbGuild, config } = await getOrCreateGuildConfig({ discordGuildId: interaction.guildId });

    const { profile } = await getOrCreateProfile({
        userId: dbUser.id,
        guildId: dbGuild.id,
    });

    await interaction.deferReply({ flags: profile.settings && profile.settings.profilePrivate ? MessageFlags.Ephemeral : undefined });

    const file = config.style.template === "fantasy"
        ? await buildFantasyProfileCard(interaction, profile, config)
        : await buildProfileCard(interaction, profile, config);

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

    await interaction.editReply({ files: [file], components: [row]  });
}

export async function buildProfileCard(
    interaction: ChatInputCommandInteraction,
    profile: DbUserGuildProfile,
    config: GuildConfig
): Promise<AttachmentBuilder> {
    const W = 1100;
    const H = 420;
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

    // Profile emoji & title from equipped cosmetics
    let profileEmoji: string | null = null;
    let profileTitle: string | null = null;
    let accent = config.style.mainThemeColor || "#00AE86";

    if (profile.equips) {
        for (const [slot, itemId] of Object.entries(profile.equips)) {
            if (!itemId) continue;
            const item = config.shop?.items?.[itemId as string];
            const cosmetic = item?.effects?.cosmetic;
            if (!cosmetic) continue;

            if (cosmetic.nameEmoji)     profileEmoji = cosmetic.nameEmoji;
            if (cosmetic.title)     profileTitle = cosmetic.title;
            if (cosmetic.accentHex) accent       = cosmetic.accentHex;
        }
    }
    const textColor = config.style.mainTextColor || "#FFFFFF";
    const goldIcon = config.style?.gold?.icon || "💰";
    const goldText = config.style?.gold?.name || "Gold";
    const xpIcon = config.style?.xp?.icon || "⭐";
    const xpText = config.style?.xp?.name || "XP";

    // ---------- helpers ----------
    function hexToRgb(hex: string) {
        const n = parseInt(hex.replace("#", ""), 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    const ac = hexToRgb(accent);
    const tc = hexToRgb(textColor);

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
    ctx.strokeStyle = `rgba(${tc.r},${tc.g},${tc.b},0.2)`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(AX, AY, AR + 2, 0, Math.PI * 2);
    ctx.stroke();

    // ---------- profile emoji (top-left of avatar) ----------
    if (profileEmoji) {
        const emojiX = AX - AR * 0.68 - 4;
        const emojiY = AY - AR * 0.68 - 4;
        const emojiSize = 32;

        // backing circle
        ctx.fillStyle = "rgba(13,18,35,0.85)";
        ctx.strokeStyle = `rgba(${ac.r},${ac.g},${ac.b},0.5)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(emojiX, emojiY, emojiSize / 2 + 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.font = `${emojiSize}px Inter`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        await drawTextWithEmojis({ ctx, text: profileEmoji, x: emojiX - emojiSize / 2, y: emojiY - emojiSize / 2 + 21, emojiSize });
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
    }

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

    ctx.fillStyle = textColor;
    ctx.font = `bold ${level >= 100 ? 13 : 15}px InterBold`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(level), badgeX, badgeY);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    // ---------- name & title ----------
    const textX = 255;

    // Title cosmetic badge (above name)
    if (profileTitle) {
        const titlePadX = 10;
        const titlePadY = 5;
        ctx.font = "bold 13px InterSemi";
        const titleW = ctx.measureText(profileTitle).width;

        ctx.fillStyle = `rgba(${ac.r},${ac.g},${ac.b},0.18)`;
        roundRectPath(ctx, textX, 72, titleW + titlePadX * 2, 22 + titlePadY, 6);
        ctx.fill();

        ctx.strokeStyle = `rgba(${ac.r},${ac.g},${ac.b},0.5)`;
        ctx.lineWidth = 1;
        roundRectPath(ctx, textX, 72, titleW + titlePadX * 2, 22 + titlePadY, 6);
        ctx.stroke();

        ctx.fillStyle = accent;
        ctx.textBaseline = "middle";
        ctx.fillText(profileTitle, textX + titlePadX, 72 + (22 + titlePadY) / 2);
        ctx.textBaseline = "alphabetic";
    }

    ctx.fillStyle = textColor;
    ctx.font = "bold 42px InterBold";
    ctx.fillText(username, textX, profileTitle ? 148 : 122);

    const nameBaseY = profileTitle ? 148 : 122;

    // underline accent
    const nameW = ctx.measureText(username).width;
    const ulGrad = ctx.createLinearGradient(textX, 0, textX + nameW, 0);
    ulGrad.addColorStop(0, accent);
    ulGrad.addColorStop(1, "transparent");
    ctx.fillStyle = ulGrad;
    ctx.fillRect(textX, nameBaseY + 6, nameW, 2);

    ctx.fillStyle = `rgba(${ac.r},${ac.g},${ac.b},0.85)`;
    ctx.font = "18px InterSemi";
    ctx.fillText(`Level ${level}  •  ${pctLabel} to Level ${level + 1}`, textX, nameBaseY + 36);

    // ---------- XP progress bar ----------
    const pbX = textX;
    const pbY = nameBaseY + 56;
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
    ctx.fillStyle = `rgba(${tc.r},${tc.g},${tc.b},0.15)`;
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
    ctx.fillStyle = `rgba(${tc.r},${tc.g},${tc.b},0.55)`;
    ctx.font = "16px Inter";
    ctx.fillText(`${xpInCurrentLevel.toLocaleString()} / ${xpNeededForNext.toLocaleString()} XP`, pbX, pbY + pbH + 20);

    // ---------- stat chips ----------
    async function drawChip(label: string, iconText: string, chipX: number, chipY: number, chipW: number) {
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        roundRectPath(ctx, chipX, chipY, chipW, 52, 12);
        ctx.fill();

        ctx.strokeStyle = `rgba(${tc.r},${tc.g},${tc.b},0.2)`;
        ctx.lineWidth = 1;
        roundRectPath(ctx, chipX, chipY, chipW, 52, 12);
        ctx.stroke();

        ctx.fillStyle = `rgba(${tc.r},${tc.g},${tc.b},0.8)`;
        ctx.font = "14px InterSemi";
        await drawTextWithEmojis({ ctx, text: iconText, x: chipX + 14, y: chipY + 22, emojiSize: 14 });

        ctx.fillStyle = textColor;
        ctx.font = "bold 18px InterBold";
        await drawTextWithEmojis({ ctx, text: label, x: chipX + 14, y: chipY + 42, emojiSize: 18 });
    }

    const chipY = pbY + pbH + 46;
    await drawChip(goldLabel, `${goldIcon} ${goldText}`, textX, chipY, 160);
    await drawChip(`${streak} days`, "🔥 Streak", textX + 175, chipY, 160);
    await drawChip(totalXp.toLocaleString(), `${xpIcon} Total ${xpText}`, textX + 350, chipY, 170);

    // ---------- right panel ----------
    const rX = 800;

    ctx.fillStyle = `rgba(${ac.r},${ac.g},${ac.b},0.08)`;
    roundRectPath(ctx, rX, 62, W - rX - 48, H - 124, 18);
    ctx.fill();

    // LEVEL label
    ctx.fillStyle = `rgba(${ac.r},${ac.g},${ac.b},0.7)`;
    ctx.font = "13px InterSemi";
    ctx.letterSpacing = "3px";
    ctx.fillText("LEVEL", rX + 20, 102);
    ctx.letterSpacing = "0px";

    // big level number
    ctx.fillStyle = textColor;
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
    ctx.fillStyle = `rgba(${tc.r},${tc.g},${tc.b},0.45)`;
    ctx.font = "15px Inter";
    ctx.fillText("XP Progress", rX + 20, 230);

    ctx.fillStyle = `rgba(${tc.r},${tc.g},${tc.b},0.9)`;
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

    ctx.fillStyle = `rgba(${tc.r},${tc.g},${tc.b},0.25)`;
    ctx.font = "13px Inter";
    ctx.fillText(`to Level ${level + 1}`, rX + 20, 320);

    // ---------- output ----------
    const buffer = canvas.toBuffer("image/png");
    return new AttachmentBuilder(buffer, { name: "profile-card.png" });
}

// ...existing code...
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
    const accent = config.style.mainThemeColor || "#00AE86";
    const textColor = config.style.mainTextColor || "#FFFFFF";

    function hexToRgb(hex: string) {
        const n = parseInt(hex.replace("#", ""), 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    const ac = hexToRgb(accent);
    const tc = hexToRgb(textColor);

    const choice = interaction.customId.split(":")[1];

    let file: AttachmentBuilder;

    if (choice === "stats") {
        const statRows = [
            ["Total Messages Sent",  stats.messagesSent    ?? 0],
            ["Total Voice Minutes",  stats.timeSpentInVC   ?? 0],
            ["Items Purchased",      stats.itemsPurchased  ?? 0],
            ["Items Used",           stats.itemsUsed       ?? 0],
            ["Gold from Dailies",    stats.goldFromDailies ?? 0],
            ["Gold from Items",      stats.goldFromItems   ?? 0],
            ["Total Gold Earned",    stats.goldEarned      ?? 0],
            ["Total Gold Spent",     stats.goldSpent       ?? 0],
            ["XP from Messages",     stats.xpFromMessages  ?? 0],
            ["XP from Dailies",      stats.xpFromDaily     ?? 0],
            ["XP from Voice Chat",   stats.xpFromVC        ?? 0],
            ["XP from Items",        stats.xpFromItems     ?? 0],
            ["Dailies Claimed",      stats.dailiesClaimed  ?? 0],
            ["Max Streak",           stats.maxStreak       ?? 0],
        ] as [string, number][];

        const COLS = 2;
        const ROWS = Math.ceil(statRows.length / COLS);
        const W = 900;
        const HEADER_H = 90;
        const ROW_H = 52;
        const PAD = 40;
        const H = HEADER_H + ROWS * ROW_H + PAD;

        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext("2d");

        // background
        const bgGrad = ctx.createLinearGradient(0, 0, W, H);
        bgGrad.addColorStop(0, "#080c18");
        bgGrad.addColorStop(1, "#0f1525");
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // grid lines
        ctx.strokeStyle = "rgba(255,255,255,0.025)";
        ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

        // blob glow
        const blob = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 300);
        blob.addColorStop(0, `rgba(${ac.r},${ac.g},${ac.b},0.10)`);
        blob.addColorStop(1, "transparent");
        ctx.fillStyle = blob;
        ctx.fillRect(0, 0, W, H);

        // card
        ctx.fillStyle = "rgba(13,18,35,0.95)";
        roundRectPath(ctx, 24, 24, W - 48, H - 48, 20);
        ctx.fill();

        ctx.strokeStyle = `rgba(${ac.r},${ac.g},${ac.b},0.25)`;
        ctx.lineWidth = 1.5;
        roundRectPath(ctx, 24, 24, W - 48, H - 48, 20);
        ctx.stroke();

        // left accent bar
        const barGrad = ctx.createLinearGradient(24, 24, 24, H - 24);
        barGrad.addColorStop(0, accent);
        barGrad.addColorStop(0.6, `rgba(${ac.r},${ac.g},${ac.b},0.5)`);
        barGrad.addColorStop(1, "transparent");
        ctx.shadowColor = accent;
        ctx.shadowBlur = 16;
        ctx.fillStyle = barGrad;
        roundRectPath(ctx, 24, 24, 5, H - 48, 4);
        ctx.fill();
        ctx.shadowBlur = 0;

        // title
        ctx.fillStyle = textColor;
        ctx.font = "bold 30px InterBold";
        ctx.textBaseline = "middle";
        ctx.fillText(`${interaction.user.username}'s Stats`, 50, 62);

        // underline
        const titleW = ctx.measureText(`${interaction.user.username}'s Stats`).width;
        const ulGrad = ctx.createLinearGradient(50, 0, 50 + titleW, 0);
        ulGrad.addColorStop(0, accent); ulGrad.addColorStop(1, "transparent");
        ctx.fillStyle = ulGrad;
        ctx.fillRect(50, 78, titleW, 2);
        ctx.textBaseline = "alphabetic";

        // stat rows
        const colW = (W - 80) / COLS;
        statRows.forEach(([label, value], i) => {
            const col = i % COLS;
            const row = Math.floor(i / COLS);
            const x = 48 + col * colW;
            const y = HEADER_H + row * ROW_H;

            // row bg (alternating)
            ctx.fillStyle = row % 2 === 0
                ? "rgba(255,255,255,0.03)"
                : "rgba(0,0,0,0.0)";
            roundRectPath(ctx, x - 8, y + 4, colW - 16, ROW_H - 8, 8);
            ctx.fill();

            ctx.fillStyle = `rgba(${tc.r},${tc.g},${tc.b},0.55)`;
            ctx.font = "15px Inter";
            ctx.textBaseline = "middle";
            ctx.fillText(label, x + 8, y + ROW_H * 0.38);

            ctx.fillStyle = textColor;
            ctx.font = "bold 17px InterBold";
            ctx.fillText(Number(value).toLocaleString(), x + 8, y + ROW_H * 0.72);
            ctx.textBaseline = "alphabetic";
        });

        const buffer = canvas.toBuffer("image/png");
        file = new AttachmentBuilder(buffer, { name: "profile-stats.png" });

    } else if (choice === "achievements") {
        const unlockedMap = profile.achievements ?? {};
        const achCfg = config.achievements?.achievements ?? {};
        const unlockedIds = Object.keys(unlockedMap);

        type AchRow = { name: string; description: string; dateStr: string; unlocked: boolean };
        const rows: AchRow[] = [];

        for (const id of unlockedIds) {
            const def = achCfg[id];
            const unlockedAt = unlockedMap[id]?.unlockedAt;
            const ts = unlockedAt ? Math.floor(new Date(unlockedAt).getTime() / 1000) : null;
            const dateStr = ts ? new Date(ts * 1000).toLocaleDateString() : "";
            rows.push({
                name: def?.name ?? id,
                description: def?.description ?? "",
                dateStr,
                unlocked: true,
            });
        }

        const allDefs = Object.values(achCfg);
        const lockedVisible = allDefs.filter((d: any) => !d.secret && !unlockedMap[d.id]);
        for (const d of lockedVisible as any[]) {
            rows.push({ name: d.name, description: d.description, dateStr: "", unlocked: false });
        }

        const ROW_H = 64;
        const HEADER_H = 90;
        const PAD = 40;
        const W = 900;
        const H = Math.max(200, HEADER_H + rows.length * ROW_H + PAD);

        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext("2d");

        // background
        const bgGrad = ctx.createLinearGradient(0, 0, W, H);
        bgGrad.addColorStop(0, "#080c18");
        bgGrad.addColorStop(1, "#0f1525");
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        ctx.strokeStyle = "rgba(255,255,255,0.025)";
        ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

        const blob = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 300);
        blob.addColorStop(0, `rgba(${ac.r},${ac.g},${ac.b},0.10)`);
        blob.addColorStop(1, "transparent");
        ctx.fillStyle = blob;
        ctx.fillRect(0, 0, W, H);

        // card
        ctx.fillStyle = "rgba(13,18,35,0.95)";
        roundRectPath(ctx, 24, 24, W - 48, H - 48, 20);
        ctx.fill();

        ctx.strokeStyle = `rgba(${ac.r},${ac.g},${ac.b},0.25)`;
        ctx.lineWidth = 1.5;
        roundRectPath(ctx, 24, 24, W - 48, H - 48, 20);
        ctx.stroke();

        // left accent bar
        const barGrad = ctx.createLinearGradient(24, 24, 24, H - 24);
        barGrad.addColorStop(0, accent);
        barGrad.addColorStop(0.6, `rgba(${ac.r},${ac.g},${ac.b},0.5)`);
        barGrad.addColorStop(1, "transparent");
        ctx.shadowColor = accent;
        ctx.shadowBlur = 16;
        ctx.fillStyle = barGrad;
        roundRectPath(ctx, 24, 24, 5, H - 48, 4);
        ctx.fill();
        ctx.shadowBlur = 0;

        // title
        ctx.fillStyle = textColor;
        ctx.font = "bold 30px InterBold";
        ctx.textBaseline = "middle";
        ctx.fillText(`${interaction.user.username}'s Achievements`, 50, 62);

        const titleW = ctx.measureText(`${interaction.user.username}'s Achievements`).width;
        const ulGrad = ctx.createLinearGradient(50, 0, 50 + titleW, 0);
        ulGrad.addColorStop(0, accent); ulGrad.addColorStop(1, "transparent");
        ctx.fillStyle = ulGrad;
        ctx.fillRect(50, 78, titleW, 2);
        ctx.textBaseline = "alphabetic";

        if (rows.length === 0) {
            ctx.fillStyle = `rgba(${tc.r},${tc.g},${tc.b},0.45)`;
            ctx.font = "18px Inter";
            ctx.textBaseline = "middle";
            ctx.fillText("No achievements unlocked yet.", 50, HEADER_H + 40);
            ctx.textBaseline = "alphabetic";
        }

        rows.forEach((row, i) => {
            const y = HEADER_H + i * ROW_H;

            // row bg
            ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.0)";
            roundRectPath(ctx, 40, y + 4, W - 80, ROW_H - 8, 8);
            ctx.fill();

            // icon circle
            const iconX = 64, iconY = y + ROW_H / 2;
            ctx.fillStyle = row.unlocked
                ? `rgba(${ac.r},${ac.g},${ac.b},0.2)`
                : "rgba(255,255,255,0.05)";
            ctx.beginPath();
            ctx.arc(iconX, iconY, 18, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = row.unlocked ? accent : `rgba(${tc.r},${tc.g},${tc.b},0.3)`;
            ctx.font = "bold 16px InterBold";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(row.unlocked ? "✓" : "?", iconX, iconY);
            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";

            // name
            ctx.fillStyle = row.unlocked ? textColor : `rgba(${tc.r},${tc.g},${tc.b},0.35)`;
            ctx.font = `bold 17px InterBold`;
            ctx.textBaseline = "middle";
            ctx.fillText(row.name, 92, y + ROW_H * 0.36);

            // description
            ctx.fillStyle = row.unlocked
                ? `rgba(${tc.r},${tc.g},${tc.b},0.55)`
                : `rgba(${tc.r},${tc.g},${tc.b},0.22)`;
            ctx.font = "14px Inter";
            ctx.fillText(row.description, 92, y + ROW_H * 0.70);
            ctx.textBaseline = "alphabetic";

            // date (right-aligned)
            if (row.dateStr) {
                ctx.fillStyle = `rgba(${ac.r},${ac.g},${ac.b},0.6)`;
                ctx.font = "13px InterSemi";
                ctx.textAlign = "right";
                ctx.textBaseline = "middle";
                ctx.fillText(row.dateStr, W - 52, y + ROW_H / 2);
                ctx.textAlign = "left";
                ctx.textBaseline = "alphabetic";
            }
        });

        const buffer = canvas.toBuffer("image/png");
        file = new AttachmentBuilder(buffer, { name: "profile-achievements.png" });
    } else {
        await interaction.editReply({ content: "Unknown panel." });
        return;
    }

    await interaction.editReply({ files: [file] });
}

export async function buildFantasyProfileCard(
    interaction: ChatInputCommandInteraction,
    profile: any,
    config: any
): Promise<AttachmentBuilder> {
    // ── Canvas dimensions — wider panoramic parchment ───────────────────────
    const W = 1200;
    const H = 460;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");

    // ── Data ─────────────────────────────────────────────────────────────────
    const username = interaction.user.username;
    const totalXp = Number(profile.xp ?? "0");
    const level = Number(profile.level ?? 0);

    const currentLevelXp = calculateTotalXpForLevel(level, config);
    const nextLevelXp    = calculateTotalXpForLevel(level + 1, config);
    const xpInCurrentLevel  = Math.max(0, totalXp - currentLevelXp);
    const xpNeededForNext   = Math.max(1, nextLevelXp - currentLevelXp);
    const pct      = Math.max(0, Math.min(1, xpInCurrentLevel / xpNeededForNext));
    const pctLabel = `${Math.floor(pct * 100)}%`;

    const goldNum   = Number(profile.gold ?? "0");
    const goldLabel = goldNum.toLocaleString();
    const streak    = Number(profile.streak_count ?? 0);

    const goldIcon  = config.style?.gold?.icon  || "💰";
    const goldText  = config.style?.gold?.name  || "Gold";
    const xpIcon    = config.style?.xp?.icon    || "⭐";
    const xpText    = config.style?.xp?.name    || "XP";

    // ── Palette ───────────────────────────────────────────────────────────────
    // accent is ONLY used for high-impact moments (XP bar, wax seal, rune dots,
    // corner diamonds, underlines). Everything structural is hardcoded neutral
    // so the card reads clearly regardless of what theme color the user picks.
    const accent = config.style.mainThemeColor || "#C4973A";

    function hexToRgb(hex: string) {
        const n = parseInt(hex.replace("#", ""), 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    const ac = hexToRgb(accent);
    const textColor = config.style.mainTextColor || "#FFFFFF";
    const tc = hexToRgb(textColor);

    // ── Fixed neutral anchors (never theme-tinted) ────────────────────────────
    const BLACK_WALNUT  = "#0A0806";
    const DARK_BARK     = "#17110A";   // outer background
    const BARK          = "#201609";   // inner card fill
    const STONE_BORDER  = "#8A7A62";   // structural borders — warm stone, not gold
    const STONE_DIM     = "rgba(138,122,98,0.35)";
    const STONE_FAINT   = "rgba(138,122,98,0.12)";

    // Parchment cream — always the same warm ivory for text/structural lines
    const PARCHMENT     = "#D4C9AE";
    const PARCHMENT_DIM = "rgba(212,201,174,0.5)";
    const PARCHMENT_FAINT = "rgba(212,201,174,0.15)";

    // ── Accent shorthands (used sparingly) ────────────────────────────────────
    const ACCENT        = accent;
    const ACCENT_DIM    = `rgba(${ac.r},${ac.g},${ac.b},0.45)`;
    const ACCENT_FAINT  = `rgba(${ac.r},${ac.g},${ac.b},0.14)`;

    // Legacy aliases so the rest of the code still compiles unchanged
    const GOLD          = ACCENT;
    const GOLD_DIM      = ACCENT_DIM;
    const GOLD_FAINT    = ACCENT_FAINT;

    // ── Helpers ───────────────────────────────────────────────────────────────
    function roundRectPath(
        c: CanvasRenderingContext2D,
        x: number, y: number,
        w: number, h: number,
        r: number
    ) {
        c.beginPath();
        c.moveTo(x + r, y);
        c.lineTo(x + w - r, y);
        c.quadraticCurveTo(x + w, y, x + w, y + r);
        c.lineTo(x + w, y + h - r);
        c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        c.lineTo(x + r, y + h);
        c.quadraticCurveTo(x, y + h, x, y + h - r);
        c.lineTo(x, y + r);
        c.quadraticCurveTo(x, y, x + r, y);
        c.closePath();
    }

    // Rough/scratchy stroke — mimics an inked quill by drawing the path twice with slight offsets
    function roughStroke(
        c: CanvasRenderingContext2D,
        drawPath: () => void,
        color: string,
        lw: number
    ) {
        c.save();
        c.strokeStyle = color;
        c.lineWidth = lw;
        c.lineCap = "round";
        c.lineJoin = "round";
        drawPath();
        c.stroke();
        // second pass slightly thicker + semi-transparent for ink bleed
        c.globalAlpha = 0.18;
        c.lineWidth = lw + 1.5;
        drawPath();
        c.stroke();
        c.restore();
    }

    // ── BACKGROUND — aged parchment-dark ─────────────────────────────────────
    // Base fill
    ctx.fillStyle = DARK_BARK;
    ctx.fillRect(0, 0, W, H);

    // Aged wood grain — dense fine diagonal lines (fixed warm tone, never accent)
    ctx.strokeStyle = "rgba(200,165,100,0.02)";
    ctx.lineWidth = 1;
    for (let i = -H * 2; i < W + H; i += 9) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H * 1.5, H); ctx.stroke();
    }

    // Darker horizontal grain bands (planks)
    for (let band = 0; band < 6; band++) {
        const by = (H / 6) * band;
        ctx.fillStyle = `rgba(0,0,0,${0.04 + (band % 2) * 0.03})`;
        ctx.fillRect(0, by, W, H / 6);
    }

    // Fixed hearth glow — warm orange-amber always, regardless of theme
    const fireCentre = ctx.createRadialGradient(W * 0.42, H * 0.5, 0, W * 0.42, H * 0.5, W * 0.55);
    fireCentre.addColorStop(0, "rgba(180,100,20,0.06)");
    fireCentre.addColorStop(0.5, "rgba(140,70,10,0.03)");
    fireCentre.addColorStop(1, "transparent");
    ctx.fillStyle = fireCentre;
    ctx.fillRect(0, 0, W, H);

    // ── OUTER FRAME — carved stone border ────────────────────────────────────
    // Thick rough outer rect — stone-coloured, not accent
    ctx.save();
    ctx.strokeStyle = STONE_BORDER;
    ctx.lineWidth = 3.5;
    ctx.setLineDash([6, 3, 14, 3]);
    ctx.lineDashOffset = 4;
    roundRectPath(ctx, 14, 14, W - 28, H - 28, 8);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Thin inner line
    ctx.strokeStyle = STONE_DIM;
    ctx.lineWidth = 1;
    roundRectPath(ctx, 22, 22, W - 44, H - 44, 6);
    ctx.stroke();

    // Stone-fill inner card
    ctx.fillStyle = BARK;
    roundRectPath(ctx, 26, 26, W - 52, H - 52, 5);
    ctx.fill();

    // Aged vignette inside card
    const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.1, W / 2, H / 2, H * 0.85);
    vignette.addColorStop(0, "transparent");
    vignette.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = vignette;
    ctx.fillRect(26, 26, W - 52, H - 52);

    // ── CORNER RUNE ORNAMENTS ─────────────────────────────────────────────────
    function drawRuneCorner(ox: number, oy: number, sx: number, sy: number) {
        ctx.save();
        ctx.translate(ox, oy);
        ctx.scale(sx, sy);

        // Outer L-bracket — stone, not accent
        roughStroke(ctx, () => {
            ctx.beginPath();
            ctx.moveTo(0, 52); ctx.lineTo(0, 6);
            ctx.arcTo(0, 0, 6, 0, 6);
            ctx.lineTo(52, 0);
        }, STONE_BORDER, 2);

        // Inner L-bracket
        ctx.strokeStyle = STONE_DIM;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 38); ctx.lineTo(0, 14);
        ctx.arcTo(0, 8, 8, 8, 5);
        ctx.lineTo(38, 8);
        ctx.stroke();

        // Corner diamond — accent pop
        ctx.fillStyle = ACCENT;
        ctx.beginPath();
        ctx.moveTo(0, -7); ctx.lineTo(7, 0); ctx.lineTo(0, 7); ctx.lineTo(-7, 0);
        ctx.closePath(); ctx.fill();

        // Small rune dots along arms — stone, not accent
        ctx.fillStyle = STONE_DIM;
        for (const [dx, dy] of [[16, 0], [32, 0], [0, 16], [0, 32]] as [number, number][]) {
            ctx.beginPath(); ctx.arc(dx, dy, 2, 0, Math.PI * 2); ctx.fill();
        }

        ctx.restore();
    }

    drawRuneCorner(14, 14,   1,  1);
    drawRuneCorner(W - 14, 14, -1,  1);
    drawRuneCorner(14, H - 14,  1, -1);
    drawRuneCorner(W - 14, H - 14, -1, -1);

    // ── HORIZONTAL DIVIDERS — quill-drawn lines ───────────────────────────────
    function drawQuillRule(y: number, x1: number, x2: number, op: number = 0.5) {
        const g = ctx.createLinearGradient(x1, y, x2, y);
        g.addColorStop(0, "transparent");
        g.addColorStop(0.08, `rgba(138,122,98,${op})`);
        g.addColorStop(0.5, `rgba(138,122,98,${op * 0.6})`);
        g.addColorStop(0.92, `rgba(138,122,98,${op})`);
        g.addColorStop(1, "transparent");

        ctx.strokeStyle = g;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();

        ctx.strokeStyle = `rgba(138,122,98,${op * 0.2})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x1, y + 2); ctx.lineTo(x2, y + 2); ctx.stroke();
    }

    // ── AVATAR MEDALLION (LEFT) ───────────────────────────────────────────────
    const AX = 152, AY = H / 2, AR = 76;

    // Stone ring — multi-layer carved look (stone-coloured, not accent)
    for (let ring = 3; ring >= 0; ring--) {
        const rr = AR + 8 + ring * 10;
        const alpha = [0.55, 0.22, 0.1, 0.04][ring];
        ctx.strokeStyle = ring === 0 ? STONE_BORDER : `rgba(138,122,98,${alpha})`;
        ctx.lineWidth = ring === 0 ? 2.5 : 1;
        ctx.beginPath(); ctx.arc(AX, AY, rr, 0, Math.PI * 2); ctx.stroke();
    }

    // Rune dots — cardinal points use ACCENT, intercardinals use stone
    const runeR = AR + 38;
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const rx = AX + Math.cos(angle) * runeR;
        const ry = AY + Math.sin(angle) * runeR;
        const isCardinal = i % 2 === 0;
        ctx.fillStyle = isCardinal ? ACCENT : STONE_DIM;
        ctx.beginPath(); ctx.arc(rx, ry, isCardinal ? 4 : 2.5, 0, Math.PI * 2); ctx.fill();
        if (isCardinal) {
            // tiny cross in accent
            ctx.strokeStyle = ACCENT;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(rx - 7, ry); ctx.lineTo(rx + 7, ry);
            ctx.moveTo(rx, ry - 7); ctx.lineTo(rx, ry + 7);
            ctx.stroke();
        }
    }

    // Avatar image clipped to circle
    await drawAvatarCircle(ctx, interaction.user.displayAvatarURL({ extension: "png", size: 256 }), AX, AY, AR);

    // Polished stone rim around avatar
    ctx.strokeStyle = STONE_BORDER;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(AX, AY, AR + 2, 0, Math.PI * 2); ctx.stroke();

    // Dark inner shadow on avatar edge
    const avatarInner = ctx.createRadialGradient(AX, AY, AR - 10, AX, AY, AR + 2);
    avatarInner.addColorStop(0, "transparent");
    avatarInner.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = avatarInner;
    ctx.beginPath(); ctx.arc(AX, AY, AR + 2, 0, Math.PI * 2); ctx.fill();

    // ── WAX SEAL LEVEL BADGE ──────────────────────────────────────────────────
    const sealX = AX + AR * 0.7 + 4;
    const sealY = AY + AR * 0.7 + 4;
    const sealR = 24;

    ctx.save();
    ctx.translate(sealX, sealY);

    // Wax blob — always deep crimson (wax looks like wax regardless of theme)
    ctx.fillStyle = "#5C1A1A";
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const wobble = 1 + 0.12 * Math.sin(i * 3.7 + 1.2) * Math.cos(i * 1.9);
        const r = sealR * wobble;
        i === 0 ? ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
                : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();

    // Sheen on top half of blob
    ctx.fillStyle = "rgba(255,180,180,0.07)";
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const wobble = 1 + 0.12 * Math.sin(i * 3.7 + 1.2) * Math.cos(i * 1.9);
        const r = sealR * wobble;
        i === 0 ? ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
                : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();

    // Pressed ring in accent
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, sealR - 3, 0, Math.PI * 2); ctx.stroke();

    // Level number in parchment cream
    ctx.fillStyle = PARCHMENT;
    ctx.font = `bold ${level >= 100 ? 11 : 14}px InterBold`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(level), 0, 0);
    ctx.restore();

    // ── BANNER RIBBON — name area ─────────────────────────────────────────────
    const BX = 270;    // ribbon left x
    const BY = 46;     // ribbon top y
    const BW = 560;    // ribbon width
    const BH = 38;     // ribbon height

    // Ribbon body — deep near-black, structural, not accent-tinted
    ctx.fillStyle = "rgba(12,8,4,0.82)";
    ctx.beginPath();
    ctx.moveTo(BX - 20, BY);
    ctx.lineTo(BX,      BY + BH / 2);
    ctx.lineTo(BX - 20, BY + BH);
    ctx.lineTo(BX + BW + 20, BY + BH);
    ctx.lineTo(BX + BW,      BY + BH / 2);
    ctx.lineTo(BX + BW + 20, BY);
    ctx.closePath(); ctx.fill();

    ctx.strokeStyle = STONE_BORDER;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(BX - 20, BY);
    ctx.lineTo(BX,      BY + BH / 2);
    ctx.lineTo(BX - 20, BY + BH);
    ctx.lineTo(BX + BW + 20, BY + BH);
    ctx.lineTo(BX + BW,      BY + BH / 2);
    ctx.lineTo(BX + BW + 20, BY);
    ctx.closePath(); ctx.stroke();

    // Ribbon text — parchment, not accent-tinted
    ctx.fillStyle = PARCHMENT_DIM;
    ctx.font = "12px InterSemi";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.letterSpacing = "4px";
    ctx.fillText("✦  ADVENTURER  ✦", BX + BW / 2, BY + BH / 2);
    ctx.letterSpacing = "0px";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    // ── NAME ──────────────────────────────────────────────────────────────────
    const textX = BX;

    ctx.fillStyle = PARCHMENT;
    ctx.font = "bold 46px InterBold";
    ctx.fillText(username, textX, 142);

    const nameW = ctx.measureText(username).width;

    // Underline — quill swoosh style
    const nameUl = ctx.createLinearGradient(textX, 0, textX + nameW + 20, 0);
    nameUl.addColorStop(0, ACCENT);
    nameUl.addColorStop(0.6, ACCENT_DIM);
    nameUl.addColorStop(1, "transparent");
    ctx.fillStyle = nameUl;
    ctx.fillRect(textX, 149, nameW + 20, 2);
    ctx.fillStyle = STONE_FAINT;
    ctx.fillRect(textX, 152, nameW, 1);

    // Sub-title
    ctx.fillStyle = PARCHMENT_DIM;
    ctx.font = "15px InterSemi";
    ctx.fillText(`Level ${level}  ·  ${pctLabel} to Level ${level + 1}`, textX, 175);

    // ── XP SCROLL BAR ─────────────────────────────────────────────────────────
    // The bar looks like a worn rope or scroll rod
    const pbX = textX, pbY = 192, pbW = 470, pbH = 16;

    // Scroll track (aged dark wood)
    ctx.fillStyle = BLACK_WALNUT;
    roundRectPath(ctx, pbX, pbY, pbW, pbH, 8);
    ctx.fill();

    // Track border — stone neutral
    ctx.strokeStyle = STONE_DIM;
    ctx.lineWidth = 1;
    roundRectPath(ctx, pbX, pbY, pbW, pbH, 8);
    ctx.stroke();

    // Knot marks — stone ring
    for (let n = 1; n < 5; n++) {
        const nx = pbX + (pbW / 5) * n;
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath(); ctx.arc(nx, pbY + pbH / 2, 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = STONE_DIM;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(nx, pbY + pbH / 2, 3, 0, Math.PI * 2); ctx.stroke();
    }

    // Fill — accent color, darkened at start for depth (works for any hue)
    const fillW = Math.max(pbH, Math.floor(pbW * pct));
    const barFill = ctx.createLinearGradient(pbX, 0, pbX + fillW, 0);
    barFill.addColorStop(0, `rgba(${ac.r * 0.3 | 0},${ac.g * 0.3 | 0},${ac.b * 0.3 | 0},0.85)`);
    barFill.addColorStop(0.5, `rgba(${ac.r * 0.75 | 0},${ac.g * 0.75 | 0},${ac.b * 0.75 | 0},0.95)`);
    barFill.addColorStop(1, ACCENT);
    ctx.fillStyle = barFill;
    roundRectPath(ctx, pbX, pbY, fillW, pbH, 8);
    ctx.fill();

    // Top sheen — worn leather highlight
    ctx.fillStyle = `rgba(255,240,180,0.10)`;
    roundRectPath(ctx, pbX + 2, pbY + 2, fillW - 4, Math.floor(pbH * 0.35), 6);
    ctx.fill();

    // XP label
    ctx.fillStyle = PARCHMENT_DIM;
    ctx.font = "13px Inter";
    ctx.fillText(`${xpInCurrentLevel.toLocaleString()} / ${xpNeededForNext.toLocaleString()} ${xpText}`, pbX, pbY + pbH + 18);

    // ── TORN PARCHMENT STAT TABS ──────────────────────────────────────────────
    async function drawParchmentTab(
        label: string,
        iconText: string,
        tx: number, ty: number, tw: number
    ) {
        const th = 68;

        // Tab body — very subtle parchment tint
        ctx.fillStyle = "rgba(30,20,10,0.5)";
        roundRectPath(ctx, tx, ty, tw, th, 4);
        ctx.fill();

        // Outer border — stone, not accent
        ctx.strokeStyle = STONE_BORDER;
        ctx.lineWidth = 1.5;
        roundRectPath(ctx, tx, ty, tw, th, 4);
        ctx.stroke();

        // Top strip — like a leather tab label (stone tint)
        ctx.fillStyle = STONE_FAINT;
        ctx.fillRect(tx + 1.5, ty + 1.5, tw - 3, 22);

        // Divider line — stone
        ctx.strokeStyle = STONE_DIM;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(tx + 6, ty + 24); ctx.lineTo(tx + tw - 6, ty + 24); ctx.stroke();

        // Icon label — parchment dim
        ctx.fillStyle = PARCHMENT_DIM;
        ctx.font = "11px InterSemi";
        ctx.textBaseline = "middle";
        await drawTextWithEmojis({ ctx, text: iconText, x: tx + 10, y: ty + 13, emojiSize: 11 });

        // Stat value
        ctx.fillStyle = PARCHMENT;
        ctx.font = "bold 18px InterBold";
        ctx.textBaseline = "alphabetic";
        await drawTextWithEmojis({ ctx, text: label, x: tx + 10, y: ty + 55, emojiSize: 17 });
    }

    const chipY = 248;
    await drawParchmentTab(goldLabel,              `${goldIcon} ${goldText}`,   textX,       chipY, 165);
    await drawParchmentTab(`${streak} days`,        "🔥 Streak",               textX + 180, chipY, 152);
    await drawParchmentTab(totalXp.toLocaleString(),`${xpIcon} Total ${xpText}`,textX + 347, chipY, 175);

    drawQuillRule(92, 50, W - 50);
    drawQuillRule(H - 88, 50, W - 50);

    // ── RIGHT SCROLL PANEL ────────────────────────────────────────────────────
    const rX = 800;
    const rY = 42;
    const rW = W - rX - 36;
    const rH = H - 84;

    // Panel background — deep aged wood
    ctx.fillStyle = "rgba(10,7,3,0.55)";
    roundRectPath(ctx, rX, rY, rW, rH, 6);
    ctx.fill();

    // Panel border — stone
    ctx.strokeStyle = STONE_BORDER;
    ctx.lineWidth = 1.5;
    roundRectPath(ctx, rX, rY, rW, rH, 6);
    ctx.stroke();

    // Inner aged border — stone faint
    ctx.strokeStyle = STONE_FAINT;
    ctx.lineWidth = 1;
    roundRectPath(ctx, rX + 5, rY + 5, rW - 10, rH - 10, 4);
    ctx.stroke();

    // ── "GUILD RECORD" header ────────────────────────────────────────────────
    ctx.fillStyle = PARCHMENT_DIM;
    ctx.font = "10px InterSemi";
    ctx.letterSpacing = "5px";
    ctx.textBaseline = "middle";
    ctx.fillText("GUILD RECORD", rX + rW / 2 - 46, rY + 22);
    ctx.letterSpacing = "0px";

    // Diamond separator — stone lines, accent pip
    const dmX = rX + rW / 2, dmY = rY + 38;
    ctx.fillStyle = ACCENT;        // accent pip — one of the few accent moments
    ctx.beginPath();
    ctx.moveTo(dmX, dmY - 5); ctx.lineTo(dmX + 5, dmY);
    ctx.lineTo(dmX, dmY + 5); ctx.lineTo(dmX - 5, dmY);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = STONE_DIM;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(rX + 20, dmY); ctx.lineTo(dmX - 10, dmY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(dmX + 10, dmY); ctx.lineTo(rX + rW - 20, dmY); ctx.stroke();

    // ── Big level number ──────────────────────────────────────────────────────
    ctx.fillStyle = PARCHMENT;
    ctx.font = "bold 88px InterBold";
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "center";
    ctx.fillText(String(level), rX + rW / 2, rY + 148);

    // Level underline — accent thin line, stone shadow
    const lvlW = ctx.measureText(String(level)).width;
    ctx.fillStyle = ACCENT;
    ctx.fillRect(rX + rW / 2 - lvlW / 2, rY + 154, lvlW, 2);
    ctx.fillStyle = STONE_FAINT;
    ctx.fillRect(rX + rW / 2 - lvlW / 2, rY + 157, lvlW, 1);

    ctx.fillStyle = PARCHMENT_DIM;
    ctx.font = "12px Inter";
    ctx.textBaseline = "middle";
    ctx.fillText("Current Level", rX + rW / 2, rY + 172);

    drawQuillRule(rY + 186, rX + 14, rX + rW - 14, 0.35);

    // ── Mini progress bar in right panel ────────────────────────────────────
    const mpW = rW - 40;
    const mpX = rX + 20;
    const mpY = rY + 202;

    ctx.fillStyle = BLACK_WALNUT;
    roundRectPath(ctx, mpX, mpY, mpW, 8, 4);
    ctx.fill();
    ctx.strokeStyle = STONE_DIM;
    ctx.lineWidth = 1;
    roundRectPath(ctx, mpX, mpY, mpW, 8, 4);
    ctx.stroke();

    const mpFill = Math.max(8, Math.floor(mpW * pct));
    const mpGrad = ctx.createLinearGradient(mpX, 0, mpX + mpW, 0);
    mpGrad.addColorStop(0, `rgba(${ac.r * 0.3 | 0},${ac.g * 0.3 | 0},${ac.b * 0.3 | 0},0.85)`);
    mpGrad.addColorStop(1, ACCENT);
    ctx.fillStyle = mpGrad;
    roundRectPath(ctx, mpX, mpY, mpFill, 8, 4);
    ctx.fill();

    // Pct label — accent
    ctx.fillStyle = ACCENT;
    ctx.font = "bold 15px InterBold";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(pctLabel, rX + rW / 2, mpY + 24);

    ctx.fillStyle = PARCHMENT_DIM;
    ctx.font = "12px Inter";
    ctx.fillText(`to Level ${level + 1}`, rX + rW / 2, mpY + 44);

    drawQuillRule(mpY + 58, rX + 14, rX + rW - 14, 0.3);

    // XP progress label
    ctx.fillStyle = `rgba(${tc.r},${tc.g},${tc.b},0.35)`;
    ctx.font = "11px Inter";
    ctx.fillText(
        `${xpInCurrentLevel.toLocaleString()} / ${xpNeededForNext.toLocaleString()}`,
        rX + rW / 2,
        mpY + 76
    );

    // Reset text align
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    // ── Final buffer ──────────────────────────────────────────────────────────
    const buffer = canvas.toBuffer("image/png");
    return new AttachmentBuilder(buffer, { name: "profile-card-fantasy.png" });
}