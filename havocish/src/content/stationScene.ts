import { W, H, PAD, PX, hex, shade, lookOf, rng, type Look, type RGB } from "./gridDraw.ts";
import type { GridColours, GridLook } from "./gridLooks.ts";

/**
 * Timed stations (a garden, a nursery, a robot bay) drawn as a row of slots,
 * each empty, growing or ready. Shared by the bot and the dashboard preview.
 */

export const STATION_SCENES = {
    garden: { label: "Garden", colours: { rock: "#5a4330", hard: "#3f5a35", loose: "#6f9a4a", back: "#1a2418", light: "#ffd27a" } },
    nursery: { label: "Nursery", colours: { rock: "#6a5038", hard: "#4a3a2c", loose: "#b89a5e", back: "#221a14", light: "#ffbe6e" } },
    workshop: { label: "Workshop", colours: { rock: "#4f5a63", hard: "#323c45", loose: "#7a8790", back: "#141c23", light: "#9ce2c4" } },
} as const;
export type StationScene = keyof typeof STATION_SCENES;
export const stationSceneOf = (v: unknown): StationScene => (typeof v === "string" && Object.hasOwn(STATION_SCENES, v) ? v as StationScene : "garden");

export const STATION_ART_SLOTS = {
    background: { label: "Background", hint: "Replaces the built-in scenery, 472 × 304 recommended." },
    plot: { label: "Slot", hint: "Each slot's base (a bed, a nest, a pad), 64 × 64 recommended." },
    growing: { label: "In progress", hint: "Shown while waiting, 64 × 64. The item's symbol is drawn small beside it." },
    ready: { label: "Ready", hint: "Shown when it's ready to collect, 64 × 64. The item's symbol is drawn over it." },
} as const;

export const STATION_COLOUR_LABELS: Record<keyof GridColours, string> = { rock: "Ground", hard: "Walls", loose: "Growth", back: "Background", light: "Light" };

export type StationSlotView = { stage: "empty" | "growing" | "ready"; progress: number; symbol?: string };
export type StationSceneArgs = { scene?: StationScene | undefined; look?: GridLook | undefined; colours?: Partial<GridColours> | undefined; slots: StationSlotView[] };

/** Where each slot sits: one row up to 6, two rows after that. */
export function stationSlotXY(i: number, n: number) {
    const cols = n <= 6 ? Math.max(1, n) : Math.ceil(n / 2), rows = n <= 6 ? 1 : 2;
    const size = Math.min(64, Math.floor((W - PAD * 2 - 16) / cols / PX) * PX - 16);
    const gap = (W - PAD * 2 - cols * size) / (cols + 1);
    const row = Math.floor(i / cols), col = i % cols;
    const top = rows === 1 ? 168 : 108 + row * (size + 48);
    return { x: Math.round((PAD + gap + col * (size + gap)) / PX) * PX, y: top, size };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const block = (ctx: any, x: number, y: number, w: number, h: number, c: RGB) => { ctx.fillStyle = hex(c); ctx.fillRect(x, y, w, h); };

function scenery(ctx: any, L: Look, scene: StationScene) {
    const r = rng(scene.length * 97);
    const horizon = 128;
    for (let y = PAD; y < horizon; y += PX) {
        const wall = scene === "garden" ? shade(L.back, 1 + (horizon - y) / 240) : shade(L.hard, 0.6 + r() * 0.1);
        block(ctx, PAD, y, W - PAD * 2, PX, wall);
    }
    if (scene === "garden") for (let n = 0; n < 30; n++) block(ctx, PAD + Math.floor(r() * 118) * PX, PAD + Math.floor(r() * 18) * PX, PX, PX, shade(L.light, 0.6));
    else for (let x = PAD; x < W - PAD; x += 80) block(ctx, x, PAD, PX, horizon - PAD, shade(L.hard, 0.4));
    for (let y = horizon; y < H - PAD; y += PX) for (let x = PAD; x < W - PAD; x += PX * 2) {
        block(ctx, x, y, PX * 2, PX, shade(L.rock, 0.55 + r() * 0.15 + (y - horizon) / 900));
    }
}

function plot(ctx: any, L: Look, scene: StationScene, x: number, y: number, s: number) {
    if (scene === "garden") {
        block(ctx, x - PX, y + s - 20, s + PX * 2, 24, shade(L.hard, 0.45));
        block(ctx, x, y + s - 16, s, 16, shade(L.rock, 0.8));
        for (let n = PX; n < s; n += PX * 3) block(ctx, x + n, y + s - 12, PX * 2, PX, shade(L.rock, 0.55));
    } else if (scene === "nursery") {
        block(ctx, x, y + s - 16, s, 16, shade(L.loose, 0.55));
        for (let n = 0; n < s; n += PX * 2) block(ctx, x + n, y + s - 20 + (n % 3) * PX, PX * 2, PX, shade(L.loose, 0.85));
    } else {
        block(ctx, x - PX, y + s - 12, s + PX * 2, 12, shade(L.loose, 0.5));
        block(ctx, x, y + s - 12, s, PX, shade(L.light, 0.35));
    }
}

function progressShape(ctx: any, L: Look, scene: StationScene, x: number, y: number, s: number, t: number) {
    const cx = x + Math.floor(s / 2 / PX) * PX;
    if (scene === "garden") {
        const h = Math.max(PX * 2, Math.round((s - 20) * (0.25 + 0.75 * t) / PX) * PX);
        block(ctx, cx, y + s - 16 - h, PX, h, shade(L.loose, 0.6));
        for (let n = PX * 2; n < h; n += PX * 3) {
            block(ctx, cx - PX * 2, y + s - 16 - n, PX * 2, PX, L.loose);
            block(ctx, cx + PX, y + s - 18 - n, PX * 2, PX, shade(L.loose, 1.15));
        }
    } else if (scene === "nursery") {
        const ew = 24, eh = 32, ex = cx - 12, ey = y + s - 18 - eh;
        block(ctx, ex + PX, ey, ew - PX * 2, eh, shade(L.light, 0.85));
        block(ctx, ex, ey + PX * 2, ew, eh - PX * 3, shade(L.light, 0.85));
        block(ctx, ex + PX, ey + PX, PX, PX * 2, shade(L.light, 1.1));
        for (let n = 0; n < Math.floor(t * 4); n++) block(ctx, ex + 4 + n * PX, ey + 10 + (n % 2) * PX, PX, PX, shade(L.back, 1.2));
    } else {
        block(ctx, cx - 16, y + s - 44, 32, 32, shade(L.hard, 1.2));
        block(ctx, cx - 12, y + s - 40, 24, 12, shade(L.back, 1.1));
        const lit = Math.ceil(t * 4);
        for (let n = 0; n < 4; n++) block(ctx, cx - 10 + n * 6, y + s - 22, PX, PX, n < lit ? L.light : shade(L.light, 0.25));
    }
}

/** `art` holds uploaded pictures by slot name; `symbols` holds each item symbol drawn small. */
export function drawStationScene(ctx: any, args: StationSceneArgs, art: Record<string, unknown> = {}, symbols: Record<string, unknown> = {}) {
    const scene = stationSceneOf(args.scene);
    const L = lookOf(args.look ?? "soil", { ...(!args.look && STATION_SCENES[scene].colours), ...(args.colours ?? {}) });
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#17110a"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#8a7a62"; ctx.lineWidth = 1;
    ctx.strokeRect(PAD - 2.5, PAD - 2.5, W - PAD * 2 + 5, H - PAD * 2 + 5);
    ctx.beginPath(); ctx.rect(PAD, PAD, W - PAD * 2, H - PAD * 2); ctx.clip();
    if (art.background) ctx.drawImage(art.background, PAD, PAD, W - PAD * 2, H - PAD * 2);
    else scenery(ctx, L, scene);

    args.slots.forEach((slot, i) => {
        const { x, y, size: s } = stationSlotXY(i, args.slots.length);
        const t = Math.max(0, Math.min(1, slot.progress));
        if (art.plot) ctx.drawImage(art.plot, x, y, s, s); else plot(ctx, L, scene, x, y, s);
        const symbol = slot.symbol ? symbols[slot.symbol] : undefined;
        if (slot.stage === "growing") {
            if (art.growing) ctx.drawImage(art.growing, x, y, s, s); else progressShape(ctx, L, scene, x, y, s, t);
            if (symbol) ctx.drawImage(symbol, x + s - 14, y - 2, 16, 16);
        } else if (slot.stage === "ready") {
            ctx.save(); ctx.globalCompositeOperation = "lighter";
            for (let n = 3; n > 0; n--) { ctx.fillStyle = `rgba(${L.light.join(",")},0.08)`; ctx.fillRect(x - n * PX * 2, y - n * PX * 2, s + n * PX * 4, s + n * PX * 4); }
            ctx.restore();
            if (art.ready) ctx.drawImage(art.ready, x, y, s, s);
            if (symbol) ctx.drawImage(symbol, x + s / 2 - 16, y + s / 2 - 24, 32, 32);
            else if (!art.ready) progressShape(ctx, L, scene, x, y, s, 1);
        }
        // Progress bar under every slot; full and lit when ready.
        block(ctx, x, y + s + PX * 2, s, PX * 2, shade(L.back, 0.6));
        if (slot.stage !== "empty") block(ctx, x, y + s + PX * 2, Math.max(PX, Math.round(s * (slot.stage === "ready" ? 1 : t) / PX) * PX), PX * 2, slot.stage === "ready" ? L.light : shade(L.light, 0.6));
    });
    ctx.restore();
}
