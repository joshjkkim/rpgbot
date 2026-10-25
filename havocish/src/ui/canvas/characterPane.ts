import { createCanvas } from "@napi-rs/canvas";
import { registerCardFonts } from "./fonts.js";
import { emojiImageUrl, loadCachedImage } from "./drawEmojis.js";
import { GOLD, PARCHMENT, PARCHMENT_DIM, RARITY_COLOURS, RED, STONE_BORDER, STONE_DIM, drawPanelFrame, roundRectPath } from "./theme.js";

/**
 * /me's character pane, drawn like the classic RPG paper doll: the member's
 * avatar in the middle, their gear in slots down both sides (each item's emoji
 * in its rarity's colour), and Combat level, HP and XP underneath. The details
 * (stats, skills, moves) stay as text below it, where they're easy to read.
 */

const W = 600;
const H = 300;
const SCALE = 2;
const SLOT = 44;

export type PaneSlot = { label: string; emoji?: string | null; rarity?: keyof typeof RARITY_COLOURS | null; /** Upgrade level, shown as a +N badge. */ plus?: number };

export type PaneArgs = {
    name: string;
    title?: string | null;
    avatarUrl?: string;
    combatLevel: number;
    /** Share of the way to the next Combat level, 0–1; null at the cap. */
    xp: number | null;
    hp: number;
    maxHp: number;
    /** A status shown on the portrait, like Wounded. */
    status?: string | null;
    /** Down the left, then down the right. */
    left: PaneSlot[];
    right: PaneSlot[];
};

async function image(url: string | null | undefined) {
    return url ? loadCachedImage(url).catch(() => null) : null;
}

function fit(ctx: any, text: string, max: number): string {
    if (ctx.measureText(text).width <= max) return text;
    const chars = [...text];
    while (chars.length > 1 && ctx.measureText(chars.join("") + "…").width > max) chars.pop();
    return chars.join("") + "…";
}

/** One gear slot: the item's emoji in a frame of its rarity, or a dim empty socket. */
async function slot(ctx: any, x: number, y: number, s: PaneSlot) {
    const colour = s.emoji ? RARITY_COLOURS[s.rarity ?? "common"] : STONE_DIM;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    roundRectPath(ctx, x, y, SLOT, SLOT, 4);
    ctx.fill();
    ctx.strokeStyle = colour;
    ctx.lineWidth = s.emoji ? 2 : 1;
    ctx.stroke();
    const icon = s.emoji ? await image(emojiImageUrl(s.emoji)) : null;
    if (icon) {
        ctx.drawImage(icon, x + 8, y + 8, SLOT - 16, SLOT - 16);
        if (s.plus) {
            ctx.font = "10px InterBold";
            ctx.textAlign = "right";
            ctx.lineWidth = 3;
            ctx.strokeStyle = "rgba(0,0,0,0.9)";
            ctx.strokeText(`+${s.plus}`, x + SLOT - 3, y + SLOT - 4);
            ctx.fillStyle = GOLD;
            ctx.fillText(`+${s.plus}`, x + SLOT - 3, y + SLOT - 4);
        }
    } else {
        ctx.font = "9px Inter";
        ctx.fillStyle = PARCHMENT_DIM;
        ctx.textAlign = "center";
        ctx.fillText(s.label, x + SLOT / 2, y + SLOT / 2 + 3);
    }
}

function bar(ctx: any, x: number, y: number, w: number, pct: number, colour: string, label: string) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x, y, w, 12);
    ctx.fillStyle = colour;
    ctx.fillRect(x + 1, y + 1, Math.round((w - 2) * Math.max(0, Math.min(1, pct))), 10);
    ctx.strokeStyle = STONE_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 11);
    ctx.font = "9px InterSemi";
    ctx.textAlign = "center";
    // Outlined, so it reads over the fill and the dark part alike.
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(label, x + w / 2, y + 9.5);
    ctx.fillStyle = PARCHMENT;
    ctx.fillText(label, x + w / 2, y + 9.5);
}

export async function renderCharacterPane(args: PaneArgs): Promise<Buffer> {
    registerCardFonts();
    const canvas = createCanvas(W * SCALE, H * SCALE);
    const ctx = canvas.getContext("2d") as any;
    ctx.scale(SCALE, SCALE);
    drawPanelFrame(ctx, W, H);

    // Gear down both sides, like the classic paper doll.
    const column = (n: number) => (H - n * SLOT - (n - 1) * 8) / 2;
    for (const [i, s] of args.left.entries()) await slot(ctx, 30, column(args.left.length) + i * (SLOT + 8), s);
    for (const [i, s] of args.right.entries()) await slot(ctx, W - 30 - SLOT, column(args.right.length) + i * (SLOT + 8), s);

    // Name and title across the top.
    const cx = W / 2;
    ctx.textAlign = "center";
    ctx.font = "18px InterBold";
    ctx.fillStyle = PARCHMENT;
    ctx.fillText(fit(ctx, args.name, 340), cx, 44);
    if (args.title) {
        ctx.font = "12px Inter";
        ctx.fillStyle = GOLD;
        ctx.fillText(fit(ctx, args.title, 340), cx, 62);
    }

    // The portrait, in a stone ring.
    const cy = 138;
    const r = 56;
    const avatar = await image(args.avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#2a2118";
    ctx.fill();
    if (avatar) {
        ctx.clip();
        const s = Math.max((r * 2) / avatar.width, (r * 2) / avatar.height);
        ctx.drawImage(avatar, cx - (avatar.width * s) / 2, cy - (avatar.height * s) / 2, avatar.width * s, avatar.height * s);
    }
    ctx.restore();
    ctx.strokeStyle = args.status ? RED : STONE_BORDER;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
    ctx.stroke();
    const statusIcon = args.status ? await image(emojiImageUrl(args.status)) : null;
    if (statusIcon) ctx.drawImage(statusIcon, cx + r - 18, cy - r - 4, 26, 26);

    // Level and bars underneath.
    ctx.font = "14px InterBold";
    ctx.fillStyle = PARCHMENT;
    ctx.textAlign = "center";
    ctx.fillText(`Combat ${args.combatLevel}`, cx, 222);
    const hpPct = args.hp / Math.max(1, args.maxHp);
    bar(ctx, cx - 110, 234, 220, hpPct, hpPct > 0.5 ? "#8fbf72" : hpPct > 0.2 ? "#d9b54a" : RED, `HP ${args.hp} / ${args.maxHp}`);
    bar(ctx, cx - 110, 252, 220, args.xp ?? 1, "#6c95d0", args.xp == null ? "Max level" : `${Math.floor((args.xp ?? 0) * 100)}% to Combat ${args.combatLevel + 1}`);

    return canvas.toBuffer("image/png");
}
