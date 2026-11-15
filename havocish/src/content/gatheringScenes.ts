import { W, H, PAD, PX, rng, hex, shade, lookOf, drawPlayer, type Look, type RGB } from "./gridDraw.ts";
import { GRID_ART_SLOTS, gridPalette, type GridLook, type GridColours } from "./gridLooks.ts";
import { PUZZLE_ART_SLOTS, puzzlePalette, type PuzzleScene } from "./puzzleDraw.ts";

export const TIMING_SCENES = {
    workshop: { label: "Workshop", colours: { rock: "#5f4e38", hard: "#3a3834", loose: "#766044", back: "#211c17", light: "#ffbe6e" } },
    signal: { label: "Signal station", colours: { rock: "#4c555c", hard: "#303c46", loose: "#62776b", back: "#111d25", light: "#9ce2c4" } },
    fishing: { label: "Fishing shore", colours: { rock: "#594a36", hard: "#263e4a", loose: "#596448", back: "#14242e", light: "#ffbe6e" } },
} as const;
export type TimingScene = keyof typeof TIMING_SCENES;
export function timingSceneOf(value: unknown): TimingScene {
    return typeof value === "string" && Object.hasOwn(TIMING_SCENES, value) ? value as TimingScene : "workshop";
}

export const FIND_SCENES = {
    clearing: { label: "Forest clearing", colours: { rock: "#514432", hard: "#454941", loose: "#536044", back: "#17201a", light: "#ffbe6e" } },
    ruins: { label: "Ruins", colours: { rock: "#706454", hard: "#4d4842", loose: "#686547", back: "#25221c", light: "#efc58a" } },
    cargo: { label: "Cargo hold", colours: { rock: "#515c65", hard: "#303b46", loose: "#7b6950", back: "#141e27", light: "#9ccfc8" } },
} as const;
export type FindScene = keyof typeof FIND_SCENES;
export function findSceneOf(value: unknown): FindScene {
    return typeof value === "string" && Object.hasOwn(FIND_SCENES, value) ? value as FindScene : "clearing";
}

export const SCENE_ART_SLOTS = {
    timing: {
        background: { label: "Background", hint: "Replaces all built-in scenery and props, 472 × 304 recommended." },
        foreground: { label: "Foreground", hint: "Transparent full-scene overlay for a dock, console or workbench, 472 × 304." },
        subject: { label: "Waiting object", hint: "The focal object while waiting, 64 × 64 recommended." },
        signal: { label: "Signal", hint: "Replaces the focal object when it is time to react, 96 × 96." },
        pull: { label: "Pulling object", hint: "The object during direction choices, 96 × 96. Direction is drawn separately." },
    },
    find: {
        background: { label: "Background", hint: "Replaces all built-in scenery, search patches and props, 472 × 304 recommended." },
        foreground: { label: "Foreground", hint: "Transparent full-scene overlay for foliage or scenery, 472 × 304." },
        patch: { label: "Search patch", hint: "Ground under each searchable object, 88 × 68 recommended." },
        covered: { label: "Covered patch", hint: "Hides a patch during Glimpse, 88 × 68 recommended." },
        found: { label: "Found marker", hint: "Transparent overlay marking a found object, 88 × 68." },
    },
} as const;

export function sceneArtSlots(game: "grid" | "timing" | "find" | "puzzle"): Record<string, { label: string; hint: string }> {
    return game === "grid" ? GRID_ART_SLOTS : game === "puzzle" ? PUZZLE_ART_SLOTS : SCENE_ART_SLOTS[game];
}
export const SCENE_COLOUR_LABELS = {
    timing: { rock: "Surface", hard: "Structure", loose: "Details", back: "Background", light: "Light" },
    find: { rock: "Surface", hard: "Structure", loose: "Details", back: "Shadows", light: "Light" },
    puzzle: { rock: "Tile surface", hard: "Channels", loose: "Details", back: "Background", light: "Connected path" },
};
export function scenePalette(game: "timing" | "find" | "puzzle", look?: GridLook, colours?: unknown, scene?: TimingScene | FindScene | PuzzleScene) {
    if (game === "puzzle") return puzzlePalette(look, colours, scene === "water" || scene === "circuit" ? scene : "runes");
    const defaults = game === "timing" ? TIMING_SCENES[timingSceneOf(scene)].colours : FIND_SCENES[findSceneOf(scene)].colours;
    return gridPalette(look ?? "soil", { ...(!look && defaults), ...(colours && typeof colours === "object" ? colours : {}) });
}
export type SceneImages = Record<string, unknown>;
type Scene = { look?: GridLook | undefined; colours?: Partial<GridColours> | undefined };

// Canvas drawing is shared by the browser and @napi-rs/canvas.
/* eslint-disable @typescript-eslint/no-explicit-any */
function block(ctx: any, x: number, y: number, w: number, h: number, colour: RGB) {
    ctx.fillStyle = hex(colour); ctx.fillRect(x, y, w, h);
}
function begin(ctx: any, L: Look, images: SceneImages) {
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#17110a"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#8a7a62"; ctx.lineWidth = 1;
    ctx.strokeRect(PAD - 2.5, PAD - 2.5, W - PAD * 2 + 5, H - PAD * 2 + 5);
    ctx.beginPath(); ctx.rect(PAD, PAD, W - PAD * 2, H - PAD * 2); ctx.clip();
    ctx.fillStyle = hex(L.back); ctx.fillRect(PAD, PAD, W - PAD * 2, H - PAD * 2);
    if (images.background) ctx.drawImage(images.background, PAD, PAD, W - PAD * 2, H - PAD * 2);
}
function glow(ctx: any, L: Look, cx: number, cy: number, radius: number) {
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (let y = PAD; y < H - PAD; y += PX * 2) for (let x = PAD; x < W - PAD; x += PX * 2) {
        const d = Math.hypot(x - cx, y - cy) / radius;
        if (d >= 1) continue;
        ctx.fillStyle = `rgba(${L.light.join(",")},${(Math.round((1 - d) * 5) * 0.035).toFixed(3)})`;
        ctx.fillRect(x, y, PX * 2, PX * 2);
    }
    ctx.restore();
}
function lantern(ctx: any, L: Look, x: number, y: number) {
    block(ctx, x + 4, y - 8, 12, 8, shade(L.prop, 0.7));
    block(ctx, x, y, 20, 28, L.prop);
    block(ctx, x + 4, y + 4, 12, 16, L.light);
    block(ctx, x + 8, y, 4, 24, shade(L.prop, 0.7));
    block(ctx, x - 4, y + 24, 28, 4, shade(L.prop, 0.7));
}
function sprig(ctx: any, x: number, y: number, colour: RGB, height: number) {
    block(ctx, x, y - height, PX, height, shade(colour, 0.55));
    for (let n = 4; n < height; n += 8) {
        block(ctx, x - 8, y - n - 4, 8, PX, shade(colour, 0.9));
        block(ctx, x + PX, y - n - 8, 8, PX, shade(colour, 1.1));
    }
}

/** A room and timing apparatus; its setting is independent of the reaction rules. */
function timingRoom(ctx: any, L: Look, station: boolean, props: boolean) {
    const r = rng(station ? 821 : 417);
    for (let y = PAD; y < 236; y += PX) for (let x = PAD; x < W - PAD; x += PX) {
        const seam = y % 40 === 0 || (x + (Math.floor(y / 40) % 2) * 40) % 80 === 0;
        block(ctx, x, y, PX, PX, shade(L.hard, seam ? 0.4 : 0.68 + r() * 0.16));
    }
    for (let x = PAD; x < W - PAD; x += 24) {
        block(ctx, x, 236, 20, 80, shade(L.rock, 0.55 + r() * 0.12));
        block(ctx, x, 236, PX, 80, shade(L.rock, 0.75));
    }
    // An inset window with stepped masonry and a dark view beyond it.
    block(ctx, 44, 40, 108, 124, shade(L.rock, 0.8));
    block(ctx, 52, 32, 92, 132, shade(L.rock, 0.9));
    block(ctx, 60, 24, 76, 140, shade(L.rock, 1.1));
    block(ctx, 60, 40, 76, 116, L.back);
    block(ctx, 68, 32, 60, 124, L.back);
    block(ctx, 92, 32, PX, 124, shade(L.prop, 0.7));
    block(ctx, 60, 92, 76, PX, shade(L.prop, 0.7));
    block(ctx, 40, 160, 116, 8, shade(L.rock, 1.1));
    for (let n = 0; n < 12; n++) block(ctx, 64 + Math.floor(r() * 16) * PX, 40 + Math.floor(r() * 27) * PX, PX, PX, shade(L.vein, 0.5));
    if (!props) return;
    if (station) {
        for (let x = 196; x < 456; x += 60) {
            block(ctx, x, 40, 48, 128, shade(L.rock, 0.55));
            block(ctx, x + PX, 44, 40, 116, shade(L.hard, 0.7));
            for (let y = 52; y < 160; y += 20) {
                block(ctx, x + 8, y, 24, PX, shade(L.vein, 0.45));
                block(ctx, x + 36, y, PX, PX, shade(L.light, r() < 0.4 ? 0.7 : 0.2));
            }
        }
    } else {
        for (const y of [72, 136]) {
            block(ctx, 204, y, 248, 8, L.prop);
            block(ctx, 212, y + 8, 8, 16, shade(L.prop, 0.5));
            block(ctx, 432, y + 8, 8, 16, shade(L.prop, 0.5));
            for (let x = 220; x < 436; x += 36) {
                block(ctx, x + PX, y - 28, 12, 8, shade(L.vein, 0.65));
                block(ctx, x, y - 20, 20, 20, shade(x % 3 ? L.loose : L.light, 0.5));
                block(ctx, x + PX, y - 16, PX, 12, shade(L.vein, 0.8));
            }
        }
    }
    block(ctx, 72, 264, 368, 20, shade(L.prop, 0.35));
    for (let x = 76; x < 444; x += 24) {
        block(ctx, x, 236, 20, 28, L.prop);
        block(ctx, x, 236, PX, 28, shade(L.prop, 1.35));
        block(ctx, x + 4, 248, 12, PX, shade(L.prop, 0.6));
    }
    for (const x of [88, 412]) block(ctx, x, 264, 12, 52, shade(L.prop, 0.7));
    block(ctx, 284, 216, 104, 20, shade(L.hard, 0.85));
    block(ctx, 292, 212, 88, PX, shade(L.vein, 0.7));
    lantern(ctx, L, 92, 198);
}

/** Default workshop, optional signal station or fishing, and a full-scene upload override. */
export function drawTimingScene(ctx: any, args: Scene & { timingScene?: TimingScene | undefined; phase?: string | undefined; direction?: "left" | "right" | undefined; ended?: boolean | undefined }, images: SceneImages = {}, face?: unknown) {
    const p = scenePalette("timing", args.look, args.colours, args.timingScene);
    const L = lookOf(args.look ?? "soil", p);
    const r = rng(602);
    begin(ctx, L, images);
    const setting = timingSceneOf(args.timingScene);
    const fishing = setting === "fishing";
    const fishingProps = fishing && !images.background && !images.foreground;
    if (!images.background && !fishing) timingRoom(ctx, L, setting === "signal", !images.foreground);
    if (!images.background && fishing) {
        // Distant headlands and a reflected night sky.
        for (let x = PAD; x < W - PAD; x += PX) {
            const top = 72 + Math.round((Math.sin(x / 56) * 20 + Math.cos(x / 27) * 8) / PX) * PX;
            block(ctx, x, top, PX, 124 - top, shade(L.loose, 0.3));
            if (x % 28 === 0) for (let n = 0; n < 6; n++) block(ctx, x - n * 2, top - 32 + n * 4, n * 4 + PX, PX, shade(L.loose, 0.4));
        }
        block(ctx, 348, 28, 24, 4, shade(L.vein, 0.85));
        block(ctx, 344, 32, 32, 16, shade(L.vein, 0.85));
        block(ctx, 348, 48, 24, 4, shade(L.vein, 0.85));
        block(ctx, 344, 28, 16, 16, L.back);
        for (let n = 0; n < 24; n++) block(ctx, 24 + Math.floor(r() * 110) * PX, 20 + Math.floor(r() * 13) * PX, PX, PX, shade(L.vein, 0.5));
        for (let y = 120; y < H - PAD; y += PX) {
            block(ctx, PAD, y, W - PAD * 2, PX, shade(L.hard, 0.55 + (y - 120) / 400));
            for (let n = 0; n < 5; n++) {
                const x = PAD + Math.floor(r() * 110) * PX;
                block(ctx, x, y, (2 + Math.floor(r() * 7)) * PX, PX, shade(L.hard, 0.85 + r() * 0.4));
            }
        }
        for (let y = 132; y < 280; y += 16) block(ctx, 348 - Math.floor(r() * 5) * PX, y, (4 + Math.floor(r() * 7)) * PX, PX, shade(L.vein, 0.25));
    }
    if (fishingProps) {
        // Shoreline, stones, rushes and an old wooden landing.
        for (let y = 156; y < H - PAD; y += PX) {
            const edge = 40 + Math.round((y - 156) * 0.47 / PX) * PX;
            block(ctx, PAD, y, edge, PX, shade(L.rock, 0.75));
            block(ctx, edge + PAD, y, 8, PX, shade(L.loose, 0.75));
        }
        for (let n = 0; n < 26; n++) sprig(ctx, 16 + Math.floor(r() * 13) * PX, 196 + Math.floor(r() * 28) * PX, L.loose, 12 + Math.floor(r() * 6) * PX);
        for (let x = 72; x < 240; x += 24) {
            block(ctx, x + 8, 244, 20, 48, shade(L.prop, 0.32));
            block(ctx, x, 220, 20, 48, L.prop);
            block(ctx, x, 220, PX, 48, shade(L.prop, 1.35));
            block(ctx, x + 4, 244, 12, PX, shade(L.prop, 0.65));
        }
        for (const x of [80, 208]) {
            block(ctx, x, 200, 12, 84, shade(L.prop, 0.7));
            block(ctx, x, 196, 16, 8, shade(L.prop, 1.3));
        }
        lantern(ctx, L, 92, 194);
    } else if (images.foreground) ctx.drawImage(images.foreground, PAD, PAD, W - PAD * 2, H - PAD * 2);
    drawPlayer(ctx, { y: 184 }, 160, 222, face);

    const active = !args.ended && args.phase === "signal";
    const pulling = !args.ended && args.phase === "pull";
    const cx = pulling ? (args.direction === "left" ? 288 : 384) : 336;
    const cy = active ? 188 : 208;
    if (fishingProps && !args.ended && args.phase !== "ready") {
        // Pixel-stepped fishing line; it tightens toward the pulling direction.
        for (let n = 0; n < 44; n++) {
            const t = n / 43;
            const x = Math.round((184 + (cx - 184) * t) / PX) * PX;
            const y = Math.round((156 + (cy - 156) * t + (pulling ? 0 : Math.sin(t * Math.PI) * 36)) / PX) * PX;
            block(ctx, x, y, PX, PX, shade(L.vein, 0.6));
        }
    }
    // The rod remains in the player's hand in all states.
    if (fishingProps) for (let n = 0; n < 14; n++) block(ctx, 160 + n * 2, 208 - n * 4, PX, 8, shade(L.prop, 1.25));
    if (!args.ended && args.phase !== "ready") {
        const slot = active ? "signal" : pulling ? "pull" : "subject";
        if (images[slot]) {
            const size = slot === "subject" ? 64 : 96;
            ctx.drawImage(images[slot], cx - size / 2, cy - size / 2, size, size);
        } else if (fishingProps) {
            const rings = active || pulling ? 4 : 2;
            for (let n = 1; n <= rings; n++) {
                const width = n * 16;
                block(ctx, cx - width / 2, cy + n * 4, width, PX, shade(L.vein, active ? 0.75 : 0.35));
                block(ctx, cx - width / 2 - PX, cy + n * 4 - PX, PX, PX, shade(L.vein, 0.4));
            }
            block(ctx, cx - PX, cy - 12, 8, 16, L.light);
            block(ctx, cx - PX, cy - 4, 8, 8, shade(L.loose, 1.3));
            if (active) {
                block(ctx, cx - PX, cy - 52, 8, 24, L.light);
                block(ctx, cx - PX, cy - 20, 8, PX, L.light);
                for (const dx of [-24, 24]) block(ctx, cx + dx, cy - 24, PX, 12, L.light);
            }
            if (args.phase === "fake") block(ctx, cx + 20, cy - 4, 12, PX, shade(L.vein, 0.6));
        }
        if (!images[slot] && !fishingProps) {
            // A neutral timing object: an illuminated device held in a small armature.
            for (const dx of [-24, 20]) {
                block(ctx, cx + dx, cy - 28, PX, 40, shade(L.vein, 0.7));
                block(ctx, cx + dx - PX, cy - 32, 12, PX, shade(L.vein, 0.9));
            }
            for (let row = -4; row <= 4; row++) {
                const width = (5 - Math.abs(row)) * PX;
                block(ctx, cx - width / 2, cy - 20 + row * PX, width, PX, shade(active ? L.light : L.vein, row < 0 ? 1.05 : 0.65));
            }
            block(ctx, cx - 28, cy + 12, 56, 8, shade(L.hard, 0.8));
            block(ctx, cx - 20, cy + 8, 40, PX, shade(L.vein, 0.8));
            if (active) for (const dx of [-36, 32]) {
                block(ctx, cx + dx, cy - 28, PX, 20, L.light);
                block(ctx, cx + dx - 8, cy - 20, 20, PX, L.light);
            }
            if (args.phase === "fake") block(ctx, cx - PX, cy - 16, 8, PX, shade(L.loose, 0.75));
        }
        if (pulling) {
            const sign = args.direction === "left" ? -1 : 1;
            for (let n = 0; n < 5; n++) {
                block(ctx, cx + sign * (16 + n * PX), cy - 44, PX, PX, L.light);
                block(ctx, cx + sign * 32, cy - 52 + n * PX, PX, PX, L.light);
            }
        }
    }
    if (!images.background) glow(ctx, L, 104, 208, 200);
    ctx.restore();
}

export type SearchCell = { label: string; tone: string; covered?: boolean };
export const searchCellXY = (i: number) => ({ x: 116 + (i % 4) * 88, y: 24 + Math.floor(i / 4) * 68 });

/** Stone recesses or metal compartments use the same 4×4 search positions as the clearing. */
function searchInterior(ctx: any, L: Look, cargo: boolean) {
    const r = rng(cargo ? 627 : 312);
    for (let y = PAD; y < H - PAD; y += PX) for (let x = PAD; x < W - PAD; x += PX) {
        const seam = y % (cargo ? 68 : 40) === 0 || (x + Math.floor(y / 40) % 2 * 36) % (cargo ? 88 : 72) === 0;
        block(ctx, x, y, PX, PX, shade(L.rock, seam ? 0.35 : 0.48 + r() * 0.16));
    }
    if (cargo) {
        for (const x of [20, 92, 472]) {
            block(ctx, x, PAD, 8, H - PAD * 2, shade(L.hard, 0.65));
            block(ctx, x, PAD, PX, H - PAD * 2, shade(L.vein, 0.7));
        }
        for (const y of [32, 108]) {
            block(ctx, 32, y, 48, 52, shade(L.prop, 0.65));
            block(ctx, 32, y, 48, PX, shade(L.prop, 1.25));
            block(ctx, 36, y + PX, PX, 44, shade(L.prop, 1.1));
            block(ctx, 32, y + 24, 48, PX, shade(L.hard, 0.8));
            block(ctx, 48, y + 8, 16, 8, shade(L.vein, 0.75));
        }
        block(ctx, 28, 280, 56, 20, shade(L.hard, 0.5));
        for (let x = 32; x < 80; x += 12) block(ctx, x, 284, 8, PX, shade(L.loose, 1.2));
    } else {
        // Broken pillars with carved bands, fallen masonry and floor fractures.
        for (const x of [24, 76]) {
            block(ctx, x, 24, 20, 116, shade(L.hard, 0.6));
            block(ctx, x, 24, PX, 116, shade(L.rock, 1.1));
            for (const y of [32, 92, 132]) block(ctx, x - PX, y, 28, 8, shade(L.rock, 0.8));
            for (let y = 48; y < 84; y += 12) block(ctx, x + 8, y, 8, PX, shade(L.vein, 0.6));
        }
        for (let n = 0; n < 26; n++) {
            const x = 16 + Math.floor(r() * 20) * PX, y = 156 + Math.floor(r() * 36) * PX;
            block(ctx, x, y, 16, 8, shade(L.hard, 0.8));
            block(ctx, x, y, 12, PX, shade(L.rock, 1.1));
        }
        for (let n = 0; n < 12; n++) {
            const x = 124 + Math.floor(r() * 84) * PX, y = 20 + Math.floor(r() * 68) * PX;
            for (let k = 0; k < 6; k++) block(ctx, x + k * PX, y + Math.floor(k / 2) * PX, PX, PX, shade(L.back, 0.7));
        }
    }
}

/** A search clearing with identifiable objects nestled into foliage and recessed ground. */
export function drawFindScene(ctx: any, args: Scene & { findScene?: FindScene | undefined; cells?: SearchCell[] | undefined }, images: SceneImages = {}, symbols: SceneImages = {}, face?: unknown) {
    const setting = findSceneOf(args.findScene);
    const L = lookOf(args.look ?? "soil", scenePalette("find", args.look, args.colours, setting));
    const r = rng(192);
    begin(ctx, L, images);
    if (!images.background && setting !== "clearing") searchInterior(ctx, L, setting === "cargo");
    if (!images.background && setting === "clearing") {
        for (let y = PAD; y < H - PAD; y += PX) for (let x = PAD; x < W - PAD; x += PX) {
            block(ctx, x, y, PX, PX, shade(L.rock, 0.35 + r() * 0.14));
        }
        for (const x of [20, 68, 460]) {
            block(ctx, x, PAD, 20, H - PAD * 2, shade(L.prop, 0.45));
            block(ctx, x + PX, PAD, PX, H - PAD * 2, shade(L.prop, 0.8));
            for (let n = 0; n < 12; n++) {
                const y = PAD + n * 24;
                block(ctx, x - 16, y, 28, PX * 2, shade(L.loose, 0.35));
                block(ctx, x + 12, y + 12, 24, PX * 2, shade(L.loose, 0.5));
            }
        }
        for (let n = 0; n < 100; n++) sprig(ctx, PAD + Math.floor(r() * 114) * PX, PAD + Math.floor(r() * 75) * PX, shade(L.loose, 0.7), 8 + Math.floor(r() * 3) * PX);
        // Weathered stones and roots along the path into the clearing.
        for (let n = 0; n < 16; n++) {
            const x = 32 + Math.floor(r() * 14) * PX, y = 120 + n * 12;
            block(ctx, x, y, 24, 8, shade(L.hard, 0.8));
            block(ctx, x + PX, y - PX, 16, PX, shade(L.hard, 1.2));
        }
    }
    for (const [i, cell] of (args.cells ?? []).slice(0, 16).entries()) {
        const { x, y } = searchCellXY(i);
        const pr = rng(i * 117 + 29);
        if (cell.covered) {
            if (images.covered) ctx.drawImage(images.covered, x, y, 88, 68);
            else for (let dy = 0; dy < 60; dy += PX) for (let dx = 0; dx < 80; dx += PX) {
                block(ctx, x + dx, y + dy, PX, PX, shade(L.back, 0.75 + pr() * 0.6));
            }
            continue;
        }
        if (images.patch) ctx.drawImage(images.patch, x, y, 88, 68);
        else if (!images.background) {
            block(ctx, x + 8, y + 12, 64, 44, shade(L.rock, 0.52));
            block(ctx, x + 16, y + 8, 48, PX, shade(L.rock, 0.65));
            block(ctx, x + 12, y + 56, 56, PX, shade(L.hard, 0.7));
            for (let n = 0; n < 12; n++) {
                const dx = x + 8 + Math.floor(pr() * 16) * PX, dy = y + 12 + Math.floor(pr() * 10) * PX;
                block(ctx, dx, dy, 8, PX, shade(L.rock, 0.65 + pr() * 0.2));
            }
            if (setting === "cargo") {
                block(ctx, x + 8, y + 12, 64, PX, shade(L.vein, 0.75));
                for (const dx of [8, 68]) {
                    block(ctx, x + dx, y + 16, PX, 36, shade(L.hard, 0.7));
                    block(ctx, x + dx, y + 20, PX, PX, shade(L.light, 0.65));
                }
            } else if (setting === "ruins") {
                for (const dx of [8, 64]) {
                    block(ctx, x + dx, y + 8, 8, 12, shade(L.rock, 0.8));
                    block(ctx, x + dx, y + 48, 8, 8, shade(L.hard, 0.9));
                }
            }
        }
        const img = symbols[cell.label];
        if (img) {
            if (!images.background) block(ctx, x + 24, y + 48, 32, PX, shade(L.back, 0.8));
            ctx.drawImage(img, x + 20, y + 8, 40, 40);
        } else {
            // Keep a neutral loading marker for non-forest and uploaded scenes.
            if (!images.background && setting === "clearing") sprig(ctx, x + 40, y + 48, L.loose, 32);
            else {
                block(ctx, x + 28, y + 24, 24, 16, shade(L.vein, 0.75));
                block(ctx, x + 32, y + 20, 16, PX, L.vein);
            }
        }
        if (!images.background && !images.foreground && setting === "clearing") {
            sprig(ctx, x + 12, y + 56, shade(L.loose, 0.8), 16);
            sprig(ctx, x + 68, y + 52, shade(L.loose, 0.9), 12);
        }
        if (cell.tone === "found") {
            if (images.found) ctx.drawImage(images.found, x, y, 88, 68);
            else {
                ctx.strokeStyle = hex(L.light); ctx.lineWidth = PX;
                ctx.strokeRect(x + PX, y + PX, 72, 56);
                block(ctx, x + 60, y + 4, PX, 12, L.light);
                block(ctx, x + 56, y + 8, 12, PX, L.light);
            }
        }
    }
    if (images.foreground) ctx.drawImage(images.foreground, PAD, PAD, W - PAD * 2, H - PAD * 2);
    else if (!images.background) lantern(ctx, L, 76, 176);
    drawPlayer(ctx, { y: 208 }, 64, 244, face);
    if (!images.background) glow(ctx, L, 88, 192, 240);
    ctx.restore();
}
