/*
 * A world's landscape in pixel art, generated rather than drawn: a banded
 * sky, a far ridge, a row of the world's own scenery (pines, towers, dunes,
 * coral…) and the ground the fight stands on. Drawn small and scaled up with
 * crisp edges, like the castle scene on the home page. Everything comes from
 * fixed numbers, so the server and the browser draw the same thing.
 */

export type Props = "pines" | "towers" | "dunes" | "coral" | "crystals" | "mushrooms" | "spires" | "bamboo" | "candy" | "masts" | "rocks" | "cacti";
export type Land = { far: string; mid: string; ground: [string, string, string]; props: Props; windows?: string };

/** The line the fighters stand on, as a share of the screen's height from the top. */
export const HORIZON = 0.68;

const W = 320; // the sky's width in pixels; the height follows the screen
const H = 140;

export function rnd(i: number, salt: number): number {
  const x = Math.sin(i * 91.17 + salt * 12.53) * 15731.743;
  return x - Math.floor(x);
}

/** Mixes two #rrggbb colours, t from 0 to 1. */
export function mix(a: string, b: string, t: number): string {
  const p = (c: string, i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, "0")).join("")}`;
}

type Rect = [number, number, number, number, string?]; // x, y, w, h, colour (else the layer's)

/** One piece of scenery standing on `base`, `x` across, as rects. */
export function prop(kind: Props, x: number, base: number, i: number, windows: string | undefined): Rect[] {
  const s = 0.7 + rnd(i, 3) * 0.6; // size
  const r: Rect[] = [];
  switch (kind) {
    case "pines": {
      const h = Math.round(22 * s);
      r.push([x + 3, base - 4, 2, 4]);
      for (let k = 0; k < h; k += 2) { const w = Math.round((h - k) * 0.45) + 1; r.push([x + 4 - w, base - 4 - k - 2, w * 2, 2]); }
      break;
    }
    case "towers": {
      const w = 8 + Math.round(rnd(i, 4) * 10), h = Math.round(18 + 30 * s);
      r.push([x, base - h, w, h]);
      if (rnd(i, 5) > 0.5) r.push([x + Math.floor(w / 2), base - h - 6, 1, 6]);
      if (windows) for (let wy = base - h + 3; wy < base - 3; wy += 4) for (let wx = x + 2; wx < x + w - 2; wx += 3) if (rnd(wx * 7 + wy, i) > 0.62) r.push([wx, wy, 1, 1, windows]);
      break;
    }
    case "dunes": {
      const w = 30 + Math.round(30 * s), h = Math.round(6 + 8 * s);
      for (let k = 0; k < h; k++) { const ww = Math.round(w * (1 - k / h)); r.push([x + Math.round((w - ww) / 2), base - k - 1, ww, 1]); }
      break;
    }
    case "cacti": {
      const h = Math.round(10 + 10 * s);
      r.push([x + 2, base - h, 3, h], [x, base - h + 4, 2, 2], [x, base - h + 1, 1, 4], [x + 5, base - h + 6, 2, 2], [x + 6, base - h + 3, 1, 4]);
      break;
    }
    case "coral": {
      const h = Math.round(10 + 14 * s);
      r.push([x + 3, base - h, 2, h], [x, base - h + 5, 3, 2], [x, base - h + 2, 2, 4], [x + 5, base - h + 8, 3, 2], [x + 7, base - h + 4, 2, 5]);
      break;
    }
    case "crystals": {
      const h = Math.round(12 + 18 * s);
      for (let k = 0; k < h; k++) { const w = Math.max(1, Math.round(4 * Math.min(k, h - k) / (h / 2))); r.push([x + 4 - Math.floor(w / 2), base - h + k, w, 1]); }
      break;
    }
    case "mushrooms": {
      const h = Math.round(10 + 16 * s), w = Math.round(12 + 8 * s);
      r.push([x + Math.floor(w / 2) - 1, base - h, 3, h]);
      for (let k = 0; k < 5; k++) { const ww = w - Math.abs(2 - k) * 3; r.push([x + Math.round((w - ww) / 2), base - h - 5 + k, ww, 1]); }
      if (windows) r.push([x + 3, base - h - 3, 1, 1, windows], [x + w - 4, base - h - 2, 1, 1, windows]);
      break;
    }
    case "spires": {
      const h = Math.round(24 + 30 * s), w = 6;
      r.push([x, base - h, w, h], [x + 1, base - h - 3, 4, 3], [x + 2, base - h - 7, 2, 4]);
      if (windows) for (let wy = base - h + 4; wy < base - 4; wy += 7) r.push([x + 2, wy, 2, 2, windows]);
      break;
    }
    case "bamboo": {
      const h = Math.round(26 + 24 * s);
      r.push([x, base - h, 2, h]);
      for (let k = base - h + 5; k < base; k += 6) r.push([x - 1, k, 4, 1]);
      r.push([x + 2, base - h + 4, 4, 1], [x - 4, base - h + 10, 4, 1]);
      break;
    }
    case "candy": {
      const h = Math.round(12 + 14 * s);
      r.push([x + 3, base - h, 1, h], [x + 1, base - h - 5, 5, 5], [x, base - h - 4, 7, 3]);
      if (windows) r.push([x + 2, base - h - 4, 1, 1, windows], [x + 4, base - h - 3, 1, 1, windows]);
      break;
    }
    case "masts": {
      const h = Math.round(16 + 28 * s);
      r.push([x + 3, base - h, 1, h], [x, base - h + 6, 7, 1], [x + 1, base - 6, 5, 6]);
      if (windows) r.push([x + 3, base - h - 1, 1, 1, windows]);
      break;
    }
    case "rocks": {
      const w = Math.round(10 + 12 * s), h = Math.round(5 + 8 * s);
      for (let k = 0; k < h; k++) { const ww = Math.round(w * (1 - (k / h) ** 2)); r.push([x + Math.round((w - ww) / 2), base - k - 1, ww, 1]); }
      break;
    }
  }
  return r;
}

export function Landscape({ land, sky }: { land: Land; sky: [string, string, string] }) {
  // The sky in eight hard bands, top colour to horizon colour.
  const bands = Array.from({ length: 8 }, (_, i) => mix(sky[0], sky[1], i / 7));
  // The far ridge: a stepped line across the horizon.
  const ridge: Rect[] = [];
  for (let x = 0; x < W; x += 4) {
    const h = Math.round(10 + 9 * Math.sin(x / 37) + 6 * Math.sin(x / 13 + 2) + rnd(x, 1) * 3);
    ridge.push([x, H - h - 6, 4, h + 6]);
  }
  // The scenery: spaced along the horizon, never in the middle where the fight is.
  const props: Rect[] = [];
  let i = 0;
  for (let x = -4; x < W; x += 14 + Math.round(rnd(i, 2) * 22), i++) {
    if (Math.abs(x - W / 2) < 46 && land.props !== "dunes" && land.props !== "rocks") continue;
    props.push(...prop(land.props, x, H, i, land.windows));
  }

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: sky[0] }}>
      <svg className="absolute inset-x-0 top-0 h-[68%] w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" shapeRendering="crispEdges">
        {bands.map((c, b) => <rect key={b} x={0} y={(b * H) / 8} width={W} height={H / 8 + 1} fill={c} />)}
        {ridge.map(([x, y, w, h], k) => <rect key={`r${k}`} x={x} y={y} width={w} height={h} fill={land.far} />)}
        {props.map(([x, y, w, h, c], k) => <rect key={`p${k}`} x={x} y={y} width={w} height={h} fill={c ?? land.mid} />)}
      </svg>
      {/* The ground: a lit edge, then earth with a few specks, in the same big pixels. */}
      <svg className="absolute inset-x-0 bottom-0 h-[32%] w-full" viewBox="0 0 320 70" preserveAspectRatio="xMidYMin slice" shapeRendering="crispEdges">
        <rect x={0} y={0} width={320} height={70} fill={land.ground[1]} />
        <rect x={0} y={0} width={320} height={2} fill={land.ground[0]} />
        <rect x={0} y={2} width={320} height={2} fill={mix(land.ground[0], land.ground[1], 0.5)} />
        {Array.from({ length: 70 }, (_, k) => (
          <rect key={k} x={Math.floor(rnd(k, 7) * 320)} y={5 + Math.floor(rnd(k, 8) * 60)} width={rnd(k, 9) > 0.7 ? 2 : 1} height={1} fill={land.ground[2]} />
        ))}
        <rect x={0} y={30} width={320} height={40} fill="#000" opacity={0.25} />
      </svg>
    </div>
  );
}
