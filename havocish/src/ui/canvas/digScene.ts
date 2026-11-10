import { createCanvas } from "@napi-rs/canvas";
import { registerCardFonts } from "./fonts.js";
import { emojiImageUrl, loadCachedImage } from "./drawEmojis.js";
import { GOLD, PARCHMENT, RED, drawPanelFrame, roundRectPath } from "./theme.js";
import type { DigColours, DigLook } from "../../content/digLooks.js";
import { CELL, H, ORE_FALLBACK, PAD, PX, W, averageColour, cellXY, drawFace, drawPlayer, hex, lookOf, rng, shade, type FaceCell, type RGB } from "../../content/digDraw.js";

/**
 * The dig game's picture for Discord: the rock face (content/digDraw.ts, the
 * same drawing the dashboard previews) plus what needs the server: ore colours
 * read from each item's emoji, your avatar, your tool and what the last swing did.
 */

const SCALE = 2;

export type SceneCell = Omit<FaceCell, "ore"> & { emoji?: string | undefined };

export type DigSceneArgs = {
    cells: SceneCell[];
    /** The block you stand in, or -1 at the mouth. */
    pos: number;
    last: { at: number; damage: number; broke: boolean; clean: boolean; got?: { quantity: number }; fell?: number; emoji?: string | undefined } | null;
    avatarUrl?: string | undefined;
    /** The tool's emoji, drawn in your hand. */
    tool?: string;
    /** The setting it's drawn in; a mine when unset. */
    look?: DigLook | undefined;
    /** Colours set over the look's. */
    colours?: Partial<DigColours> | undefined;
};

const oreColours = new Map<string, RGB>();
/** An emoji's main colour, so any item, in any theme, shows up as its own kind of ore. */
async function oreColour(emoji: string | undefined): Promise<RGB> {
    if (!emoji) return ORE_FALLBACK;
    const hit = oreColours.get(emoji);
    if (hit) return hit;
    const url = emojiImageUrl(emoji);
    const img = url ? await loadCachedImage(url).catch(() => null) : null;
    let colour = ORE_FALLBACK;
    if (img) {
        const c = createCanvas(16, 16);
        const x = c.getContext("2d");
        x.drawImage(img, 0, 0, 16, 16);
        colour = averageColour(x.getImageData(0, 0, 16, 16).data);
    }
    oreColours.set(emoji, colour);
    return colour;
}

async function emoji(ctx: any, e: string | undefined, cx: number, cy: number, size: number) {
    const url = e ? emojiImageUrl(e) : null;
    const img = url ? await loadCachedImage(url).catch(() => null) : null;
    if (img) ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
    return !!img;
}

function label(ctx: any, text: string, x: number, y: number, colour: string, size = 18) {
    ctx.font = `${size}px InterBold`;
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#0d0a06";
    ctx.fillStyle = colour;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
}

export async function renderDigScene(args: DigSceneArgs): Promise<Buffer> {
    registerCardFonts();
    // Everything fetched first, so the drawing itself runs straight through.
    const cells: FaceCell[] = await Promise.all(args.cells.map(async ({ emoji, ...cell }) => ({
        ...cell, ...(cell.kind === "ore" && cell.seen && { ore: await oreColour(emoji) }),
    })));
    const face = args.avatarUrl ? await loadCachedImage(args.avatarUrl).catch(() => null) : null;

    const canvas = createCanvas(W * SCALE, H * SCALE);
    const ctx = canvas.getContext("2d") as any;
    ctx.scale(SCALE, SCALE);
    drawPanelFrame(ctx, W, H);
    ctx.save();
    roundRectPath(ctx, PAD, PAD, W - PAD * 2, H - PAD * 2, 3);
    ctx.clip();
    const L = lookOf(args.look, args.colours);
    const { at, px, py } = drawFace(ctx, L, cells, args.pos);
    drawPlayer(ctx, at, px, py, face);

    // The tool, raised toward the block you just swung at.
    ctx.save();
    const swungAt = args.last && args.last.at !== args.pos ? cellXY(args.last.at) : null;
    const facing = swungAt ? Math.sign(swungAt.x - at.x) || 1 : 1;
    ctx.translate(px + 20 * facing, py - 14);
    ctx.rotate(swungAt ? -0.5 * facing : 0.25);
    ctx.scale(facing, 1);
    await emoji(ctx, args.tool, 0, 0, 26);
    ctx.restore();

    // What the last swing did.
    const last = args.last;
    if (last) {
        const c = cellXY(last.at);
        const cx = c.x + CELL / 2, cy = c.y + CELL / 2;
        if (last.got) {
            // Held up over your head: you step into the block you broke.
            const gy = Math.max(PAD + 20, py - 42);
            ctx.fillStyle = "rgba(255,220,140,0.22)";
            ctx.beginPath(); ctx.arc(px, gy, 22, 0, Math.PI * 2); ctx.fill();
            await emoji(ctx, last.emoji, px, gy, 30);
            label(ctx, `+${last.got.quantity}`, px + 26, gy + 12, PARCHMENT, 16);
        } else if (!last.broke) {
            // Chips flying off.
            const r = rng(last.at * 7 + last.damage);
            ctx.fillStyle = hex(shade(L.rock, 1.3));
            for (let k = 0; k < 6; k++) ctx.fillRect(cx + (r() - 0.5) * 50, cy + (r() - 0.5) * 50, PX, PX);
            label(ctx, `−${last.damage}${last.clean ? "!" : ""}`, cx, c.y + 22, last.clean ? GOLD : PARCHMENT);
        }
        if (last.fell) label(ctx, `−${last.fell}`, px, at.y + 16, RED, 20);
    }
    ctx.restore();
    return canvas.toBuffer("image/png");
}
