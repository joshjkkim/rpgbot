import { CELL, H, PAD, PX, W, drawPlayer, hex, lookOf, rng, shade, texture, type RGB } from "./gridDraw.ts";
import { gridPalette, type GridColours, type GridLook } from "./gridLooks.ts";
import { poweredTiles, tileName } from "./puzzle.ts";

export const PUZZLE_SCENES = {
    runes: { label: "Rune conduits", colours: { rock: "#5e554b", hard: "#35302d", loose: "#776450", back: "#201b20", light: "#cfafed" } },
    water: { label: "Water channels", colours: { rock: "#6c6656", hard: "#343e3c", loose: "#5d6c45", back: "#1b272a", light: "#7fcbd9" } },
    circuit: { label: "Circuit board", colours: { rock: "#36504a", hard: "#1c302c", loose: "#85734e", back: "#111d1c", light: "#a6e5a1" } },
} as const;
export type PuzzleScene = keyof typeof PUZZLE_SCENES;
export function puzzleSceneOf(value: unknown): PuzzleScene {
    return typeof value === "string" && Object.hasOwn(PUZZLE_SCENES, value) ? value as PuzzleScene : "runes";
}
export const PUZZLE_ART_SLOTS = {
    background: { label: "Background", hint: "Replaces built-in environment and tile surfaces, 472 × 304 recommended." },
    tile: { label: "Tile surface", hint: "Under each connection, 76 × 76 recommended." },
    straight: { label: "Straight connector", hint: "76 × 76 transparent tile. Draw a vertical connection; the game rotates it." },
    corner: { label: "Corner connector", hint: "76 × 76 transparent tile. Draw connections up and right; the game rotates it." },
    junction: { label: "Three-way connector", hint: "76 × 76 transparent tile. Draw connections up, right and down; the game rotates it." },
    source: { label: "Entrance", hint: "The supply to the left of the board, 32 × 40 recommended." },
    goal: { label: "Goal", hint: "The destination to the right of the board, 32 × 40 recommended." },
} as const;
export const puzzlePalette = (look?: GridLook, colours?: unknown, scene?: PuzzleScene) =>
    gridPalette(look ?? "mine", { ...(!look && PUZZLE_SCENES[puzzleSceneOf(scene)].colours), ...(colours && typeof colours === "object" ? colours : {}) });
export type PuzzleView = { tiles: number[]; source: number; goal: number; solved?: boolean; active?: number | undefined };
export const puzzleCellXY = (i: number) => ({ x: 140 + i % 4 * CELL, y: PAD + Math.floor(i / 4) * CELL });

const GLYPHS: Record<string, number[]> = {
    A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6],
    "1": [2, 6, 2, 2, 7], "2": [6, 1, 2, 4, 7], "3": [6, 1, 2, 1, 6], "4": [5, 5, 7, 1, 1],
};

/** A physical connection board, with a live path lit from the entrance. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function drawPuzzleScene(ctx: any, args: PuzzleView & { puzzleScene?: PuzzleScene | undefined; look?: GridLook | undefined; colours?: Partial<GridColours> | undefined }, images: Record<string, unknown> = {}, face?: unknown) {
    const scene = puzzleSceneOf(args.puzzleScene);
    const L = lookOf(args.look ?? "mine", puzzlePalette(args.look, args.colours, scene));
    const powered = poweredTiles(args.tiles, args.source);
    const block = (x: number, y: number, w: number, h: number, colour: RGB) => {
        ctx.fillStyle = hex(colour); ctx.fillRect(x, y, w, h);
    };
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#17110a"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#8a7a62"; ctx.lineWidth = 1;
    ctx.strokeRect(PAD - 2.5, PAD - 2.5, W - PAD * 2 + 5, H - PAD * 2 + 5);
    ctx.beginPath(); ctx.rect(PAD, PAD, W - PAD * 2, H - PAD * 2); ctx.clip();
    if (images.background) ctx.drawImage(images.background, PAD, PAD, W - PAD * 2, H - PAD * 2);
    else {
        for (let y = PAD; y < H - PAD; y += CELL) for (let x = PAD; x < W - PAD; x += CELL) texture(ctx, x, y, L.back, x * 13 + y, 0.2);
        for (const x of [24, 100]) {
            block(x, PAD, 12, H - PAD * 2, shade(L.hard, 0.85));
            block(x, PAD, PX, H - PAD * 2, shade(L.rock, 0.9));
        }
        for (let y = 24; y < 184; y += 32) {
            block(44, y, 44, 20, shade(L.rock, 0.7));
            block(48, y + PX, 8, 12, shade(L.vein, 0.7));
            block(68, y + PX, 12, PX, shade(L.loose, 1.15));
            if (scene === "circuit") block(76, y + 12, PX, PX, shade(L.light, 0.8));
        }
        block(36, 284, 56, 16, shade(L.prop, 0.6));
        for (const x of [44, 64, 80]) block(x, 280, 8, PX, L.prop);
    }

    for (const [i, mask] of args.tiles.entries()) {
        const { x, y } = puzzleCellXY(i), cx = x + CELL / 2, cy = y + CELL / 2;
        const live = powered.has(i);
        if (images.tile) ctx.drawImage(images.tile, x, y, CELL, CELL);
        else if (!images.background) {
            texture(ctx, x, y, L.rock, i * 101 + 23, scene === "circuit" ? 0.08 : 0.16);
            if (scene === "circuit") {
                for (const dx of [8, 60]) for (const dy of [8, 60]) {
                    block(x + dx, y + dy, 8, 8, shade(L.loose, 0.8));
                    block(x + dx + 2, y + dy + 2, PX, PX, shade(L.vein, 0.7));
                }
            } else {
                const r = rng(i * 53 + 29);
                for (let n = 0; n < 5; n++) block(x + Math.floor(r() * 16) * PX, y + Math.floor(r() * 16) * PX, 8, PX, shade(L.hard, 0.75));
            }
        }
        const count = [1, 2, 4, 8].filter((bit) => mask & bit).length;
        const straight = mask === 5 || mask === 10;
        const slot = count === 3 ? "junction" : straight ? "straight" : "corner";
        let base = count === 3 ? 7 : straight ? 5 : 3;
        let turns = 0;
        while (base !== mask && turns < 4) { base = ((base << 1) & 15) | (base >> 3); turns++; }
        if (images[slot]) {
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(turns * Math.PI / 2);
            ctx.drawImage(images[slot], -CELL / 2, -CELL / 2, CELL, CELL); ctx.restore();
        }
        const trace = (width: number, colour: RGB) => {
            block(cx - width / 2, cy - width / 2, width, width, colour);
            if (mask & 1) block(cx - width / 2, y, width, CELL / 2, colour);
            if (mask & 2) block(cx, cy - width / 2, CELL / 2, width, colour);
            if (mask & 4) block(cx - width / 2, cy, width, CELL / 2, colour);
            if (mask & 8) block(x, cy - width / 2, CELL / 2, width, colour);
        };
        if (!images[slot]) {
            trace(scene === "circuit" ? 12 : 20, shade(L.hard, 0.55));
            trace(scene === "circuit" ? 8 : 12, shade(scene === "water" ? L.back : L.vein, 0.65));
            if (scene === "runes") block(cx - 12, cy - 12, 24, 24, shade(L.hard, 0.9));
        }
        if (live) trace(scene === "water" ? 8 : PX, shade(L.light, args.solved ? 1.15 : 0.9));
        if (scene === "water" && !images[slot]) {
            block(cx - 8, cy - 8, 16, PX, shade(L.vein, 0.6));
        }
        // Small pixel coordinates match the Discord button labels.
        block(x + 2, y + 2, 20, 14, shade(L.back, 0.65));
        ctx.fillStyle = hex(L.vein);
        for (const [letter, glyph] of [...tileName(i)].entries()) for (const [row, bits] of GLYPHS[glyph]!.entries()) {
            for (let col = 0; col < 3; col++) if (bits & (1 << (2 - col))) ctx.fillRect(x + PX + letter * 8 + col * 2, y + PX + row * 2, 2, 2);
        }
        if (args.active === i) {
            ctx.strokeStyle = hex(shade(L.vein, 0.9)); ctx.lineWidth = 2;
            ctx.strokeRect(x + PX, y + PX, CELL - 8, CELL - 8);
        }
    }
    for (const [index, side, slot] of [[args.source, "left", "source"], [args.goal, "right", "goal"]] as const) {
        const { x, y } = puzzleCellXY(index), cy = y + CELL / 2;
        const at = side === "left" ? 104 : x + CELL + 4;
        if (images[slot]) ctx.drawImage(images[slot], at, cy - 20, 32, 40);
        else {
            const lit = side === "left" || args.solved;
            block(at, cy - 20, 32, 40, shade(L.hard, 0.85));
            block(at + PX, cy - 16, 24, 32, shade(lit ? L.light : L.back, 0.65));
            block(at + 8, cy - 12, PX, 24, shade(lit ? L.light : L.vein, 0.9));
        }
        block(side === "left" ? at + 32 : x + CELL, cy - 2, PX, PX, side === "left" || args.solved ? L.light : L.hard);
    }
    drawPlayer(ctx, { y: 208 }, 64, 244, face);
    ctx.restore();
}
