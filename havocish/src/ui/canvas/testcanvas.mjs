import { createCanvas } from "@napi-rs/canvas";
import { writeFile } from "node:fs/promises";

const W = 900;
const H = 300;

const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");

// make sure nothing weird is set
ctx.globalAlpha = 1;
ctx.textBaseline = "alphabetic";
ctx.textAlign = "left";

// background
ctx.fillStyle = "#0b0f1a";
ctx.fillRect(0, 0, W, H);

// a visible panel (simple rectangle)
ctx.fillStyle = "rgba(255,255,255,0.08)";
ctx.fillRect(40, 40, 820, 220);

// text (make it SUPER obvious)
ctx.fillStyle = "#ffffff";
ctx.font = "bold 56px sans-serif";
ctx.fillText("CANVAS TEXT TEST", 60, 110);

ctx.fillStyle = "#f5d67b";
ctx.font = "bold 40px sans-serif";
ctx.fillText("LEVEL 12", 60, 170);

ctx.fillStyle = "#ffffff";
ctx.font = "28px sans-serif";
ctx.fillText("EXP 2812 / 2915", 60, 220);

// a bright bar
ctx.fillStyle = "#f5d67b";
ctx.fillRect(60, 245, 500, 14);

const buf = canvas.toBuffer("image/png");
await writeFile("./canvas-test.png", buf);

console.log("wrote ./canvas-test.png");
