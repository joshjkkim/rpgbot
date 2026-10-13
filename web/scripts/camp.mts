// Draws the landing page campfire. From web/: npx tsx scripts/camp.mts public/campfire.png /tmp/preview.png
import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";

// Campfire scene for the bottom of the landing page. Flames are animated by the page.
const W = 320, H = 90, FX = 160, GROUND = 70;
const c = createCanvas(W, H);
const ctx = c.getContext("2d");
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const px = (x: number, y: number, col: string) => { ctx.fillStyle = col; ctx.fillRect(x | 0, y | 0, 1, 1); };
const rect = (x: number, y: number, w: number, h: number, col: string) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

// Sky the colour of the page, so the scene starts seamlessly.
// Sky left transparent so the page background shows through with no seam.
for (let n = 0; n < 40; n++) {
  const x = rnd() * W, y = rnd() * GROUND * 0.7;
  if (x > 70 && x < 250 && y < 30) continue;   // the heading sits here
  px(x, y, rnd() > 0.8 ? "#8a7f70" : "#3a3330");
}

// Ground: rolling dark hill line.
for (let x = 0; x < W; x++) {
  const top = Math.round(GROUND - 3 * Math.sin(x * 0.02 + 1) - 2 * Math.sin(x * 0.07));
  rect(x, top, 1, H - top, "#0a0807");
}

// Warm light on the ground around the fire, dithered so it stays pixel-like.
for (let y = GROUND - 34; y < H; y++) for (let x = FX - 75; x < FX + 75; x++) {
  const d = Math.hypot((x - FX) / 1.6, (y - GROUND) * 1.4) / 46;
  if (d >= 1) continue;
  const above = y < GROUND - 3 * Math.sin(x * 0.02 + 1) - 2 * Math.sin(x * 0.07);
  const level = (1 - d) * 16;
  if (level > BAYER[y & 3][x & 3]) px(x, y, above ? (level > 9 ? "#3b2516" : "#22160d") : (level > 10 ? "#5a3518" : "#33200f"));
}

// Tent, left of the fire.
const TX = 92;
for (let y = 0; y < 22; y++) {
  const half = Math.floor(y * 0.9);
  rect(TX - half, GROUND - 22 + y, half * 2 + 1, 1, "#1c140e");
  px(TX + half, GROUND - 22 + y, "#4a2e18");           // lit side
}
rect(TX - 1, GROUND - 8, 3, 8, "#060404");             // tent opening
rect(TX, GROUND - 25, 1, 4, "#16100c");                // pole

// Seated adventurers, lit on the side facing the fire.
function sitter(x: number, facing: 1 | -1) {
  rect(x - 2, GROUND - 9, 5, 7, "#060404");            // body
  rect(x - 1, GROUND - 12, 3, 3, "#060404");           // head
  rect(x + facing * 2, GROUND - 9, 1, 7, "#7a4a24");   // lit edge
  px(x + facing, GROUND - 11, "#7a4a24");
  rect(x - 3, GROUND - 2, 7, 2, "#060404");            // legs
}
sitter(FX - 18, 1);
sitter(FX + 19, -1);

// Sword planted in the ground, right side.
const SX = 222;
rect(SX, GROUND - 16, 1, 14, "#8a8e98");
px(SX, GROUND - 17, "#c9ccd4");
rect(SX - 2, GROUND - 12, 5, 1, "#a8722e");
rect(SX, GROUND - 11, 1, 1, "#4a2c14");

// Fire pit: stones and crossed logs.
for (const dx of [-6, -4, -2, 0, 2, 4, 6]) rect(FX + dx - 1, GROUND - 1, 2, 2, dx % 4 ? "#3d3530" : "#2a2420");
for (let i = 0; i < 9; i++) { px(FX - 5 + i, GROUND - 2 - (i >> 2), "#4a2c14"); px(FX + 5 - i, GROUND - 2 - (i >> 2), "#5a361a"); }

writeFileSync(process.argv[2], c.toBuffer("image/png"));
const big = createCanvas(W * 4, H * 4); const b = big.getContext("2d");
b.imageSmoothingEnabled = false; b.drawImage(c, 0, 0, W * 4, H * 4);
writeFileSync(process.argv[3], big.toBuffer("image/png"));
console.log(JSON.stringify({ W, H, FX, GROUND }));
