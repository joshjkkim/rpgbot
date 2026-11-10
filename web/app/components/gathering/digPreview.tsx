"use client";

import { useEffect, useRef, useState } from "react";
import { H, PAD, PREVIEW_POS, W, averageColour, drawFace, drawPlayer, lookOf, previewCells, type RGB } from "@content/digDraw";
import { twemojiUrl } from "@/app/daily/emoji";

/*
 * Dig as players see it, drawn with the bot's own drawing (@content/digDraw):
 * a run partway in, in this activity's look and colours, its ore coloured by
 * its real finds. Redraws as the owner changes a colour.
 */

const SCALE = 2;
const oreCache = new Map<string, Promise<RGB | null>>();

/** An emoji's main colour, read from the same Twemoji image the bot reads it from. */
function oreColour(emoji: string): Promise<RGB | null> {
  if (!oreCache.has(emoji)) {
    oreCache.set(emoji, new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onerror = () => resolve(null);
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = c.height = 16;
        const x = c.getContext("2d");
        if (!x) return resolve(null);
        x.drawImage(img, 0, 0, 16, 16);
        resolve(averageColour(x.getImageData(0, 0, 16, 16).data));
      };
      img.src = twemojiUrl(emoji);
    }));
  }
  return oreCache.get(emoji)!;
}

export default function DigPreview({ look, colours, oreEmojis }: { look?: string; colours?: unknown; oreEmojis: string[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ores, setOres] = useState<RGB[]>([]);
  const emojiKey = oreEmojis.join(" ");

  useEffect(() => {
    let live = true;
    Promise.all(emojiKey.split(" ").filter(Boolean).map(oreColour)).then((cs) => {
      if (live) setOres(cs.filter((c): c is RGB => !!c));
    });
    return () => { live = false; };
  }, [emojiKey]);

  const coloursKey = JSON.stringify(colours ?? null);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.fillStyle = "#1a140e";
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD, PAD, W - PAD * 2, H - PAD * 2);
    ctx.clip();
    const { at, px, py } = drawFace(ctx, lookOf(look, JSON.parse(coloursKey)), previewCells(ores), PREVIEW_POS);
    drawPlayer(ctx, at, px, py);
    ctx.restore();
  }, [look, coloursKey, ores]);

  return (
    <canvas
      ref={canvas}
      width={W * SCALE}
      height={H * SCALE}
      className="h-auto w-full max-w-[496px] rounded border border-[var(--border)]"
      style={{ imageRendering: "pixelated" }}
      aria-label="Preview of the dig minigame in this look"
    />
  );
}
