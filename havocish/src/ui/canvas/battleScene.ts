import { createCanvas } from "@napi-rs/canvas";
import { registerCardFonts } from "./fonts.js";
import { drawTextWithEmojis, emojiImageUrl, loadCachedImage } from "./drawEmojis.js";
import { PARCHMENT, PARCHMENT_DIM, RED, STONE_BORDER, drawPanelFrame, roundRectPath } from "./theme.js";

/**
 * A fight drawn as a scene, from what every server already has: the enemy's
 * emoji (a server's own custom emoji too) as its sprite, each player's avatar,
 * and the place's colour and emoji as the backdrop. No art is bundled, so any
 * theme works on day one; owners can still give an enemy or a place an image.
 * Laid out like a classic handheld battle: the enemy top right, you bottom left.
 */

const W = 640;
const H = 300;
const SCALE = 2;
const FLOOR = 186;

export type SceneMember = { name: string; avatarUrl?: string; hp: number; maxHp: number; down?: boolean; targeted?: boolean; hit?: number };

export type SceneArgs = {
    place?: { emoji?: string; colour?: string; image?: string } | null;
    enemy: { name: string; emoji: string; image?: string; hp: number; maxHp: number; hit?: number };
    members: SceneMember[];
    /** The warning line along the bottom: what the enemy does next. */
    intent: string;
    danger?: boolean;
};

function hpBar(ctx: any, x: number, y: number, w: number, hp: number, max: number) {
    const pct = Math.max(0, Math.min(1, hp / Math.max(1, max)));
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x, y, w, 8);
    ctx.fillStyle = pct > 0.5 ? "#8fbf72" : pct > 0.2 ? "#d9b54a" : RED;
    ctx.fillRect(x + 1, y + 1, Math.round((w - 2) * pct), 6);
    ctx.strokeStyle = STONE_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 7);
}

function fit(ctx: any, text: string, max: number): string {
    if (ctx.measureText(text).width <= max) return text;
    const chars = [...text];
    while (chars.length > 1 && ctx.measureText(chars.join("") + "…").width > max) chars.pop();
    return chars.join("") + "…";
}

/** A name plate with an HP bar. */
function plate(ctx: any, x: number, y: number, w: number, who: { name: string; hp: number; maxHp: number }) {
    ctx.fillStyle = "rgba(10,8,6,0.8)";
    roundRectPath(ctx, x, y, w, 46, 4);
    ctx.fill();
    ctx.strokeStyle = STONE_BORDER;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = "10px InterSemi";
    const numbers = `${who.hp}/${who.maxHp}`;
    const numbersWidth = ctx.measureText(numbers).width;
    ctx.fillStyle = PARCHMENT_DIM;
    ctx.textAlign = "right";
    ctx.fillText(numbers, x + w - 10, y + 33);
    ctx.fillStyle = PARCHMENT;
    ctx.font = "13px InterBold";
    ctx.textAlign = "left";
    ctx.fillText(fit(ctx, who.name, w - 20), x + 10, y + 18);
    hpBar(ctx, x + 10, y + 26, w - 28 - numbersWidth, who.hp, who.maxHp);
}

async function image(url: string | null | undefined) {
    return url ? loadCachedImage(url).catch(() => null) : null;
}

/** An avatar in a stone ring; cached, so redrawing every turn costs no fetch. */
async function portrait(ctx: any, url: string | undefined, cx: number, cy: number, r: number, faded: boolean) {
    const img = await image(url);
    ctx.save();
    if (faded) ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#2a2118";
    ctx.fill();
    if (img) {
        ctx.clip();
        const s = Math.max((r * 2) / img.width, (r * 2) / img.height);
        ctx.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s);
    }
    ctx.restore();
    ctx.strokeStyle = faded ? "rgba(138,122,98,0.4)" : STONE_BORDER;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
    ctx.stroke();
}

function damage(ctx: any, n: number | undefined, x: number, y: number) {
    if (!n || n <= 0) return;
    ctx.font = "26px InterBold";
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#0d0a06";
    ctx.fillStyle = "#e0705e";
    ctx.strokeText(`-${n}`, x, y);
    ctx.fillText(`-${n}`, x, y);
}

export async function renderBattleScene(args: SceneArgs): Promise<Buffer> {
    registerCardFonts();
    const canvas = createCanvas(W * SCALE, H * SCALE);
    const ctx = canvas.getContext("2d") as any;
    ctx.scale(SCALE, SCALE);
    drawPanelFrame(ctx, W, H);

    // The backdrop: the place's image, or its colour as a sky with its emoji as a faint pattern.
    const inner = { x: 12, y: 12, w: W - 24, h: H - 24 };
    ctx.save();
    roundRectPath(ctx, inner.x, inner.y, inner.w, inner.h, 4);
    ctx.clip();
    const backdrop = await image(args.place?.image);
    if (backdrop) {
        const s = Math.max(inner.w / backdrop.width, inner.h / backdrop.height);
        ctx.drawImage(backdrop, inner.x + (inner.w - backdrop.width * s) / 2, inner.y + (inner.h - backdrop.height * s) / 2, backdrop.width * s, backdrop.height * s);
        ctx.fillStyle = "rgba(10,8,6,0.35)";
        ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    } else {
        const sky = ctx.createLinearGradient(0, inner.y, 0, inner.y + inner.h);
        sky.addColorStop(0, args.place?.colour || "#2f4a3a");
        sky.addColorStop(0.62, "#14100a");
        sky.addColorStop(1, "#0d0a06");
        ctx.fillStyle = sky;
        ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
        const motif = await image(args.place?.emoji ? emojiImageUrl(args.place.emoji) : null);
        if (motif) {
            ctx.globalAlpha = 0.07;
            for (let row = 0, y = inner.y - 10; y < FLOOR - 30; row++, y += 46) {
                for (let x = inner.x + (row % 2) * 23 - 10; x < inner.x + inner.w; x += 46) ctx.drawImage(motif, x, y, 28, 28);
            }
            ctx.globalAlpha = 1;
        }
    }
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(inner.x, FLOOR, inner.w, 2);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath(); ctx.ellipse(470, 176, 62, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // The enemy: its image, or its emoji drawn big and crisp like a sprite.
    const sprite = await image(args.enemy.image || emojiImageUrl(args.enemy.emoji));
    if (sprite) {
        ctx.imageSmoothingEnabled = !!args.enemy.image;
        const s = Math.min(120 / sprite.width, 120 / sprite.height);
        ctx.drawImage(sprite, 470 - (sprite.width * s) / 2, 172 - sprite.height * s, sprite.width * s, sprite.height * s);
        ctx.imageSmoothingEnabled = true;
    }
    plate(ctx, 30, 26, 220, args.enemy);
    damage(ctx, args.enemy.hit, 556, 76);

    // The players. Alone: a big portrait and a plate, bottom right. In a party: a row
    // of portraits, each with its own small bar; the enemy's target is marked.
    const members = args.members.slice(0, 5);
    if (members.length <= 1) {
        const m = members[0]!;
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.beginPath(); ctx.ellipse(150, 226, 50, 10, 0, 0, Math.PI * 2); ctx.fill();
        await portrait(ctx, m.avatarUrl, 150, 180, 40, !!m.down);
        plate(ctx, 410, 186, 200, m);
        damage(ctx, m.hit, 205, 140);
    } else {
        const gap = Math.min(110, 360 / members.length);
        for (const [i, m] of members.entries()) {
            const cx = 80 + i * gap;
            await portrait(ctx, m.avatarUrl, cx, 168, 28, !!m.down);
            if (m.targeted && !m.down) {
                ctx.fillStyle = RED;
                ctx.beginPath(); ctx.moveTo(cx - 7, 124); ctx.lineTo(cx + 7, 124); ctx.lineTo(cx, 133); ctx.closePath(); ctx.fill();
            }
            ctx.font = "11px InterBold";
            ctx.textAlign = "center";
            ctx.fillStyle = m.down ? PARCHMENT_DIM : PARCHMENT;
            ctx.fillText(fit(ctx, m.name, gap - 10), cx, 212);
            hpBar(ctx, cx - 34, 218, 68, m.hp, m.maxHp);
            damage(ctx, m.hit, cx + 44, 162);
        }
    }

    // The warning line: the one thing to read before choosing.
    ctx.fillStyle = "rgba(10,8,6,0.85)";
    roundRectPath(ctx, 24, 240, W - 48, 36, 4);
    ctx.fill();
    ctx.strokeStyle = args.danger ? RED : STONE_BORDER;
    ctx.lineWidth = args.danger ? 2 : 1;
    ctx.stroke();
    ctx.fillStyle = args.danger ? "#f0c0b0" : PARCHMENT;
    ctx.font = "14px InterSemi";
    ctx.textAlign = "left";
    await drawTextWithEmojis({ ctx, text: args.intent, x: 36, y: 263, emojiSize: 16 }).catch(() => ctx.fillText(args.intent, 36, 263));

    return canvas.toBuffer("image/png");
}
