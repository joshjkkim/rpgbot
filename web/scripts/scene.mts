// Draws the landing page night scene. From web/: npx tsx scripts/scene.mts public/scene.png /tmp/preview.png app/scene.ts
import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";

// Low-res pixel scene, upscaled with image-rendering: pixelated on the page.
const W = 400, H = 150;
const c = createCanvas(W, H);
const ctx = c.getContext("2d");

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const px = (x: number, y: number, col: string) => { ctx.fillStyle = col; ctx.fillRect(x | 0, y | 0, 1, 1); };
// Pixels the page animates: left out of the PNG and exported as coordinates.
const stars: number[][] = [], windows: number[][] = [], flies: number[][] = [];
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

// Sky: dithered bands from night to an ember horizon.
const SKY = ["#0d0b10", "#141019", "#1c1520", "#271b22", "#3a2524", "#553326", "#6e4429"];
for (let y = 0; y < H; y++) {
  const t = Math.min(1, y / (H * 0.78)) * (SKY.length - 1);
  const i = Math.floor(t), f = t - i;
  for (let x = 0; x < W; x++) {
    const next = f * 16 > BAYER[y % 4][x % 4] ? Math.min(i + 1, SKY.length - 1) : i;
    px(x, y, SKY[next]);
  }
}

// Stars in the dark upper sky.
for (let n = 0; n < 90; n++) {
  const x = rnd() * W, y = rnd() * H * 0.45;
  if (x > 90 && x < 310 && y > 14) continue;   // keep the headline area clear, stars there read as punctuation
  if (rnd() > 0.7) stars.push([x | 0, y | 0]); else px(x, y, "#7d7280");
}

// Moon with a soft dithered halo.
const MX = 300, MY = 26, MR = 9;
for (let y = -MR * 3; y <= MR * 3; y++) for (let x = -MR * 3; x <= MR * 3; x++) {
  const d = Math.hypot(x, y);
  if (d <= MR) px(MX + x, MY + y, (x + 3) * (x + 3) + (y - 2) * (y - 2) < 18 ? "#d9cba0" : "#efe3bd");
  else if (d < MR * 2.6 && (BAYER[(MY + y) & 3][(MX + x) & 3] / 16) < (1 - d / (MR * 2.6)) * 0.5) px(MX + x, MY + y, "#3b3040");
}

// A ridge line: height per column from a few summed sines plus noise.
function ridge(base: number, amp: number, freqs: number[], col: string, jag = 0) {
  const phase = freqs.map(() => rnd() * 10);
  const tops: number[] = [];
  for (let x = 0; x < W; x++) {
    let h = 0;
    freqs.forEach((f, k) => (h += Math.sin(x * f + phase[k]) / (k + 1)));
    const top = Math.round(base - h * amp - (jag ? rnd() * jag : 0));
    tops.push(top);
    ctx.fillStyle = col;
    ctx.fillRect(x, top, 1, H - top);
  }
  return tops;
}

ridge(H * 0.58, 16, [0.011, 0.031, 0.07], "#2a1d24", 1);   // far peaks
// Snow caps on the far peaks: lighten the top pixel where the ridge is high.
const mid = ridge(H * 0.70, 9, [0.017, 0.043], "#1d151b");   // mid hills

// Castle on the mid hills, left of centre, with lit windows.
const CX = 92, base = mid[CX] + 2, K = "#130e12";
// A rounded mound under the castle so it sits on the hill instead of floating.
for (let x = -40; x <= 40; x++) {
  const top = base - 1 + Math.round((x / 40) ** 2 * 6);
  ctx.fillStyle = "#1d151b";
  ctx.fillRect(CX + x, Math.min(top, mid[CX + x]), 1, H);
}
const block = (x: number, y: number, w: number, h: number) => { ctx.fillStyle = K; ctx.fillRect(CX + x, base - y - h, w, h); };
const crenel = (x: number, y: number, w: number) => { for (let i = 0; i < w; i += 2) block(x + i, y, 1, 2); };
block(-22, 0, 44, 14); crenel(-22, 14, 44);                    // curtain wall
block(-26, 0, 8, 26); crenel(-26, 26, 8);                      // left tower
block(18, 0, 8, 22); crenel(18, 22, 8);                        // right tower
block(-6, 0, 12, 34); crenel(-6, 34, 12);                      // keep
block(-1, 36, 2, 8); px(CX + 1, base - 45, "#8a3b2c"); px(CX + 2, base - 45, "#8a3b2c"); px(CX + 2, base - 44, "#8a3b2c"); // flag
for (const [x, y] of [[-3, 24], [2, 24], [-3, 16], [-23, 18], [20, 14], [-12, 6], [10, 6]]) {
  windows.push([CX + x, base - y]); px(CX + x, base - y, "#6b4424"); px(CX + x, base - y + 1, "#a8722e");
}
// Gate glow.
block(-2, 0, 4, 1);
px(CX - 1, base - 2, "#6b4424"); px(CX, base - 2, "#6b4424"); px(CX - 1, base - 3, "#6b4424"); px(CX, base - 3, "#6b4424");

// Foreground hills and a pine treeline.
const fg = ridge(H * 0.86, 5, [0.023, 0.06], "#0f0b0e");
for (let x = 0; x < W; x += 3 + Math.floor(rnd() * 4)) {
  if (x > CX - 40 && x < CX + 40 && rnd() < 0.7) continue;    // keep the castle visible
  const h = 8 + Math.floor(rnd() * 14), top = fg[x] - h;
  for (let y = 0; y < h; y++) {
    const half = Math.floor((y / h) * (h / 3.2)) + (y % 3 === 2 ? 0 : 1) - 1;
    ctx.fillStyle = "#0b080a";
    ctx.fillRect(x - half, top + y, half * 2 + 1, 1);
  }
}

// Fireflies / embers over the treeline.
for (let n = 0; n < 14; n++) { flies.push([rnd() * W | 0, H * 0.72 + rnd() * H * 0.2 | 0]); rnd(); }

writeFileSync(process.argv[2], c.toBuffer("image/png"));
writeFileSync(process.argv[4], `// Generated with the scene PNG: the pixels the landing page animates on top of it.
export const SCENE = { w: ${W}, h: ${H} };
export const STARS = ${JSON.stringify(stars)};
export const WINDOWS = ${JSON.stringify(windows)};
export const FIREFLIES = ${JSON.stringify(flies)};
`);
// A 4x preview to look at.
const big = createCanvas(W * 4, H * 4);
const b = big.getContext("2d");
b.imageSmoothingEnabled = false;
b.drawImage(c, 0, 0, W * 4, H * 4);
writeFileSync(process.argv[3], big.toBuffer("image/png"));
