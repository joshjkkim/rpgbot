"use client";

import { Pixels } from "@/app/components/ui/sprite";
import { SPRITES } from "@/app/sprites";
import { rnd } from "./landscape";
import type { Theme } from "./scene";

/*
 * The town and the forge as places, not panels: a market stall with its
 * merchant behind the counter, and a smithy with a glowing hearth, an anvil
 * and the smith, who strikes it (with sparks) each time you forge. Drawn from
 * pixels and the world's colours, so every world gets them. The parts you use
 * (the goods on the shelves, what you lay on the counter, the recipes pinned
 * to the wall, what the merchant or smith says) come in as slots, from dailyRun.
 */

const LINES = {
  merchant: ["Fresh stock today.", "Coin first, questions after.", "Selling? I'll take what you dug up.", "Looking sharp, traveller. Could look sharper.", "Everything's for sale. Almost."],
  smith: ["Bring me the makings and I'll make it.", "Hot iron waits for no one.", "Good steel starts with good finds.", "Mind the sparks."],
};

/** Today's greeting from the merchant or the smith. */
export function greeting(who: keyof typeof LINES, day: number): string {
  return LINES[who][day % LINES[who].length]!;
}

/** A character standing in the scene, breathing, with what they're saying in a speech bubble beside them. */
function Speaker({ grid, name, children }: { grid: string[]; name: string; children: React.ReactNode }) {
  return (
    <div className="relative flex items-end gap-2">
      <svg viewBox="0 0 12 16" width={78} height={104} shapeRendering="crispEdges" aria-hidden className="shrink-0" style={{ animation: "daily-breathe 1.8s steps(2) infinite" }}>
        <Pixels grid={grid} />
      </svg>
      <div className="px-parchment px-shadow mb-8 w-[min(18rem,60vw)] px-2.5 py-1.5 text-xs">
        <b className="font-display text-sm text-[var(--gold)]">{name}</b>
        {children}
      </div>
    </div>
  );
}

/** A crate, in pixels: planks and a cross brace. */
function Crate({ size = 34 }: { size?: number }) {
  return (
    <span className="relative block border-[3px] border-black bg-[#7a4a24] shadow-[inset_0_0_0_3px_#9a6a3a]" style={{ width: size, height: size }}>
      <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-[#4a2c14]" />
      <span className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 bg-[#4a2c14]" />
    </span>
  );
}

/** A shelf: a plank with things standing on it. */
export function Shelf({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-end gap-2 px-1">{children}</div>
      <span className="block h-2.5 w-full border-2 border-black bg-[#7a4a24] shadow-[inset_0_2px_0_#9a6a3a]" />
    </div>
  );
}

/**
 * The market stall: awning in the world's colours, a shelf either side of the merchant, and the counter
 * in front with what you lay on it. `shelves` and `counter` are what you can pick; `says` is the merchant's bubble.
 */
export function Stall({ theme, shelves, counter, says }: { theme: Theme; shelves: [React.ReactNode, React.ReactNode]; counter: React.ReactNode; says: React.ReactNode }) {
  return (
    <div className="relative mx-auto mb-6 w-full max-w-4xl overflow-hidden border-[3px] border-black bg-[#1a1410] px-shadow">
      {/* The awning: stripes, with a scalloped edge. */}
      <div className="flex h-8">
        {Array.from({ length: 14 }, (_, k) => <span key={k} className="flex-1" style={{ background: k % 2 ? "#f2e4bf" : theme.tint }} />)}
      </div>
      <div className="flex">
        {Array.from({ length: 14 }, (_, k) => <span key={k} className="h-3 flex-1 rounded-b-full" style={{ background: k % 2 ? "#f2e4bf" : theme.tint }} />)}
      </div>
      <div className="relative grid min-h-44 grid-cols-1 items-end gap-4 px-8 pt-3 pb-6 md:grid-cols-[1fr_auto_1fr]">
        <div className="order-2 flex justify-center md:order-1">{shelves[0]}</div>
        <div className="order-1 flex justify-center md:order-2"><Speaker grid={SPRITES.merchant} name="The merchant">{says}</Speaker></div>
        <div className="order-3 flex justify-center">{shelves[1]}</div>
      </div>
      {/* The counter, in front of the merchant: crates at the ends, and in the middle what you've laid on it to sell. */}
      <div className="relative border-t-[3px] border-black bg-[#7a4a24] px-4 pt-2 pb-3 shadow-[inset_0_4px_0_#9a6a3a]">
        <div className="absolute bottom-full left-6 hidden items-end gap-1 sm:flex"><Crate /><Crate size={24} /></div>
        <div className="absolute right-6 bottom-full hidden items-end gap-1 sm:flex"><Crate size={24} /><Crate /></div>
        {counter}
      </div>
      {/* The posts holding the awning up. */}
      <span className="absolute top-0 bottom-0 left-2 w-2.5 border-x-2 border-black bg-[#4a2c14]" />
      <span className="absolute top-0 right-2 bottom-0 w-2.5 border-x-2 border-black bg-[#4a2c14]" />
    </div>
  );
}

/**
 * The smithy: a stone wall with `notices` (the recipes) pinned to it, the smith (`says` in the bubble),
 * the anvil with `anvil` on it (the forge button), the hearth's glow, and sparks each time `struck` changes.
 */
export function Smithy({ notices, says, anvil, struck }: { notices: React.ReactNode; says: React.ReactNode; anvil: React.ReactNode; struck: number }) {
  return (
    <div
      className="relative mx-auto mb-6 w-full max-w-4xl overflow-hidden border-[3px] border-black px-shadow"
      style={{
        backgroundColor: "#2a2620",
        // Stone courses: rows of blocks, each row offset half a block.
        backgroundImage: "linear-gradient(#1a1714 2px, transparent 2px), linear-gradient(90deg, #1a1714 2px, transparent 2px), linear-gradient(90deg, #1a1714 2px, transparent 2px)",
        backgroundSize: "100% 22px, 44px 44px, 44px 44px",
        backgroundPosition: "0 0, 0 0, 22px 22px",
      }}
    >
      {/* The recipes, pinned to the wall. */}
      <div className="flex flex-wrap justify-center gap-3 px-6 pt-4">{notices}</div>
      <div className="relative grid grid-cols-1 items-end gap-4 px-6 pt-4 pb-3 md:grid-cols-[auto_1fr_auto]">
        <div key={struck} style={struck ? { animation: "daily-strike 0.35s ease-out" } : undefined}>
          <Speaker grid={SPRITES.smith} name="The smith">{says}</Speaker>
        </div>
        {/* The anvil, the forge button on it, and sparks off it on a strike. */}
        <div className="relative flex flex-col items-center justify-end">
          <div className="mb-1">{anvil}</div>
          <svg viewBox="0 0 12 12" width={72} height={72} shapeRendering="crispEdges" aria-hidden><Pixels grid={SPRITES.anvil} /></svg>
          {struck > 0 && (
            <span key={struck} aria-hidden className="pointer-events-none absolute bottom-14 left-1/2">
              {Array.from({ length: 10 }, (_, k) => {
                const a = Math.PI + (k / 9) * Math.PI, r = 30 + rnd(k, struck % 97) * 30;
                return <span key={k} className="absolute block h-1.5 w-1.5 bg-[#ffd27a]" style={{ ["--dx" as string]: `${Math.cos(a) * r}px`, ["--dy" as string]: `${Math.sin(a) * r}px`, animation: `daily-poof 0.6s ease-out ${rnd(k, 5) * 0.06}s both`, boxShadow: "0 0 4px #ff8a30" }} />;
              })}
            </span>
          )}
        </div>
        {/* The hearth: an arch of stone with the fire's glow. */}
        <div className="relative mx-auto h-28 w-32 rounded-t-full border-[3px] border-black bg-[#120c08]">
          <span className="absolute inset-2 rounded-t-full" style={{ background: "radial-gradient(ellipse at 50% 90%, #ffd27a, #ff8a30 30%, #9a2a10 60%, transparent 75%)", animation: "daily-flicker 0.5s steps(3) infinite" }} />
          {[0, 1, 2].map((j) => <span key={j} className="absolute bottom-6 left-1/2 block h-1.5 w-1.5 bg-[#ffb060]" style={{ animation: `daily-smoke ${1.6 + j * 0.3}s ease-out ${-j * 0.5}s infinite` }} />)}
        </div>
      </div>
      {/* The glow on the floor. */}
      <div className="h-3 border-t-[3px] border-black bg-[#3a2a1c]" style={{ boxShadow: "inset -120px 0 60px -30px rgb(255 138 48 / 0.35)" }} />
    </div>
  );
}
