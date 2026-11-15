import { gridPalette } from "./gridLooks.ts";
import type { GridImages } from "./gridLooks.ts";

/**
 * Grid's rock face, drawn in chunky pixels onto any 2D canvas: the bot's (for
 * the picture in Discord) and the browser's (the dashboard's live preview), so
 * both show the same thing. The tunnel mouth on the left, a 5×4 face, ore
 * showing where the light reaches, and the lantern's light around the player.
 * The bot adds what needs the server: the avatar, the tool and the labels.
 */

export const COLS = 5;
export const ROWS = 4;
export const CELL = 76;
export const MOUTH_W = 92;
export const PAD = 12;
export const PX = 4;
export const W = PAD * 2 + MOUTH_W + COLS * CELL;
export const H = PAD * 2 + ROWS * CELL;

export type RGB = [number, number, number];

export type FaceCell = {
    kind: "rock" | "hard" | "loose" | "ore" | "open";
    hp: number;
    max: number;
    /** In the light: drawn as it is. */
    seen: boolean;
    /** At the light's edge: a shape in the dark, ore still hidden. */
    dim: boolean;
    /** The ore's colour, from its item's emoji. */
    ore?: RGB | undefined;
};

/** A small seeded generator, so a block keeps its look between swings. */
export function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const hex = ([r, g, b]: RGB) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
export const shade = ([r, g, b]: RGB, f: number): RGB => [Math.min(255, r * f), Math.min(255, g * f), Math.min(255, b * f)];
const rgb = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;

/** Used when an ore's emoji can't be read. */
export const ORE_FALLBACK: RGB = [214, 178, 92];

/** An emoji drawn small, as its main colour: the average of its solid pixels, brightened a little so it reads on rock. */
export function averageColour(data: ArrayLike<number>): RGB {
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]! < 160) continue;
        r += data[i]!; g += data[i + 1]!; b += data[i + 2]!; n++;
    }
    if (!n) return ORE_FALLBACK;
    const colour: RGB = [r / n, g / n, b / n];
    const max = Math.max(...colour);
    return max < 170 ? shade(colour, 170 / Math.max(1, max)) : colour;
}

/** A palette as the drawing uses it: RGB, except the sky's gradient stops. */
export type Look = { rock: RGB; hard: RGB; vein: RGB; loose: RGB; back: RGB; dark: RGB; sky: [string, string, string]; prop: RGB; light: RGB };
export function lookOf(look: string | undefined, colours: unknown): Look {
    const p = gridPalette(look, colours);
    return { rock: rgb(p.rock), hard: rgb(p.hard), vein: rgb(p.vein), loose: rgb(p.loose), back: rgb(p.back), dark: rgb(p.dark), sky: p.sky, prop: rgb(p.prop), light: rgb(p.light) };
}

export const cellXY = (i: number) => ({ x: PAD + MOUTH_W + (i % COLS) * CELL, y: PAD + Math.floor(i / COLS) * CELL });

/** A block's surface: square pixels around a base colour, a lit top-left edge and a dark bottom-right one. */
export function texture(ctx: any, x: number, y: number, base: RGB, seed: number, spread = 0.16) {
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

function drawMouth(ctx: any, L: Look) {
    const x = PAD, y = PAD, h = ROWS * CELL;
    const sky = ctx.createLinearGradient(0, y, 0, y + h);
    sky.addColorStop(0, L.sky[0]);
    sky.addColorStop(0.55, L.sky[1]);
    sky.addColorStop(1, L.sky[2]);
    ctx.fillStyle = sky;
    ctx.fillRect(x, y, MOUTH_W, h);
    // The ground outside.
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
    // Props holding up the mouth.
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

/**
 * The mouth, the face and the light, inside the frame (PAD in from the edges).
 * Returns where the player stands, for whatever's drawn on top.
 */
export function drawFace(ctx: any, L: Look, cells: FaceCell[], pos: number, images: GridImages = {}) {
    ctx.imageSmoothingEnabled = false;
    if (images.background) ctx.drawImage(images.background, PAD, PAD, W - PAD * 2, H - PAD * 2);
    if (images.entrance) ctx.drawImage(images.entrance, PAD, PAD, MOUTH_W, ROWS * CELL);
    else if (!images.background) drawMouth(ctx, L);
    for (const [i, cell] of cells.entries()) {
        const { x, y } = cellXY(i);
        const seed = i * 101 + 17;
        if (!cell.seen && !cell.dim) {
            texture(ctx, x, y, L.dark, seed, 0.25);
            continue;
        }
        const below = cells[i + COLS];
        // A find at the edge of sight must still look like a normal obstacle.
        const kind = cell.kind === "ore" && !cell.seen ? "rock" : cell.kind;
        const image = images[kind] ?? (kind === "ore" ? images.rock : undefined);
        if (image) {
            ctx.drawImage(image, x, y, CELL, CELL);
            if (kind === "ore") {
                ctx.fillStyle = hex(cell.ore ?? ORE_FALLBACK);
                ctx.fillRect(x + CELL / 2 - PX * 2, y + CELL / 2 - PX * 2, PX * 4, PX * 4);
                ctx.fillStyle = hex(shade(cell.ore ?? ORE_FALLBACK, 1.5));
                ctx.fillRect(x + CELL / 2 - PX * 2, y + CELL / 2 - PX * 2, PX, PX);
            }
        }
        else if (cell.kind === "open" && images.background) { /* Cleared spaces reveal the background. */ }
        else if (cell.kind === "open") drawOpen(ctx, L, x, y, seed, !below || below.kind !== "open");
        else if (cell.kind === "hard") drawHard(ctx, L, x, y, seed);
        else if (cell.kind === "loose") drawLoose(ctx, L, x, y, seed);
        // Ore at the light's edge looks like any other rock.
        else if (cell.kind === "ore" && cell.seen) drawOre(ctx, L, x, y, seed, cell.ore ?? ORE_FALLBACK);
        else drawRock(ctx, L, x, y, seed);
        if (cell.kind !== "open" && cell.max > 0) drawCracks(ctx, x, y, seed, 1 - cell.hp / cell.max);
        if (cell.dim) {
            ctx.fillStyle = "rgba(10,8,6,0.74)";
            ctx.fillRect(x, y, CELL, CELL);
        }
    }

    // The lantern: light around you in pixel steps, falling off into the dark.
    // Stepped rather than a smooth gradient: it matches the pixel art and halves the PNG.
    const at = pos >= 0 ? cellXY(pos) : { x: PAD + MOUTH_W - CELL, y: PAD + (ROWS - 1) * CELL };
    const px = pos >= 0 ? at.x + CELL / 2 : PAD + MOUTH_W / 2 + 6;
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
    return { at, px, py };
}

/** The player: a shadow and a ringed circle, with their face clipped in if there is one. */
export function drawPlayer(ctx: any, at: { y: number }, px: number, py: number, face?: unknown) {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath(); ctx.ellipse(px, at.y + CELL - 9, 20, 5, 0, 0, Math.PI * 2); ctx.fill();
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
}

/**
 * A run partway through, for previews: a tunnel two blocks in, every kind of
 * block in the light, the far side dark. `ores` colours the ore blocks in turn.
 */
export function previewCells(ores: RGB[] = []): FaceCell[] {
    const kinds: FaceCell["kind"][] = [
        "rock", "hard", "loose", "rock", "rock",
        "rock", "ore", "rock", "hard", "ore",
        "open", "open", "ore", "loose", "rock",
        "open", "rock", "hard", "ore", "rock",
    ];
    return kinds.map((kind, i) => {
        const col = i % COLS, row = Math.floor(i / COLS);
        const d = Math.min(Math.abs(row - 2) + Math.abs(col - 1), Math.abs(row - 3) + col);
        const ore = kind === "ore" ? ores[kinds.slice(0, i).filter((k) => k === "ore").length % Math.max(1, ores.length)] : undefined;
        return { kind, hp: i === 12 ? 1 : 2, max: kind === "open" ? 0 : 2, seen: d <= 3, dim: d === 4, ore };
    });
}
/** Where the player stands in previewCells. */
export const PREVIEW_POS = 11;
