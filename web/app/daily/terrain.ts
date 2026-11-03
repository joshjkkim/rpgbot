import { useEffect, useState } from "react";
import { SIDE, type Daily, type MapNode } from "@content/daily";
import { mix, prop, rnd } from "./landscape";
import type { Theme } from "./scene";

/*
 * The day's land as pixel rects, from the day and the world's colours alone:
 * ground, cliffs where the way is blocked, trails between every two tiles you
 * can walk between, scenery on the open road, and a forest edge around it all.
 * Drawn at any tile size: the full map uses small tiles, the world you walk
 * through big ones with more scenery in each, and buildings for the places.
 */

export type Rect = [number, number, number, number, string];
/** Tile size, forest edge and whole width, in map pixels. */
export type Grid = { cell: number; pad: number; w: number };

export function grid(cell: number): Grid {
  const pad = Math.round((cell * 10) / 32);
  return { cell, pad, w: SIDE * cell + pad * 2 };
}

/** The middle of the tile at column (or row) `i`. */
export const centreOf = (g: Grid, i: number) => g.pad + i * g.cell + g.cell / 2;

/** Places drawn as buildings in the walking world (the rest are creatures, drawn as sprites). */
export const BUILT: ReadonlySet<MapNode["kind"]> = new Set(["start", "town", "forge", "shrine", "camp", "gather"]);

/** A pine: a trunk and stepped boughs, lit on the left. */
function pine(x: number, base: number, h: number, dark: string, lit: string, trunk: string): Rect[] {
  const r: Rect[] = [[x, base - 2, 1, 2, trunk]];
  for (let k = 0; k < h; k++) {
    const w = 1 + 2 * Math.floor((h - k) / 2);
    r.push([x - Math.floor(w / 2), base - 2 - k - 1, w, 1, dark]);
    if (w > 1) r.push([x - Math.floor(w / 2), base - 2 - k - 1, 1, 1, lit]);
  }
  return r;
}

/** One of the world's own props (towers, cacti, coral…, as the landscape draws them), shrunk by `f` to stand on the map. */
function themed(theme: Theme, x: number, base: number, i: number, f: number, colour: string): Rect[] {
  return prop(theme.land.props, 0, 0, i, theme.land.windows).map(([rx, ry, w, h, c]): Rect =>
    [x + Math.round(rx * f), base + Math.round(ry * f), Math.max(1, Math.round(w * f)), Math.max(1, Math.round(h * f)), c ?? colour]);
}

/** A mountain: stepped rows, the left face lit, snow on the top. */
function peak(x: number, base: number, w: number, h: number, far: string): Rect[] {
  const lit = mix(far, "#ffffff", 0.22), snow = mix(far, "#ffffff", 0.7), shade = mix(far, "#000000", 0.25);
  const r: Rect[] = [];
  for (let k = 0; k < h; k++) {
    const rw = Math.max(1, Math.round(w * (1 - k / h)));
    const left = x + Math.round((w - rw) / 2);
    const top = k > h * 0.72;
    r.push([left, base - k - 1, rw, 1, top ? snow : shade]);
    r.push([left, base - k - 1, Math.ceil(rw / 2), 1, top ? snow : lit]);
  }
  return r;
}

/** Pixel art from rows of letters ("." is empty), `px` map pixels a pixel, top-left at x, y. */
function art(rows: string[], x: number, y: number, px: number, pal: Record<string, string>): Rect[] {
  const r: Rect[] = [];
  rows.forEach((row, j) => [...row].forEach((c, i) => { if (pal[c]) r.push([x + i * px, y + j * px, px, px, pal[c]]); }));
  return r;
}

const HOUSE = [
  "....rrrrrr....",
  "...rRRRRRRr...",
  "..rRRRRRRRRr..",
  ".rRRRRRRRRRRr.",
  "rrrrrrrrrrrrrr",
  ".wwwwwwwwwwww.",
  ".wyywwwwwwyyw.",
  ".wyywwddwwyyw.",
  ".wwwwwddwwwww.",
  ".wwwwwddwwwww.",
];
const FORGE = [
  "...........cc..",
  "...........cc..",
  "...sssssssscc..",
  "..sSSSSSSSSSs..",
  ".sSSSSSSSSSSSs.",
  "sssssssssssssss",
  ".ggggggggggggg.",
  ".gooogggggdddg.",
  ".gooogggggdddg.",
  ".gggggggggdddg.",
  "...aaaa........",
  "....aa.........",
  "...aaaa........",
];
const SHRINE = [
  "..tttttttttt..",
  ".tTTTTTTTTTTt.",
  "..pp......pp..",
  "..pp..oo..pp..",
  "..pp.oooo.pp..",
  "..pp..oo..pp..",
  "..pp......pp..",
  ".bbbbbbbbbbbb.",
  "bbbbbbbbbbbbbb",
];
const TENT = [
  "......t.......",
  ".....tTt......",
  "....ttTtt.....",
  "...tttTttt....",
  "..ttttTtttt...",
  ".tttttTttttt..",
  "tttttt.tttttt.",
  "ttttt...ttttt.",
  "..........l.l.",
  ".........lllll",
];
const SIGN = [
  ".aaaaaaa.",
  "aaaaaaaaA",
  ".aaaaaaa.",
  "....p....",
  ".aaaaaaa.",
  "Aaaaaaaaa",
  ".aaaaaaa.",
  "....p....",
  "....p....",
  "...ppp...",
];
const MINE = [
  "....mmmmmmm....",
  "..mmmMMMMMmmm..",
  ".mmMMmmmmmMMmm.",
  "mmMmmbbbbbmmMmm",
  "mMmmbkkkkkbmmMm",
  "mmmbkkkkkkkbmmm",
  "mmmbkkkkkkkbmmm",
  "...............",
];

const PLOT = [
  ".mmmmmmmmmmmmm.",
  "mMMMMMMMMMMMMMm",
  "mkkkkkkkkkkkkkm",
  "mMMMMMMMMMMMMMm",
  "mkkkkkkkkkkkkkm",
  "mMMMMMMMMMMMMMm",
  "mkkkkkkkkkkkkkm",
  ".mmmmmmmmmmmmm.",
  "...........l...",
  "..........lll..",
];

/** Where a building's art goes on its tile: standing on the tile's middle, a little low. */
export function buildingAt(node: MapNode, g: Grid): Array<{ rows: string[]; x: number; y: number; px: number }> {
  const px = Math.max(1, Math.round(g.cell / 32));
  const cx = centreOf(g, node.id % SIDE), cy = centreOf(g, Math.floor(node.id / SIDE)) + g.cell * 0.12;
  const at = (rows: string[], dx = 0, dy = 0) => ({ rows, px, x: Math.round(cx + dx * g.cell - (rows[0]!.length * px) / 2), y: Math.round(cy + dy * g.cell - rows.length * px) });
  switch (node.kind) {
    case "town": return [at(HOUSE, -0.2, -0.12), at(HOUSE, 0.2, 0.06)];
    case "forge": return [at(FORGE)];
    case "shrine": return [at(SHRINE)];
    case "camp": return [at(TENT)];
    case "start": return [at(SIGN)];
    // Fishing is a pond (drawn in terrain), a tunnel a mine, a dig a furrowed plot.
    case "gather": return node.gather?.game === "pulls" ? [] : [at(node.gather?.game === "tunnel" ? MINE : PLOT)];
    default: return [];
  }
}

export function terrain(daily: Daily, theme: Theme, g: Grid, buildings: boolean): Rect[] {
  const { ground, far } = theme.land;
  const { cell, pad, w: W } = g;
  const k = cell / 32; // detail scale: bigger tiles get more of everything
  const nodes = daily.map.nodes;
  const open = (id: number) => nodes[id]!.kind !== "blocked";
  const seed = daily.day * 31;
  const dirt = mix(ground[1], "#8a6a44", 0.6), dirtEdge = mix(dirt, "#000000", 0.35), clearing = mix(ground[0], dirt, 0.45);
  const treeDark = mix(ground[1], "#000000", 0.35), treeLit = mix(ground[0], treeDark, 0.3), trunk = mix(dirt, "#000000", 0.5);
  const r: Rect[] = [[0, 0, W, W, ground[1]]];
  // Built scenery stands out from the ground: the world's far colour, lifted a little.
  const propColour = mix(far, ground[0], 0.35);
  // The world's trees: pines in a forest world, its own scenery (towers, cacti, coral…) in the rest.
  const tree = (x: number, base: number, h: number, i: number) => theme.land.props === "pines"
    ? pine(x, base, h, treeDark, treeLit, trunk)
    : themed(theme, x, base, i, 0.15 * k * (0.6 + h / 20), propColour);

  // Light patches, tufts and specks, so the ground reads as grass (or sand, or snow).
  for (let i = 0; i < 70 * k * k; i++) r.push([Math.floor(rnd(i, seed + 1) * W), Math.floor(rnd(i, seed + 2) * W), 2 + Math.floor(rnd(i, seed + 3) * 6), 1 + Math.floor(rnd(i, seed + 4) * 2), mix(ground[0], ground[1], 0.5)]);
  for (let i = 0; i < 90 * k * k; i++) {
    const x = Math.floor(rnd(i, seed + 5) * W), y = Math.floor(rnd(i, seed + 6) * W);
    r.push([x, y, 1, 1, ground[0]], [x + 2, y, 1, 1, ground[0]], [x + 1, y + 1, 1, 1, ground[2]]);
  }

  // Trails between every two tiles you can walk between, each with a little bend in it.
  const t = Math.round(3 * Math.sqrt(k)), half = Math.floor(t / 2);
  const trails: Rect[] = [], under: Rect[] = [];
  const trail = (ax: number, ay: number, bx: number, by: number, i: number) => {
    const off = Math.round((rnd(i, seed + 7) * 4 - 2) * k);
    for (const [list, d, c] of [[under, 1, dirtEdge], [trails, 0, dirt]] as const) {
      if (ay === by) {
        const mid = Math.round((ax + bx) / 2);
        list.push([ax - half, ay - half + d, mid - ax + t, t, c], [mid - half, Math.min(ay, ay + off) - half + d, t, Math.abs(off) + t, c], [mid - half, ay + off - half + d, bx - mid + t, t, c]);
      } else {
        const mid = Math.round((ay + by) / 2);
        list.push([ax - half + d, ay - half, t, mid - ay + t, c], [Math.min(ax, ax + off) - half + d, mid - half, Math.abs(off) + t, t, c], [ax + off - half + d, mid - half, t, by - mid + t, c]);
      }
    }
  };
  nodes.forEach((n) => {
    const x = n.id % SIDE, y = Math.floor(n.id / SIDE);
    if (!open(n.id)) return;
    if (x < SIDE - 1 && open(n.id + 1)) trail(centreOf(g, x), centreOf(g, y), centreOf(g, x + 1), centreOf(g, y), n.id * 2);
    if (y < SIDE - 1 && open(n.id + SIDE)) trail(centreOf(g, x), centreOf(g, y), centreOf(g, x), centreOf(g, y + 1), n.id * 2 + 1);
  });
  r.push(...under, ...trails);

  const scenery = (n: MapNode, count: number, keepOut: number) => {
    const cx = centreOf(g, n.id % SIDE), cy = centreOf(g, Math.floor(n.id / SIDE)), i = n.id + seed;
    for (let j = 0; j < count; j++) {
      const dx = Math.round((rnd(i, j * 3 + 20) - 0.5) * cell * 0.86), dy = Math.round((rnd(i, j * 3 + 21) - 0.5) * cell * 0.86);
      // Off the trails (which cross the middle) and clear of what stands there.
      if (Math.abs(dx) < t + 3 * k || Math.abs(dy) < t + 3 * k || Math.hypot(dx, dy) < keepOut) continue;
      const kind = rnd(i, j * 3 + 22), px = cx + dx, py = cy + dy;
      if (kind < 0.45) r.push(...tree(px, py, 6 + Math.floor(rnd(i, j + 40) * 5 * Math.sqrt(k)), i * 7 + j));
      else if (kind < 0.65) r.push([px - 2, py - 2, 5, 2, treeDark], [px - 1, py - 3, 3, 1, treeDark], [px - 1, py - 3, 1, 1, treeLit]);
      else if (kind < 0.82) r.push([px - 1, py - 2, 3, 2, mix(far, "#9a9080", 0.5)], [px - 1, py - 2, 1, 1, mix(far, "#ffffff", 0.5)]);
      else r.push([px - 2, py - 1, 1, 1, theme.tint], [px, py - 2, 1, 1, theme.tint], [px + 2, py - 1, 1, 1, theme.tint]);
    }
  };

  const built: Rect[] = [];
  for (const n of nodes) {
    const x = n.id % SIDE, y = Math.floor(n.id / SIDE), cx = centreOf(g, x), cy = centreOf(g, y);
    if (n.kind === "blocked") {
      // Cliffs: peaks and their shadow, filling the tile.
      r.push([cx - 15 * k, cy + 9 * k, 30 * k, 4 * k, mix(ground[1], "#000000", 0.4)]);
      r.push(...peak(cx - 15 * k, cy + 11 * k, 22 * k, 20 * k, far), ...peak(cx - k, cy + 13 * k, 16 * k, 13 * k, mix(far, "#000000", 0.1)));
      if (k > 1) r.push(...peak(cx + 6 * k, cy + 2 * k, 10 * k, 9 * k, mix(far, "#ffffff", 0.06)));
      continue;
    }
    if (n.kind === "wild") { scenery(n, Math.round(4 * k * k), 0); continue; }
    // A place: a worn clearing for it to stand on, and the odd tree around it.
    r.push([cx - 9 * k, cy - 4 * k, 18 * k, 11 * k, clearing], [cx - 7 * k, cy - 6 * k, 14 * k, 15 * k, clearing], [cx - 6 * k, cy + 7 * k, 12 * k, 2 * k, mix(clearing, "#000000", 0.25)]);
    if (k > 1) scenery(n, Math.round(2 * k * k), 11 * k);
    if (!buildings || !BUILT.has(n.kind)) continue;
    if (n.kind === "gather" && n.gather?.game === "pulls") {
      // Fishing: a pond, its rim and a glint, with reeds.
      const rx = 13 * k, ry = 7 * k, water = mix(far, "#3a7aa0", 0.6);
      for (let dy = -ry; dy <= ry; dy++) {
        const hw = Math.round(rx * Math.sqrt(1 - (dy / ry) ** 2));
        built.push([cx - hw - 1, cy + dy, hw * 2 + 2, 1, mix(water, "#000000", 0.3)], [cx - hw, cy + dy, hw * 2, 1, dy < -ry / 2 ? mix(water, "#ffffff", 0.2) : water]);
      }
      built.push([cx - 4 * k, cy - 2 * k, 5 * k, 1, mix(water, "#ffffff", 0.6)]);
      for (let j = 0; j < 4; j++) built.push([cx + rx - 2 * k + j * 2, cy - 4 * k - j, 1, 5 + j, treeDark], [cx + rx - 2 * k + j * 2, cy - 5 * k - j, 1, 2, trunk]);
      continue;
    }
    const pal: Record<string, string> = {
      r: "#5a2a1e", R: "#8a3a2a", w: "#c8b088", y: "#ffd27a", d: "#4a3020",
      s: "#3a3a42", S: "#55555f", c: "#6a5a4a", g: "#7a7a70", o: "#ff8a30", a: "#3a3a3a",
      t: "#8a847a", T: "#a8a296", p: "#8a847a", b: "#6a645a",
      l: "#6a4a2a", A: "#c8a060",
      m: mix(dirt, "#000000", 0.1), M: mix(dirt, "#ffffff", 0.15), k: "#120c08",
    };
    if (n.kind === "shrine") pal.o = theme.tint;
    if (n.kind === "camp") { pal.t = "#b08a5a"; pal.T = "#7a5a34"; }
    if (n.kind === "start") { pal.a = "#9a7a4a"; pal.p = "#5a4028"; }
    for (const b of buildingAt(n, g)) built.push(...art(b.rows, b.x, b.y, b.px, pal));
  }

  // The forest edge around it all, trees overlapping the land a little.
  r.push([0, 0, W, pad - 3, treeDark], [0, W - pad + 3, W, pad - 3, treeDark], [0, 0, pad - 3, W, treeDark], [W - pad + 3, 0, pad - 3, W, treeDark]);
  for (let x = 0; x < W; x += 5) {
    const h = 5 + Math.floor(rnd(x, seed + 50) * 5);
    r.push(...tree(x + 2, pad + 1, h, x), ...tree(x + 2, W - 2, h, x + 1));
    r.push(...tree(pad - 4, x + 6, h - 2, x + 2), ...tree(W - pad + 4, x + 6, h - 2, x + 3));
  }
  return [...r, ...built];
}

/** The forest's dark green, for what lies past the edge of the map. */
export function forestDark(theme: Theme): string {
  return mix(theme.land.ground[1], "#000000", 0.35);
}

const painted = new Map<string, string>();

/**
 * The land painted once into a picture, one pixel per map pixel, as a data URL
 * (null on the server). Shown scaled up with crisp edges, it costs the page one
 * image instead of thousands of shapes to redraw on every zoom and drag.
 */
export function terrainImage(daily: Daily, theme: Theme, g: Grid, buildings: boolean): string | null {
  if (typeof document === "undefined") return null;
  const key = `${daily.day}|${daily.worldId}|${g.cell}|${buildings}`;
  if (!painted.has(key)) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = g.w;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    for (const [x, y, w, h, c] of terrain(daily, theme, g, buildings)) {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    }
    painted.set(key, canvas.toDataURL());
  }
  return painted.get(key)!;
}

/** terrainImage, once the page is in the browser (the server can't paint). */
export function useTerrainImage(daily: Daily, theme: Theme, g: Grid, buildings: boolean): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setSrc(terrainImage(daily, theme, g, buildings)));
    return () => cancelAnimationFrame(frame);
  }, [daily, theme, g, buildings]);
  return src;
}
