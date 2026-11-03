"use client";

import { useEffect, useState } from "react";

/*
 * Emoji drawn as pixel art, to sit with the site's sprites (app/sprites.ts):
 * the Twemoji image (the set the bot's battle scenes use) is shrunk onto a
 * small grid, its edges made hard, and shown scaled up without smoothing,
 * with a dark outline. Small ones are left as they are. Falls back to the
 * device's own emoji if the image can't load.
 */

const TWEMOJI = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72";

/** Twemoji's file for an emoji: its code points in hex, dropping FE0F unless it's a ZWJ sequence (as Twemoji names them). */
export function twemojiUrl(emoji: string): string {
  const points = [...emoji.trim()].map((c) => c.codePointAt(0)!.toString(16));
  const name = (points.includes("200d") ? points : points.filter((p) => p !== "fe0f")).join("-");
  return `${TWEMOJI}/${name}.png`;
}

const pixelated = new Map<string, Promise<string | null>>();

/** The emoji shrunk to `grid` pixels a side with hard edges, as a data URL; null when it can't be drawn. */
function pixelate(emoji: string, grid: number): Promise<string | null> {
  const key = `${emoji}|${grid}`;
  if (!pixelated.has(key)) {
    pixelated.set(key, new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onerror = () => resolve(null);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = grid;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, grid, grid);
        const data = ctx.getImageData(0, 0, grid, grid);
        // Every pixel either solid or gone: no soft edges at sprite size.
        for (let i = 3; i < data.data.length; i += 4) data.data[i] = data.data[i]! > 110 ? 255 : 0;
        ctx.putImageData(data, 0, 0);
        resolve(canvas.toDataURL());
      };
      img.src = twemojiUrl(emoji);
    }));
  }
  return pixelated.get(key)!;
}

export function Emoji({ e, size, className = "" }: { e: string; size: number; className?: string }) {
  const grid = size >= 64 ? 24 : size >= 40 ? 20 : 16;
  const pixel = size >= 22;
  const [src, setSrc] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!pixel || !e.trim()) return;
    let live = true;
    pixelate(e, grid).then((url) => { if (live) setSrc(url); });
    return () => { live = false; };
  }, [e, grid, pixel]);

  const fallback = <span className={className} style={{ fontSize: size * 0.85, lineHeight: 1, width: size, textAlign: "center", display: "inline-block" }}>{e}</span>;
  if (!e.trim() || src === null) return fallback;
  if (!pixel) {
    // eslint-disable-next-line @next/next/no-img-element -- a small PNG from the CDN
    return <img src={twemojiUrl(e)} alt={e} width={size} height={size} draggable={false} className={`inline-block select-none ${className}`} />;
  }
  const u = Math.max(1, Math.round(size / grid));
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- a canvas-made data URL
    <img
      src={src} alt={e} width={size} height={size} draggable={false}
      className={`inline-block select-none ${className}`}
      style={{ imageRendering: "pixelated", filter: `drop-shadow(${u}px 0 0 #120d0a) drop-shadow(-${u}px 0 0 #120d0a) drop-shadow(0 ${u}px 0 #120d0a) drop-shadow(0 -${u}px 0 #120d0a)` }}
    />
  ) : fallback; // the device's own emoji while the pixel version is made, so nothing is ever blank
}
