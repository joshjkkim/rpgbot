"use client";

import { useEffect, useRef, useState } from "react";
import { W, H } from "@content/gridDraw";
import { gridImagePath } from "@content/gridLooks";
import { drawStationScene, STATION_ART_SLOTS, type StationSceneArgs } from "@content/stationScene";
import { twemojiUrl } from "@/app/daily/emoji";

/*
 * A timed station as players see it in /craft, drawn with the bot's own
 * drawing (@content/stationScene): one slot empty, one partway, one ready.
 */

const SCALE = 2;

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), 8000);
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); resolve(null); };
    image.src = url;
  });
}

const symbolUrl = (emoji: string) => {
  const custom = /^<a?:\w+:(\d+)>$/.exec(emoji.trim());
  return custom ? `https://cdn.discordapp.com/emojis/${custom[1]}.png` : twemojiUrl(emoji);
};

export default function StationPreview({ scene, look, colours, art, slots, symbol }: Omit<StationSceneArgs, "slots"> & { art?: Record<string, string>; slots: number; symbol?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const artKey = JSON.stringify(art ?? {});
  const [loaded, setLoaded] = useState<{ key: string; art: Record<string, unknown>; symbols: Record<string, unknown>; failed: string[] }>({ key: "", art: {}, symbols: {}, failed: [] });
  const key = `${artKey}|${symbol ?? ""}`;

  useEffect(() => {
    let live = true;
    const paths = JSON.parse(artKey) as Record<string, string>;
    const failed: string[] = [];
    Promise.all([
      ...Object.keys(STATION_ART_SLOTS).map(async (slot) => {
        const path = gridImagePath(paths[slot]);
        if (!paths[slot]) return null;
        const img = path ? await loadImage(path) : null;
        if (!img) failed.push(STATION_ART_SLOTS[slot as keyof typeof STATION_ART_SLOTS].label);
        return img ? (["art", slot, img] as const) : null;
      }),
      symbol ? loadImage(symbolUrl(symbol)).then((img) => (img ? (["symbol", symbol, img] as const) : null)) : Promise.resolve(null),
    ]).then((all) => {
      if (!live) return;
      const next = { key, art: {} as Record<string, unknown>, symbols: {} as Record<string, unknown>, failed };
      for (const entry of all) if (entry) next[entry[0] === "art" ? "art" : "symbols"][entry[1]] = entry[2];
      setLoaded(next);
    });
    return () => { live = false; };
  }, [artKey, symbol, key]);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    const ready = loaded.key === key;
    const views: StationSceneArgs["slots"] = Array.from({ length: slots }, (_, i) =>
      i === 0 ? { stage: "empty", progress: 0 }
        : i === slots - 1 ? { stage: "ready", progress: 1, ...(symbol && { symbol }) }
        : { stage: "growing", progress: i / slots, ...(symbol && { symbol }) });
    drawStationScene(ctx, { scene, look, colours, slots: views }, ready ? loaded.art : {}, ready ? loaded.symbols : {});
  }, [scene, look, colours, slots, symbol, loaded, key]);

  return (
    <div className="space-y-2">
      <canvas ref={canvas} width={W * SCALE} height={H * SCALE} className="w-full max-w-[496px] border border-[var(--border)]" style={{ imageRendering: "pixelated" }} />
      {loaded.key === key && loaded.failed.length > 0 && <p className="text-xs text-red-400">Couldn&apos;t load: {loaded.failed.join(", ")}. The default is drawn instead.</p>}
      <p className="text-xs text-[var(--muted)]">A sample of your slots: the first empty, the last ready to collect, the rest partway. Members see their own in /craft.</p>
    </div>
  );
}
