import { createCanvas } from "@napi-rs/canvas";
import { registerCardFonts } from "./fonts.js";
import { emojiImageUrl, loadCachedImage } from "./drawEmojis.js";
import { GOLD, PARCHMENT, RED, drawPanelFrame, roundRectPath } from "./theme.js";
import type { DigLook } from "../../types/gathering.js";

/**
 * The dig game's rock face, drawn in chunky pixels: the tunnel mouth on the
 * left, a 5×4 face of rock, ore showing through where your light reaches, and
 * you standing in what you've dug out. Ore takes its colour from its item's
 * emoji, so any item, in any theme, shows up as its own kind of ore.
 */

const COLS = 5;
const ROWS = 4;
const CELL = 76;
const MOUTH_W = 92;
const PAD = 12;
const PX = 4;
const W = PAD * 2 + MOUTH_W + COLS * CELL;
const H = PAD * 2 + ROWS * CELL;
const SCALE = 2;

export type SceneCell = {
    kind: "rock" | "hard" | "loose" | "ore" | "open";
    hp: number;
    max: number;
    /** In the light: drawn as it is. */
    seen: boolean;
    /** At the light's edge: a shape in the dark, ore still hidden. */
    dim: boolean;
    emoji?: string | undefined;
};

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
};

/** A small seeded generator, so a block keeps its look between swings. */
function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

type RGB = [number, number, number];
const hex = ([r, g, b]: RGB) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
const shade = ([r, g, b]: RGB, f: number): RGB => [Math.min(255, r * f), Math.min(255, g * f), Math.min(255, b * f)];

/** A look's colours: the rock and its kinds, the back wall, unlit rock, the mouth's sky and props, and the light. */
type Look = { rock: RGB; hard: RGB; vein: RGB; loose: RGB; back: RGB; dark: RGB; sky: [string, string, string]; prop: RGB; light: RGB };

/** The same rock face in other settings, picked per activity. Ore colours still come from each item's emoji. */
export const LOOKS: Record<DigLook, Look> = {
    mine: { rock: [92, 82, 72], hard: [58, 54, 52], vein: [120, 116, 112], loose: [112, 98, 82], back: [38, 32, 27], dark: [14, 11, 9], sky: ["#3b4452", "#2a2620", "#18130e"], prop: [96, 66, 38], light: [255, 180, 90] },
    ice: { rock: [116, 146, 168], hard: [74, 96, 122], vein: [196, 226, 240], loose: [150, 180, 198], back: [28, 38, 52], dark: [8, 12, 18], sky: ["#4a5f78", "#2a3646", "#141b24"], prop: [92, 112, 132], light: [170, 220, 255] },
    sand: { rock: [168, 138, 94], hard: [128, 100, 66], vein: [206, 184, 140], loose: [196, 166, 116], back: [64, 48, 30], dark: [20, 15, 10], sky: ["#7a6a52", "#4a3a26", "#241a10"], prop: [110, 78, 44], light: [255, 200, 120] },
    metal: { rock: [92, 100, 108], hard: [58, 64, 72], vein: [150, 160, 170], loose: [132, 100, 72], back: [26, 30, 36], dark: [8, 10, 12], sky: ["#1e2a36", "#141a22", "#0a0d12"], prop: [76, 84, 92], light: [150, 255, 210] },
    soil: { rock: [104, 74, 50], hard: [74, 56, 44], vein: [138, 110, 80], loose: [134, 98, 64], back: [40, 28, 20], dark: [12, 8, 6], sky: ["#3e4a3a", "#2a2a1e", "#16120c"], prop: [96, 66, 38], light: [255, 190, 110] },
};

const oreColours = new Map<string, RGB>();
/** An emoji's main colour: the average of its solid pixels, brightened a little so it reads on rock. */
async function oreColour(emoji: string | undefined): Promise<RGB> {
    const fallback: RGB = [214, 178, 92];
    if (!emoji) return fallback;
    const hit = oreColours.get(emoji);
    if (hit) return hit;
    const url = emojiImageUrl(emoji);
    const img = url ? await loadCachedImage(url).catch(() => null) : null;
    let colour = fallback;
    if (img) {
        const c = createCanvas(16, 16);
        const x = c.getContext("2d");
        x.drawImage(img, 0, 0, 16, 16);
        const d = x.getImageData(0, 0, 16, 16).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3]! < 160) continue;
            r += d[i]!; g += d[i + 1]!; b += d[i + 2]!; n++;
        }
        if (n) {
            colour = [r / n, g / n, b / n];
            const max = Math.max(...colour);
            if (max < 170) colour = shade(colour, 170 / Math.max(1, max));
        }
    }
    oreColours.set(emoji, colour);
    return colour;
}

const cellXY = (i: number) => ({ x: PAD + MOUTH_W + (i % COLS) * CELL, y: PAD + Math.floor(i / COLS) * CELL });

/** A block's surface: square pixels around a base colour, a lit top-left edge and a dark bottom-right one. */
function texture(ctx: any, x: number, y: number, base: RGB, seed: number, spread = 0.16) {
    const r = rng(seed);
    const n = CELL / PX;
    for (let py = 0; py < n; py++) {
        for (let px = 0; px < n; px++) {
            let f = 1 + (Math.round((r() - 0.5) * 4) / 4) * spread * 2;
            if (px === 0 || py === 0) f *= 1.18;
            if (px === n - 1 || py === n - 1) f *= 0.72;
            ctx.fillStyle = hex(shade(base, f));
            ctx.fillRect(x + px * PX, y + py * PX, PX, PX);
        }
    }
}

function drawRock(ctx: any, L: Look, x: number, y: number, seed: number) {
    texture(ctx, x, y, L.rock, seed);
    // A few darker pits, so it reads as stone and not as noise.
    const r = rng(seed * 7 + 3);
    for (let k = 0; k < 5; k++) {
        const px = 1 + Math.floor(r() * (CELL / PX - 3)), py = 1 + Math.floor(r() * (CELL / PX - 3));
        ctx.fillStyle = hex(shade(L.rock, 0.68));
        ctx.fillRect(x + px * PX, y + py * PX, PX * 2, PX);
    }
}

function drawHard(ctx: any, L: Look, x: number, y: number, seed: number) {
    texture(ctx, x, y, L.hard, seed, 0.1);
    // Pale veins: harder stone.
    const r = rng(seed * 13 + 1);
    ctx.fillStyle = hex(L.vein);
    for (let k = 0; k < 2; k++) {
        let px = Math.floor(r() * 10) + 2, py = 1;
        while (py < CELL / PX - 1) {
            ctx.fillRect(x + px * PX, y + py * PX, PX, PX);
            py++;
            px += Math.floor(r() * 3) - 1;
            px = Math.max(1, Math.min(CELL / PX - 2, px));
        }
    }
}

function drawLoose(ctx: any, L: Look, x: number, y: number, seed: number) {
    ctx.fillStyle = hex(shade(L.loose, 0.35));
    ctx.fillRect(x, y, CELL, CELL);
    const r = rng(seed * 11 + 5);
    // Rubble: rounded boulders of different sizes piled with gaps between.
    const n = CELL / PX;
    for (let k = 0; k < 9; k++) {
        const rad = 2 + Math.floor(r() * 3);
        const cx = 2 + Math.floor(r() * (n - 4)), cy = 2 + Math.floor(r() * (n - 4));
        const f = 0.75 + r() * 0.45;
        for (let py = -rad; py <= rad; py++) {
            for (let px = -rad; px <= rad; px++) {
                if (px * px + py * py > rad * rad + 1) continue;
                const gx = cx + px, gy = cy + py;
                if (gx < 0 || gy < 0 || gx >= n || gy >= n) continue;
                // Lit from the top left: a bright rim up there, shadow down here.
                const lightF = px + py < -rad ? 1.3 : px + py > rad ? 0.62 : 1;
                ctx.fillStyle = hex(shade(L.loose, f * lightF));
                ctx.fillRect(x + gx * PX, y + gy * PX, PX, PX);
            }
        }
    }
}

function drawOre(ctx: any, L: Look, x: number, y: number, seed: number, colour: RGB) {
    drawRock(ctx, L, x, y, seed);
    const r = rng(seed * 17 + 9);
    // Clumps of ore showing through, each with a glint.
    for (let k = 0; k < 6; k++) {
        const cx = 2 + Math.floor(r() * 13), cy = 2 + Math.floor(r() * 13);
        for (let p = 0; p < 4; p++) {
            const px = cx + Math.floor(r() * 3), py = cy + Math.floor(r() * 3);
            ctx.fillStyle = hex(shade(colour, 0.75 + r() * 0.35));
            ctx.fillRect(x + px * PX, y + py * PX, PX, PX);
        }
        ctx.fillStyle = hex(shade(colour, 1.5));
        ctx.fillRect(x + cx * PX, y + cy * PX, PX, PX);
    }
}

/** Open space: the back wall, darker, with a ledge where there's rock below. */
function drawOpen(ctx: any, L: Look, x: number, y: number, seed: number, floor: boolean) {
    texture(ctx, x, y, L.back, seed, 0.12);
    if (floor) {
        ctx.fillStyle = hex(shade(L.rock, 0.55));
        ctx.fillRect(x, y + CELL - PX * 2, CELL, PX * 2);
    }
}

/** Cracks spreading from the middle as a block wears down. */
function drawCracks(ctx: any, x: number, y: number, seed: number, worn: number) {
    if (worn <= 0) return;
    const r = rng(seed * 31 + 7);
    const lines = Math.ceil(worn * 4);
    ctx.fillStyle = "rgba(14,10,8,0.9)";
    for (let k = 0; k < lines; k++) {
        let px = CELL / PX / 2, py = CELL / PX / 2;
        const dx = r() < 0.5 ? -1 : 1, dy = r() < 0.5 ? -1 : 1;
        const len = 3 + Math.floor(worn * 6);
        for (let s = 0; s < len; s++) {
            ctx.fillRect(x + Math.floor(px) * PX, y + Math.floor(py) * PX, PX, PX);
            if (r() < 0.5) px += dx; else py += dy;
        }
    }
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

function drawMouth(ctx: any, L: Look) {
    const x = PAD, y = PAD, h = ROWS * CELL;
    const sky = ctx.createLinearGradient(0, y, 0, y + h);
    sky.addColorStop(0, L.sky[0]);
    sky.addColorStop(0.55, L.sky[1]);
    sky.addColorStop(1, L.sky[2]);
    ctx.fillStyle = sky;
    ctx.fillRect(x, y, MOUTH_W, h);
    // The ground outside, and the rock over the mouth.
    texture(ctx, x, y + h - CELL / 2, shade(L.rock, 0.7), 991, 0.1);
    // Over the mouth, the hillside the face is cut into: a dark slope rising toward the face,
    // shaped unlike the blocks so it doesn't read as something to dig.
    const top = y + (ROWS - 2) * CELL;
    for (let gx = 0; gx < MOUTH_W; gx += PX) {
        const hill = y + Math.round(((1 - gx / MOUTH_W) * (top - y) * 0.75) / PX) * PX;
        ctx.fillStyle = hex(shade(L.rock, 0.42));
        ctx.fillRect(x + gx, hill, PX, top - hill);
        ctx.fillStyle = hex(shade(L.rock, 0.62));
        ctx.fillRect(x + gx, hill, PX, PX);
    }
    // Timber props holding up the mouth.
    const wood = L.prop;
    for (const bx of [x + 6, x + MOUTH_W - 14]) {
        for (let py = top; py < y + h - CELL / 2; py += PX) {
            ctx.fillStyle = hex(shade(wood, py % (PX * 3) === 0 ? 0.8 : 1));
            ctx.fillRect(bx, py, PX * 2, PX);
        }
    }
    ctx.fillStyle = hex(wood);
    ctx.fillRect(x, top, MOUTH_W, PX * 2);
    ctx.fillStyle = hex(shade(wood, 0.7));
    ctx.fillRect(x, top + PX * 2, MOUTH_W, PX);
    // Where the face begins: a shadow line, so the mouth reads as outside the grid.
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x + MOUTH_W - PX, y, PX, top - y);
}

export async function renderDigScene(args: DigSceneArgs): Promise<Buffer> {
    registerCardFonts();
    const canvas = createCanvas(W * SCALE, H * SCALE);
    const ctx = canvas.getContext("2d") as any;
    ctx.scale(SCALE, SCALE);
    ctx.imageSmoothingEnabled = false;
    drawPanelFrame(ctx, W, H);
    ctx.save();
    roundRectPath(ctx, PAD, PAD, W - PAD * 2, H - PAD * 2, 3);
    ctx.clip();
    const L = LOOKS[args.look ?? "mine"] ?? LOOKS.mine;
    drawMouth(ctx, L);

    for (const [i, cell] of args.cells.entries()) {
        const { x, y } = cellXY(i);
        const seed = i * 101 + 17;
        if (!cell.seen && !cell.dim) {
            texture(ctx, x, y, L.dark, seed, 0.25);
            continue;
        }
        const below = args.cells[i + COLS];
        if (cell.kind === "open") drawOpen(ctx, L, x, y, seed, !below || below.kind !== "open");
        else if (cell.kind === "hard") drawHard(ctx, L, x, y, seed);
        else if (cell.kind === "loose") drawLoose(ctx, L, x, y, seed);
        // Ore at the light's edge looks like any other rock.
        else if (cell.kind === "ore" && cell.seen) drawOre(ctx, L, x, y, seed, await oreColour(cell.emoji));
        else drawRock(ctx, L, x, y, seed);
        if (cell.kind !== "open" && cell.max > 0) drawCracks(ctx, x, y, seed, 1 - cell.hp / cell.max);
        if (cell.dim) {
            ctx.fillStyle = "rgba(10,8,6,0.74)";
            ctx.fillRect(x, y, CELL, CELL);
        }
    }

    // The lantern: light around you in pixel steps, falling off into the dark.
    // Stepped rather than a smooth gradient: it matches the pixel art and halves the PNG.
    const at = args.pos >= 0 ? cellXY(args.pos) : { x: PAD + MOUTH_W - CELL, y: PAD + (ROWS - 1) * CELL };
    const px = args.pos >= 0 ? at.x + CELL / 2 : PAD + MOUTH_W / 2 + 6;
    const py = at.y + CELL / 2 + 6;
    ctx.globalCompositeOperation = "lighter";
    const [lr, lg, lb] = L.light;
    for (let gy = PAD; gy < H - PAD; gy += PX * 2) {
        for (let gx = PAD; gx < W - PAD; gx += PX * 2) {
            const d = Math.hypot(gx + PX - px, gy + PX - py) / (CELL * 2.2);
            if (d >= 1) continue;
            ctx.fillStyle = `rgba(${lr},${lg},${lb},${(0.26 * Math.round((1 - d) * 4) / 4).toFixed(3)})`;
            ctx.fillRect(gx, gy, PX * 2, PX * 2);
        }
    }
    ctx.globalCompositeOperation = "source-over";

    // You.
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath(); ctx.ellipse(px, at.y + CELL - 9, 20, 5, 0, 0, Math.PI * 2); ctx.fill();
    const face = args.avatarUrl ? await loadCachedImage(args.avatarUrl).catch(() => null) : null;
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, 19, 0, Math.PI * 2);
    ctx.fillStyle = "#2a2118";
    ctx.fill();
    if (face) {
        ctx.clip();
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(face, px - 19, py - 19, 38, 38);
        ctx.imageSmoothingEnabled = false;
    }
    ctx.restore();
    ctx.strokeStyle = "#8A7A62";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, 20, 0, Math.PI * 2); ctx.stroke();
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
