"use client";

import { useEffect, useRef, useState } from "react";
import { H, PAD, PREVIEW_POS, W, averageColour, drawFace, drawPlayer, lookOf, previewCells, type RGB } from "@content/gridDraw";
import { twemojiUrl } from "@/app/daily/emoji";
import { GRID_ART_SLOTS, gridImagePath, type GridArt, type GridImages } from "@content/gridLooks";

/*
 * Grid as players see it, drawn with the bot's own drawing (@content/gridDraw):
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

export default function GridPreview({ look, colours, art, oreEmojis }: { look?: string; colours?: unknown; art?: GridArt; oreEmojis: string[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ores, setOres] = useState<RGB[]>([]);
  const emojiKey = oreEmojis.join(" ");
  const [artwork, setArtwork] = useState<{ key: string; images: GridImages; failed: string[] }>({ key: "", images: {}, failed: [] });
  const artKey = JSON.stringify(art ?? {});

  useEffect(() => {
    let live = true;
    const paths = JSON.parse(artKey) as GridArt;
    const failed: string[] = [];
    Promise.all((Object.keys(GRID_ART_SLOTS) as (keyof GridArt)[]).map(async (slot) => {
      if (!paths[slot]) return [slot, null];
      const path = gridImagePath(paths[slot]);
      const img = path ? await new Promise<HTMLImageElement | null>((resolve) => {
        const image = new Image();
        const timer = setTimeout(() => resolve(null), 8000);
        image.onload = () => { clearTimeout(timer); resolve(image); };
        image.onerror = () => { clearTimeout(timer); resolve(null); };
        image.src = path;
      }) : null;
      if (!img) failed.push(GRID_ART_SLOTS[slot].label);
      return [slot, img];
    })).then((entries) => {
      if (live) setArtwork({ key: artKey, images: Object.fromEntries(entries), failed });
    });
    return () => { live = false; };
  }, [artKey]);

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
    const { at, px, py } = drawFace(ctx, lookOf(look, JSON.parse(coloursKey)), previewCells(ores), PREVIEW_POS, artwork.key === artKey ? artwork.images : {});
    drawPlayer(ctx, at, px, py);
    ctx.restore();
  }, [look, coloursKey, ores, artwork, artKey]);

  return (
    <div className="space-y-2">
      <canvas
      ref={canvas}
      width={W * SCALE}
      height={H * SCALE}
      className="h-auto w-full max-w-[496px] rounded border border-[var(--border)]"
      style={{ imageRendering: "pixelated" }}
      aria-label="Preview of the Grid game with your scene artwork"
    />
      <p role="status" className="text-xs text-[var(--muted)]">
        {artwork.key !== artKey ? "Loading artwork…" : artwork.failed.length ? `Couldn't load: ${artwork.failed.join(", ")}. The default artwork is shown instead.` : ""}
      </p>
    </div>
  );
}
