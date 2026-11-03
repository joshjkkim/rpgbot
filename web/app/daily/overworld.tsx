"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { distance, SIDE, WALK_HOURS, type Daily, type MapNode, type MapState } from "@content/daily";
import { Pixels } from "@/app/components/ui/sprite";
import { SPRITES } from "@/app/sprites";
import { Emoji } from "./emoji";
import { centreOf, grid, useTerrainImage } from "./terrain";
import type { Theme } from "./scene";

/*
 * The whole day's map (opened from the 🗺️ button): the land drawn small
 * (terrain.ts), each place marked with its emoji, and a note beside the
 * chosen one to travel there from.
 */

/** Hours as people say them: "3h", "1½h", or in words, "14½ hours". */
export function hrs(h: number, words = false): string {
  const whole = Math.floor(h), half = h - whole >= 0.5 ? "½" : "";
  const n = whole === 0 && half ? half : `${whole}${half}`;
  return words ? `${n} hour${h === 1 ? "" : "s"}` : `${n}h`;
}

const G = grid(32);
const { cell: CELL, pad: PAD, w: W } = G;
const pct = (px: number) => `${(px / W) * 100}%`;
const centre = (i: number) => centreOf(G, i);

export function Overworld({ daily, theme, s, selected, onSelect, walking, popup, wanted }: {
  daily: Daily; theme: Theme; s: MapState; selected: number; onSelect: (id: number) => void; walking: boolean;
  /** What's shown beside the chosen tile (wide screens). */
  popup: React.ReactNode;
  /** Tiles with something a forge recipe still needs. */
  wanted: (node: MapNode) => boolean;
}) {
  const [shut, setShut] = useState(false);
  const src = useTerrainImage(daily, theme, G, false);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setShut(true); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  const sx = selected % SIDE, sy = Math.floor(selected / SIDE);
  const hx = s.at % SIDE, hy = Math.floor(s.at / SIDE);
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[min(92vw,720px,calc(100dvh_-_7rem))] select-none px-shadow">
      {src && (
          // eslint-disable-next-line @next/next/no-img-element -- painted in the browser (terrain.ts)
          <img src={src} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full [image-rendering:pixelated]" />
        )}

      {/* Cloud shadows drifting over the land. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {[0, 1].map((k) => (
          <div key={k} className="absolute h-[22%] w-[38%] rounded-[40%] bg-black/15" style={{ top: `${18 + k * 42}%`, animation: `daily-cloud ${70 + k * 25}s linear -${k * 40}s infinite` }} />
        ))}
      </div>

      {daily.map.nodes.map((node) => {
        if (node.kind === "blocked") return null;
        const x = node.id % SIDE, y = Math.floor(node.id / SIDE);
        const done = s.done.includes(node.id);
        const away = distance(daily.map, s.at, node.id);
        const place = node.kind !== "wild";
        return (
          <button
            key={node.id} type="button" disabled={walking} title={node.name}
            onClick={() => { if (node.id === selected) setShut(!shut); else { onSelect(node.id); setShut(false); } }}
            className="group absolute flex items-center justify-center outline-none"
            style={{ left: pct(PAD + x * CELL), top: pct(PAD + y * CELL), width: pct(CELL), height: pct(CELL) }}
          >
            {/* Hover: faint corners, like the chosen tile's cursor. */}
            <span aria-hidden className="pointer-events-none absolute inset-[6%] border-2 border-dashed border-[#f2e4bf]/0 transition-colors group-hover:border-[#f2e4bf]/35 group-focus-visible:border-[#f2e4bf]/60" />
            {place && (
              <span className={`relative z-10 w-[62%] -translate-y-[8%] transition ${done ? "opacity-45 grayscale" : ""}`}>
                <Emoji e={node.emoji} size={56} className="h-auto w-full" />
              </span>
            )}
            {node.kind === "elite" && !done && (
              <span className="absolute top-[6%] left-[8%] z-20 bg-[#7a1e14] px-1 font-display text-[9px] leading-tight text-[#f2d0b0] shadow-[2px_2px_0_#000] sm:text-[10px]">ELITE</span>
            )}
            {node.kind === "lair" && !done && (
              <span className="absolute top-[4%] left-[8%] z-20 bg-[#5a0e0a] px-1 font-display text-[9px] leading-tight text-[#ffd27a] shadow-[2px_2px_0_#000] sm:text-[10px]">QUEST</span>
            )}
            {done && <span className="absolute right-[10%] bottom-[10%] z-20 text-xs text-[#f2e4bf] [text-shadow:1px_1px_0_#000]">✓</span>}
            {wanted(node) && <span title="Has something a forge recipe needs" className="absolute bottom-[6%] left-[8%] z-20 text-[11px] [text-shadow:1px_1px_0_#000]">⚒️</span>}
            {place && node.id !== s.at && Number.isFinite(away) && (
              <span className="absolute bottom-[4%] left-1/2 z-20 -translate-x-1/2 bg-black/55 px-1 text-[9px] tabular-nums text-[#f2e4bf] sm:text-[10px]">{hrs(away * WALK_HOURS)}</span>
            )}
          </button>
        );
      })}

      {/* The chosen tile: gold corners, breathing. */}
      <span
        aria-hidden className="pointer-events-none absolute z-20"
        style={{ left: pct(PAD + sx * CELL), top: pct(PAD + sy * CELL), width: pct(CELL), height: pct(CELL), animation: "daily-cursor 1.6s ease-in-out infinite" }}
      >
        {["top-0 left-0 border-t-4 border-l-4", "top-0 right-0 border-t-4 border-r-4", "bottom-0 left-0 border-b-4 border-l-4", "right-0 bottom-0 border-r-4 border-b-4"].map((c) => (
          <span key={c} className={`absolute h-[22%] w-[22%] border-[#ecd394] drop-shadow-[2px_2px_0_#000] ${c}`} />
        ))}
      </span>

      {/* You: walking the trails. */}
      <motion.div
        className="pointer-events-none absolute z-30 w-[7%] -translate-x-1/2 -translate-y-[85%]"
        initial={false}
        animate={{ left: pct(centre(hx) + 7), top: pct(centre(hy) + 4) }}
        transition={{ duration: 0.2, ease: "linear" }}
      >
        <motion.svg viewBox="0 0 12 16" className="h-auto w-full drop-shadow-[2px_2px_0_rgb(0_0_0/0.5)]" shapeRendering="crispEdges" aria-hidden
          animate={walking ? { y: [0, -3, 0] } : { y: 0 }} transition={walking ? { duration: 0.22, repeat: Infinity } : {}}>
          <Pixels grid={SPRITES.hero} />
        </motion.svg>
      </motion.div>

      {/* The chosen tile's note, beside it on wide screens. */}
      {popup && !shut && (
        <div
          className="absolute z-40 hidden w-[300px] lg:block"
          style={{
            // Beside the tile, towards the middle, so it never runs off the screen.
            ...(sx <= 2 ? { left: pct(PAD + (sx + 1) * CELL + 2) } : { right: pct(W - (PAD + sx * CELL) + 2) }),
            ...(sy <= 2 ? { top: pct(PAD + sy * CELL) } : { bottom: pct(W - (PAD + (sy + 1) * CELL)) }),
          }}
        >
          {popup}
        </div>
      )}
    </div>
  );
}
