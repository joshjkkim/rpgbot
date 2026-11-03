"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { distance, neighbours, SIDE, WALK_HOURS, type Daily, type MapNode, type MapState } from "@content/daily";
import { Pixels } from "@/app/components/ui/sprite";
import { SPRITES } from "@/app/sprites";
import { Emoji } from "./emoji";
import { rnd } from "./landscape";
import { hrs } from "./overworld";
import { Weather, type Theme } from "./scene";
import { BUILT, buildingAt, centreOf, forestDark, grid, useTerrainImage } from "./terrain";

/*
 * The day as a place you walk through: the land drawn big around the hero,
 * the camera following them, the rest out of sight past a dark vignette (the
 * 🗺️ map shows all of it). Places stand on the land as buildings (terrain.ts)
 * or as creatures, with nameplates. Click a spot to see what it is; click it
 * again to walk there.
 */

const G = grid(96);
/** How much of the land a screen shows to start with: its shorter side fits this many tiles. */
const TILES_IN_VIEW = 3.2;
/** How far in and out the wheel goes, in tiles across the shorter side: out to the whole day. */
const ZOOM_IN = 1.8, ZOOM_OUT = G.w / G.cell + 0.3;

/** How long the hero takes to walk a tile. */
export const STEP_SECONDS = 0.45;

/** The hero mid-step: the sprite (app/sprites.ts) with its left, then its right, leg lifted. */
const HERO_STEP = [
  [".kbbkbbk....", ".knnknnk....", ".kkkknnk....", ".....kkk...."],
  [".kbbkbbk....", ".knnknnk....", ".knnkkkk....", ".kkk........"],
].map((legs) => [...SPRITES.hero.slice(0, 12), ...legs]);

/** Set once the tour has been seen (or skipped), so it plays on a first visit only. */
const TOUR_KEY = "daily-tour-seen";

/** The tour's stops on today's map: each kind of place, in the order a day goes, and last the clock. */
function tourSteps(daily: Daily): Array<{ node: number | null; title: string; text: string; clock?: boolean }> {
  const find = (kind: MapNode["kind"]) => daily.map.nodes.find((n) => n.kind === kind);
  const stop = (n: MapNode | undefined, title: string, text: string) => (n ? [{ node: n.id, title, text }] : []);
  const lair = find("lair");
  return [
    ...stop(find("start"), "You start here", "Pick your four moves first."),
    ...stop(find("gather"), "Gathering spots", "Each is a quick minigame. Finds sell or craft."),
    ...stop(find("town"), "The town", "Sell what you find. Buy gear and potions."),
    ...stop(find("forge"), "The forge", "Craft gear from the recipes in your journal."),
    ...stop(find("elite"), "Elites", "Tougher than the rest. Beat one to choose a relic."),
    ...stop(lair, `${lair?.enemy?.name ?? "The boss"}`, "Your goal. Its traits are in the journal."),
    { node: null, title: "The clock", text: "Everything takes time. Win as fast as you can.", clock: true },
  ];
}

/** Something won, floated up over the hero (dailyRun.tsx makes them from what an action changed). */
export type Reward = { id: number; text: string; colour: string; level?: boolean };

/** The light at an hour of the run, as a colour the land is multiplied by; and how far into night it is (0 by day, 1 at night). */
const LIGHT: Array<[number, [number, number, number, number]]> = [
  [0, [255, 190, 160, 0.32]], // dawn
  [2, [255, 255, 255, 0]],
  [12, [255, 255, 255, 0]],
  [15, [255, 205, 140, 0.28]], // golden afternoon
  [17, [235, 130, 95, 0.46]], // dusk
  [18.5, [70, 80, 150, 0.62]], // night (the clock's moon starts at 18)
  [24, [45, 55, 125, 0.72]],
];
export function lightAt(h: number): { shade: string; night: number } {
  const i = Math.max(0, LIGHT.findIndex(([at]) => at > h) - 1);
  const [a, ca] = LIGHT[i]!, [b, cb] = LIGHT[Math.min(i + 1, LIGHT.length - 1)]!;
  const t = b > a ? Math.min(1, Math.max(0, (h - a) / (b - a))) : 0;
  const [r, g, bl, al] = ca.map((v, k) => v + (cb[k]! - v) * t) as [number, number, number, number];
  return { shade: `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(bl)} / ${al.toFixed(2)})`, night: Math.min(1, Math.max(0, (h - 16.5) / 2)) };
}
/** What glows at night, and how far its light reaches (in tiles). */
const GLOWS: Partial<Record<MapNode["kind"], { colour: string; r: number }>> = {
  town: { colour: "rgb(255 190 90 / 0.6)", r: 0.55 },
  forge: { colour: "rgb(255 120 40 / 0.65)", r: 0.45 },
  camp: { colour: "rgb(255 140 50 / 0.75)", r: 0.6 },
  shrine: { colour: "", r: 0.45 },
  lair: { colour: "rgb(200 30 20 / 0.55)", r: 0.55 },
};

const NAME_COLOUR: Partial<Record<MapNode["kind"], string>> = { enemy: "#f0a090", elite: "#ffc070", lair: "#ff7060" };

export function World({ daily, theme, s, selected, onSelect, onWalk, walking, wanted, rewards, onRewardsShown, engaging = false, poof = null, tourAsked = 0, moment = null, finale = null, ready = true }: {
  daily: Daily; theme: Theme; s: MapState; selected: number; walking: boolean;
  onSelect: (id: number) => void;
  onWalk: (id: number) => void;
  /** Tiles with something a forge recipe still needs. */
  wanted: (node: MapNode) => boolean;
  /** What the last action won, to float up over the hero; cleared with onRewardsShown once shown. */
  rewards: Reward[];
  onRewardsShown: () => void;
  /** A fight is starting here: the creature on your tile lunges at you. */
  engaging?: boolean;
  /** A creature just beaten, on this tile: it bursts into dust. */
  poof?: number | null;
  /** Goes up each time the player asks for the tour again (the HUD's ❔). */
  tourAsked?: number;
  /** Something just done where the hero stands: resting at the camp, or praying at the shrine. `at` keys it. */
  moment?: { kind: "rest" | "pray"; at: number } | null;
  /** The day is over: the camera pulls back over the whole map and draws the route walked (`path`, tile by tile). */
  finale?: { path: number[]; outcome: string } | null;
  /** Wait for this (the title screen's Play) before the opening flyover or the tour. */
  ready?: boolean;
}) {
  const [screen, setScreen] = useState({ w: 1280, h: 800 });
  const src = useTerrainImage(daily, theme, G, true);
  useEffect(() => {
    const size = () => setScreen({ w: window.innerWidth, h: window.innerHeight });
    size();
    window.addEventListener("resize", size);
    return () => window.removeEventListener("resize", size);
  }, []);

  // Which way the hero faces: the way they last walked.
  const [left, setLeft] = useState(false);
  const last = useRef(s.at);
  useEffect(() => {
    const dx = (s.at % SIDE) - (last.current % SIDE);
    if (dx) setLeft(dx < 0);
    last.current = s.at;
  }, [s.at]);

  // The camera: zoomed with the wheel (or a pinch, or + and -), dragged to look around. Walking brings it back to you.
  const [view, setView] = useState(TILES_IN_VIEW);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [snap, setSnap] = useState(false); // follow the pointer at once, not at walking pace
  const box = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; pan: { x: number; y: number }; moved: boolean; spread?: number } | null>(null);
  const zoomBy = (f: number) => {
    setSnap(true);
    setView((v) => Math.min(ZOOM_OUT, Math.max(ZOOM_IN, v * f)));
    setPan((p) => ({ x: p.x / f, y: p.y / f }));
  };
  // The day's opening: the camera starts on the quest's boss, then flies to you. Once a day per tab.
  const [intro, setIntro] = useState<"lair" | "fly" | null>(null);
  const startHour = useRef(s.hour);
  // The tour: on a first visit, instead of the flyover, the camera stops at each kind of place with a line about it.
  const [tour, setTour] = useState<number | null>(null);
  const steps = tourSteps(daily);
  const endTour = () => {
    setTour(null);
    try { localStorage.setItem(TOUR_KEY, "1"); sessionStorage.setItem(`daily-intro-${daily.day}`, "1"); } catch { /* fine */ }
  };
  const [asked, setAsked] = useState(tourAsked);
  if (asked !== tourAsked) {
    setAsked(tourAsked);
    setIntro(null);
    setTour(0);
  }
  useEffect(() => {
    if (!ready) return;
    const key = `daily-intro-${daily.day}`;
    let seen = startHour.current > 0, toured = false;
    try { seen ||= sessionStorage.getItem(key) === "1"; toured = localStorage.getItem(TOUR_KEY) === "1"; } catch { /* no storage: play it */ }
    if (seen) return;
    if (!toured) {
      const t = setTimeout(() => setTour(0), 0);
      return () => clearTimeout(t);
    }
    const timers = [
      setTimeout(() => setIntro("lair"), 0),
      setTimeout(() => setIntro("fly"), 1800),
      setTimeout(() => { setIntro(null); try { sessionStorage.setItem(key, "1"); } catch { /* fine */ } }, 3900),
    ];
    return () => timers.forEach(clearTimeout);
  }, [daily.day, ready]);
  useEffect(() => {
    if (!rewards.length) return;
    const t = setTimeout(onRewardsShown, 1900 + rewards.length * 300);
    return () => clearTimeout(t);
  }, [rewards, onRewardsShown]);

  // The finale: pull right back over the whole day.
  const [ending, setEnding] = useState(false);
  if (!!finale !== ending) {
    setEnding(!!finale);
    if (finale) { setView(ZOOM_OUT); setPan({ x: 0, y: 0 }); setSnap(false); }
  }

  const [walkedTo, setWalkedTo] = useState(s.at);
  if (walkedTo !== s.at) {
    setWalkedTo(s.at);
    setPan({ x: 0, y: 0 });
    setSnap(false);
  }
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // Not passive, so the page doesn't scroll as well.
    const wheel = (e: WheelEvent) => { e.preventDefault(); zoomBy(e.deltaY > 0 ? 1.1 : 1 / 1.1); };
    const key = (e: KeyboardEvent) => {
      if ((e.target as Element | null)?.closest?.("input, textarea")) return;
      if (e.key === "+" || e.key === "=") zoomBy(1 / 1.2);
      else if (e.key === "-" || e.key === "_") zoomBy(1.2);
      else if (e.key.toLowerCase() === "c") { setSnap(false); setPan({ x: 0, y: 0 }); }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", key);
    return () => { el.removeEventListener("wheel", wheel); window.removeEventListener("keydown", key); };
  }, []);

  const tile = Math.min(screen.w, screen.h) / view;
  const z = tile / G.cell; // screen pixels per map pixel
  const at = (n: number) => n * z;
  const hx = centreOf(G, s.at % SIDE), hy = centreOf(G, Math.floor(s.at / SIDE));
  const sx = selected % SIDE, sy = Math.floor(selected / SIDE);
  // Looking around stops at the edge of the land.
  const clampPan = (p: { x: number; y: number }) => ({ x: Math.max(at(hx - G.w), Math.min(at(hx), p.x)), y: Math.max(at(hy - G.w), Math.min(at(hy), p.y)) });
  const looking = pan.x !== 0 || pan.y !== 0;
  const lair = daily.map.nodes.findIndex((n) => n.kind === "lair");
  const focus = tour != null ? steps[tour]?.node : intro === "lair" ? lair : null;
  const [fx, fy] = finale ? [G.w / 2, G.w / 2] : focus != null && focus !== s.at ? [centreOf(G, focus % SIDE), centreOf(G, Math.floor(focus / SIDE))] : [hx, hy];
  const camera = {
    initial: false as const,
    animate: { x: screen.w / 2 - at(fx) + pan.x, y: screen.h / 2 + 30 - at(fy) + pan.y },
    transition: intro === "fly" || tour != null || finale ? { duration: tour != null ? 1.1 : 2, ease: "easeInOut" as const } : snap || intro === "lair" ? { duration: 0 } : { duration: STEP_SECONDS, ease: "linear" as const },
  };
  const { shade, night } = lightAt(s.hour);
  // Where the hero stands, for what follows them (their lantern, what they win).
  const heroAt = { left: at(hx + G.cell * 0.2), top: at(hy + G.cell * 0.2) - tile * 0.23 };

  const down = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [a, b] = [...pointers.current.values()];
    drag.current = { x: e.clientX, y: e.clientY, pan, moved: false, ...(a && b && { spread: Math.hypot(a.x - b.x, a.y - b.y) }) };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [a, b] = [...pointers.current.values()];
    if (a && b && d.spread) {
      // A pinch: zoom by how far the fingers spread.
      const spread = Math.hypot(a.x - b.x, a.y - b.y);
      zoomBy(d.spread / spread);
      d.spread = spread;
      d.moved = true;
      return;
    }
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    setSnap(true);
    setPan(clampPan({ x: d.pan.x + dx, y: d.pan.y + dy }));
  };
  const up = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (!pointers.current.size) setTimeout(() => { drag.current = null; }, 0);
  };

  return (
    <div
      ref={box}
      className="fixed inset-0 z-0 cursor-grab touch-none overflow-hidden select-none active:cursor-grabbing"
      style={{ background: forestDark(theme), ...(finale && finale.outcome !== "won" && finale.outcome !== "timeout" && { filter: "grayscale(0.7) brightness(0.8)" }) }}
      onPointerDown={(e) => { if (intro) setIntro(null); if (tour == null) down(e); }} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      // A drag isn't a click: don't choose the tile it ended on.
      onClickCapture={(e) => { if (drag.current?.moved) { e.stopPropagation(); e.preventDefault(); } }}
    >
      {/* The camera: the land moves so the hero stays in the middle (a little below it, under the HUD). */}
      <motion.div className="absolute top-0 left-0" style={{ width: at(G.w), height: at(G.w) }} {...camera}>
        {src && (
          // eslint-disable-next-line @next/next/no-img-element -- painted in the browser (terrain.ts)
          <img src={src} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full [image-rendering:pixelated]" />
        )}

        {daily.map.nodes.map((node) => {
          if (node.kind === "blocked") return null;
          const x = node.id % SIDE, y = Math.floor(node.id / SIDE), cx = centreOf(G, x), cy = centreOf(G, y);
          const done = s.done.includes(node.id);
          const creature = !!node.enemy;
          // Sized to the hero and the houses: a mob about your height, an elite bigger, the quest's boss biggest.
          const size = tile * (node.kind === "lair" ? 0.36 : node.kind === "elite" ? 0.27 : 0.21);
          // Next to you (or where you stand), it stops, turns to face you and sees you.
          const alert = !done && (node.id === s.at || neighbours(daily.map, s.at).includes(node.id));
          return (
            <div key={node.id}>
              {/* The tile: click to see what's there, again to walk to it. */}
              <button
                type="button" disabled={walking} aria-label={node.name}
                onClick={() => (node.id === selected && node.id !== s.at ? onWalk(node.id) : onSelect(node.id))}
                className="group absolute outline-none"
                style={{ left: at(G.pad + x * G.cell), top: at(G.pad + y * G.cell), width: tile, height: tile }}
              >
                <span aria-hidden className="pointer-events-none absolute inset-[16%] border-2 border-dashed border-[#f2e4bf]/0 transition-colors group-hover:border-[#f2e4bf]/30 group-focus-visible:border-[#f2e4bf]/60" />
              </button>

              {/* Creatures live on their clearing: they wander it, hopping, and turn to face you when you come close. Beaten ones lie where they fell. */}
              {creature && (
                <div className="pointer-events-none absolute" style={{ left: at(cx) - size / 2, top: at(cy + G.cell * 0.18) - size, width: size, height: size }}>
                  {node.kind !== "enemy" && !done && (
                    <span className="absolute inset-[-30%] rounded-full" style={{ background: `radial-gradient(closest-side, ${node.kind === "lair" ? "rgb(160 20 10 / 0.45)" : "rgb(220 140 40 / 0.3)"}, transparent)` }} />
                  )}
                  {done ? (
                    <>
                      <span className="absolute -bottom-[6%] left-[15%] h-[14%] w-[70%] rounded-[50%] bg-black/35" />
                      <span className="absolute inset-0 flex origin-bottom rotate-90 items-end justify-center opacity-50 grayscale"><Emoji e={node.emoji} size={64} className="h-auto w-full" /></span>
                    </>
                  ) : (
                    <span className="absolute inset-0" style={engaging && node.id === s.at ? { animation: "daily-lunge 0.45s ease-in both" } : alert ? undefined : { animation: `daily-wander ${7 + (node.id % 4) * 1.5}s linear -${(node.id * 1.7) % 9}s infinite` }}>
                      <span className="absolute -bottom-[6%] left-[15%] h-[14%] w-[70%] rounded-[50%] bg-black/35" />
                      <span
                        className={`absolute inset-0 flex items-end justify-center ${alert && x > s.at % SIDE ? "-scale-x-100" : ""}`}
                        style={{ animation: alert ? "daily-bob 1.4s ease-in-out infinite" : "daily-hop 0.5s ease-in-out infinite", filter: "saturate(0.8) brightness(0.93) sepia(0.12)" }}
                      >
                        <Emoji e={node.emoji} size={64} className="h-auto w-full" />
                      </span>
                      {alert && (
                        <span className="absolute -top-[6%] -right-[22%] border-2 border-black bg-[#ffd27a] px-[0.3em] font-display text-xs leading-tight font-bold text-[#3a1c08] shadow-[2px_2px_0_#000]" style={{ animation: "daily-pop 0.25s ease-out" }}>!</span>
                      )}
                    </span>
                  )}
                </div>
              )}

              {/* Beaten just now: a burst of dust where it stood. */}
              {poof === node.id && (
                <span aria-hidden className="pointer-events-none absolute" style={{ left: at(cx), top: at(cy + G.cell * 0.05) }}>
                  {Array.from({ length: 9 }, (_, k) => {
                    const a = (k / 9) * Math.PI * 2, r = tile * (0.16 + rnd(k, 3) * 0.1);
                    return <span key={k} className="absolute block bg-[#d8ccb4]" style={{ width: tile * 0.05, height: tile * 0.05, ["--dx" as string]: `${Math.cos(a) * r}px`, ["--dy" as string]: `${Math.sin(a) * r * 0.6 - tile * 0.05}px`, animation: `daily-poof 0.7s ease-out ${rnd(k, 4) * 0.08}s both` }} />;
                  })}
                </span>
              )}

              {/* A little life: smoke from the forge, the camp's fire, the shrine's glow. */}
              {node.kind === "forge" && buildingAt(node, G).map((b, k) => (
                <span key={k} aria-hidden className="pointer-events-none absolute" style={{ left: at(b.x + 11 * b.px), top: at(b.y) }}>
                  {[0, 1, 2].map((j) => <span key={j} className="absolute block bg-[#cfc6b8]/60" style={{ width: at(3), height: at(3), animation: `daily-smoke 2.4s ease-out ${-j * 0.8}s infinite` }} />)}
                </span>
              ))}
              {node.kind === "camp" && buildingAt(node, G).map((b, k) => (
                <span key={k} aria-hidden className="pointer-events-none absolute" style={{ left: at(b.x + 11 * b.px), top: at(b.y + 6 * b.px) }}>
                  <span className="absolute block bg-[#ff8a30]" style={{ width: at(3), height: at(4), animation: "daily-twinkle 0.5s steps(2) infinite" }} />
                  <span className="absolute block bg-[#ffd27a]" style={{ left: at(1), top: at(1), width: at(1.5), height: at(2.5), animation: "daily-twinkle 0.35s steps(2) infinite" }} />
                </span>
              ))}
              {node.kind === "shrine" && !s.blessed && (
                <span aria-hidden className="pointer-events-none absolute rounded-full" style={{ left: at(cx) - tile * 0.18, top: at(cy) - tile * 0.2, width: tile * 0.36, height: tile * 0.36, background: `radial-gradient(closest-side, ${theme.tint}55, transparent)`, animation: "daily-twinkle 3s ease-in-out infinite" }} />
              )}
              {BUILT.has(node.kind) && done && node.kind === "gather" && (
                <span aria-hidden className="pointer-events-none absolute bg-black/35" style={{ left: at(cx) - tile * 0.2, top: at(cy) - tile * 0.12, width: tile * 0.4, height: tile * 0.26 }} />
              )}

            </div>
          );
        })}

        {/* You. */}
        <motion.div
          className="pointer-events-none absolute"
          style={{ width: tile * 0.17 }}
          initial={false}
          animate={{ left: at(hx + G.cell * 0.2) - tile * 0.085, top: at(hy + G.cell * 0.2) - tile * 0.23 }}
          transition={{ duration: STEP_SECONDS, ease: "linear" }}
        >
          <span className="absolute -bottom-[4%] left-[10%] h-[10%] w-[80%] rounded-[50%] bg-black/35" />
          {/* Walking: two steps, a leg up each, in turn. Standing: a slow breath. */}
          <svg viewBox="0 0 12 16" className={`relative h-auto w-full ${left ? "-scale-x-100" : ""}`} shapeRendering="crispEdges" aria-hidden
            style={walking ? undefined : { animation: "daily-breathe 1.6s steps(2) infinite" }}>
            {walking ? (
              <>
                <g style={{ animation: `daily-frame ${STEP_SECONDS}s step-end infinite` }}><Pixels grid={HERO_STEP[0]} /></g>
                <g style={{ animation: `daily-frame ${STEP_SECONDS}s step-end -${STEP_SECONDS / 2}s infinite` }}><Pixels grid={HERO_STEP[1]} /></g>
              </>
            ) : <Pixels grid={SPRITES.hero} />}
          </svg>
        </motion.div>

        {/* Cloud shadows drifting over the land. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {[0, 1, 2].map((k) => (
            <div key={k} className="absolute h-[16%] w-[30%] rounded-[40%] bg-black/12" style={{ top: `${12 + k * 30}%`, animation: `daily-cloud ${90 + k * 30}s linear -${k * 45}s infinite` }} />
          ))}
        </div>
      </motion.div>

      {/* The hour's light over the land: dawn, day, a golden afternoon, dusk, night. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 transition-[background-color] duration-1000" style={{ backgroundColor: shade, mixBlendMode: "multiply" }} />

      {/* Above the light: what glows at night, nameplates, the cursor, and what you win. */}
      <motion.div className="pointer-events-none absolute top-0 left-0" style={{ width: at(G.w), height: at(G.w) }} {...camera}>
        {night > 0 && (
          <div className="absolute inset-0 transition-opacity duration-1000" style={{ opacity: night, mixBlendMode: "screen" }}>
            {daily.map.nodes.map((node) => {
              const glow = GLOWS[node.kind];
              if (!glow || (node.kind === "lair" && s.done.includes(node.id))) return null;
              const r = tile * glow.r;
              return (
                <span key={node.id} className="absolute rounded-full" style={{
                  left: at(centreOf(G, node.id % SIDE)) - r, top: at(centreOf(G, Math.floor(node.id / SIDE))) - r, width: r * 2, height: r * 2,
                  background: `radial-gradient(closest-side, ${node.kind === "shrine" ? `${theme.tint}88` : glow.colour}, transparent)`,
                  ...(node.kind === "camp" && { animation: "daily-flicker 0.6s steps(3) infinite" }),
                }} />
              );
            })}
            {/* Your lantern. */}
            <motion.span className="absolute rounded-full" initial={false} animate={{ left: heroAt.left - tile * 0.45, top: heroAt.top - tile * 0.25 }} transition={camera.transition}
              style={{ width: tile * 0.9, height: tile * 0.9, background: "radial-gradient(closest-side, rgb(255 210 140 / 0.5), transparent)" }} />
            {/* Fireflies. */}
            {Array.from({ length: 28 }, (_, k) => (
              <span key={`f${k}`} className="absolute block" style={{
                left: at(rnd(k, daily.day + 60) * G.w), top: at(rnd(k, daily.day + 61) * G.w), width: 3, height: 3, background: theme.tint,
                animation: `daily-float ${6 + rnd(k, 62) * 6}s ease-in-out -${rnd(k, 63) * 6}s infinite, daily-twinkle ${2 + rnd(k, 64) * 3}s ease-in-out infinite`,
              }} />
            ))}
          </div>
        )}

        {/* The chosen spot: gold corners, breathing. */}
        <span
          aria-hidden className="pointer-events-none absolute"
          style={{ left: at(G.pad + sx * G.cell) + tile * 0.14, top: at(G.pad + sy * G.cell) + tile * 0.14, width: tile * 0.72, height: tile * 0.72, animation: "daily-cursor 1.6s ease-in-out infinite" }}
        >
          {["top-0 left-0 border-t-4 border-l-4", "top-0 right-0 border-t-4 border-r-4", "bottom-0 left-0 border-b-4 border-l-4", "right-0 bottom-0 border-r-4 border-b-4"].map((c) => (
            <span key={c} className={`absolute h-[16%] w-[16%] border-[#ecd394] drop-shadow-[2px_2px_0_#000] ${c}`} />
          ))}
        </span>

        {daily.map.nodes.map((node) => {
          if (node.kind === "blocked" || node.kind === "wild") return null;
          const x = node.id % SIDE, y = Math.floor(node.id / SIDE), cx = centreOf(G, x), cy = centreOf(G, y);
          const done = s.done.includes(node.id);
          const away = distance(daily.map, s.at, node.id);
          const size = tile * (node.kind === "lair" ? 0.36 : node.kind === "elite" ? 0.27 : 0.21);
          // Over the creature, or over the top of the building.
          const top = node.enemy ? cy + G.cell * 0.18 - size / z - 6 : Math.min(...buildingAt(node, G).map((b) => b.y), cy - G.cell * 0.12) - 8;
          return (
            <div key={node.id}>
              {/* The nameplate. */}
          {(
            <div className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-full flex-col items-center text-center leading-tight [text-shadow:1px_1px_0_#000,-1px_1px_0_#000,1px_-1px_0_#000,-1px_-1px_0_#000]" style={{ left: at(cx), top: at(top) }}>
              {node.kind === "elite" && !done && <span className="font-display text-[10px] text-[#ffc070]">« Elite »</span>}
              {node.kind === "lair" && !done && <span className="font-display text-[10px] text-[#ff7060]">« Quest »</span>}
              <span className="font-display text-sm whitespace-nowrap" style={{ color: done ? "#9b907d" : NAME_COLOUR[node.kind] ?? "#f2e4bf" }}>
                {wanted(node) ? "⚒️ " : ""}{node.name}{done ? " ✓" : ""}
              </span>
              {node.id !== s.at && Number.isFinite(away) && <span className="text-[10px] text-[#d8ccb4]">{hrs(away * WALK_HOURS)} away</span>}
            </div>
          )}
            </div>
          );
        })}

        {/* Resting by the fire (a warm glow and sleep drifting up) or praying (a pillar of the shrine's light, and sparkles). */}
        {moment && (
          <motion.div key={moment.at} className="absolute" initial={false} animate={heroAt} transition={camera.transition}>
            {moment.kind === "rest" ? (
              <>
                <span className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ width: tile * 0.9, height: tile * 0.9, top: tile * 0.15, background: "radial-gradient(closest-side, rgb(255 170 80 / 0.45), transparent)", animation: "daily-pillar 1.8s ease-out both" }} />
                {[0, 1, 2].map((k) => (
                  <span key={k} className="absolute font-display font-bold text-[#e9dcb4] [text-shadow:2px_2px_0_#000]" style={{ left: tile * 0.05 + k * 6, fontSize: 14 + k * 4, animation: `daily-zzz 1.6s ease-out ${k * 0.35}s both` }}>z</span>
                ))}
              </>
            ) : (
              <>
                <span className="absolute bottom-0 -translate-x-1/2 origin-bottom" style={{ width: tile * 0.3, height: tile * 1.8, background: `linear-gradient(to top, ${theme.tint}cc, ${theme.tint}44 60%, transparent)`, animation: "daily-pillar 1.8s ease-out both" }} />
                {Array.from({ length: 10 }, (_, k) => {
                  const a = -Math.PI * (0.1 + 0.8 * (k / 9)), r = tile * (0.2 + rnd(k, 9) * 0.2);
                  return <span key={k} className="absolute block h-1.5 w-1.5" style={{ background: theme.tint, boxShadow: `0 0 4px ${theme.tint}`, ["--dx" as string]: `${Math.cos(a) * r}px`, ["--dy" as string]: `${Math.sin(a) * r}px`, animation: `daily-poof 1s ease-out ${rnd(k, 8) * 0.3}s both` }} />;
                })}
              </>
            )}
          </motion.div>
        )}

        {/* The finale: the day's route drawn over the map, and a stamp at each place you did something. */}
        {finale && (
          <>
            <svg aria-hidden className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${G.w} ${G.w}`}>
              <polyline
                points={finale.path.map((id) => `${centreOf(G, id % SIDE)},${centreOf(G, Math.floor(id / SIDE))}`).join(" ")}
                fill="none" stroke="#ffd27a" strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" pathLength={1} strokeDasharray={1}
                style={{ filter: "drop-shadow(0 0 4px #ff8a30)", animation: `daily-draw ${Math.min(4, 0.8 + finale.path.length * 0.08)}s linear 0.9s both` }}
              />
            </svg>
            {s.done.map((id, k) => (
              <span key={id} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-[#ffd27a] shadow-[0_0_10px_#ff8a30]"
                style={{ left: at(centreOf(G, id % SIDE)), top: at(centreOf(G, Math.floor(id / SIDE))), width: tile * 0.5, height: tile * 0.5, animation: `daily-pop 0.4s ease-out ${(1 + (finale.path.indexOf(id) / Math.max(1, finale.path.length)) * Math.min(4, finale.path.length * 0.08) + k * 0.02).toFixed(2)}s both` }} />
            ))}
          </>
        )}

        {/* What you won: floating up over you, and a pillar of light for a level. */}
        <motion.div className="absolute" initial={false} animate={heroAt} transition={camera.transition}>
          {rewards.some((r) => r.level) && (
            <span className="absolute bottom-0 -translate-x-1/2 origin-bottom" style={{ width: tile * 0.34, height: tile * 1.6, background: "linear-gradient(to top, rgb(255 214 120 / 0.85), rgb(255 230 160 / 0.35) 60%, transparent)", animation: "daily-pillar 1.8s ease-out both" }} />
          )}
          {rewards.map((r, k) => (
            <span key={r.id} className={`absolute -translate-x-1/2 font-display whitespace-nowrap [text-shadow:2px_2px_0_#000] ${r.level ? "text-2xl" : "text-base"}`}
              // Up and to the right of you, clear of the nameplate over whatever stands on your tile.
              style={{ top: -tile * 0.12 - k * 4, left: tile * 0.16, color: r.colour, animation: `daily-reward 1.9s ease-out ${k * 0.3}s both` }}>
              {r.text}
            </span>
          ))}
        </motion.div>
      </motion.div>

      {/* The world's weather, falling over the land (stars stay in the sky behind the fights). */}
      <Weather theme={theme} />

      {/* What the hero can't see yet: the edges of the screen fall into dark (less so zoomed out, planning). */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 55%, transparent ${view > 4 ? 60 : 38}%, rgb(0 0 0 / ${view > 4 ? 0.4 : 0.6}) 95%)` }} />

      {/* The tour's callout: one line about the place in view, and the way on or out. */}
      {tour != null && steps[tour] && (
        <div className={`fixed inset-x-0 z-30 flex flex-col items-center px-4 ${steps[tour]!.clock ? "top-[5.2rem]" : "top-[16%]"}`} onPointerDown={(e) => e.stopPropagation()}>
          {steps[tour]!.clock && <span className="font-display text-[var(--gold)]">▲</span>}
          <motion.div key={tour} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="px-parchment px-shadow w-full max-w-sm p-3 text-center">
            <p className="font-display text-lg">{steps[tour]!.title}</p>
            <p className="mt-0.5 text-sm">{steps[tour]!.text}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <button type="button" onClick={endTour} className="text-xs text-[var(--muted)] underline">Skip tour</button>
              <span className="text-xs text-[var(--muted)] tabular-nums">{tour + 1} / {steps.length}</span>
              <button type="button" autoFocus onClick={() => (tour + 1 < steps.length ? setTour(tour + 1) : endTour())} className="btn px-3 py-1 text-sm">
                {tour + 1 < steps.length ? "Next" : "Let's go"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* The day's title, while the camera flies from the boss to you. */}
      {intro && (
        <div className="pointer-events-none fixed inset-x-0 top-[13%] z-30 flex justify-center px-4" style={{ animation: "daily-title 3.9s ease both" }}>
          <div className="px-frame-gold px-shadow max-w-lg px-6 py-4 text-center">
            <p className="font-display text-sm text-[var(--muted)]">Day #{daily.day} · {daily.world}</p>
            <p className="mt-1 font-display text-2xl text-[var(--gold)] sm:text-3xl">Beat {daily.map.nodes[lair]!.enemy!.name}</p>
            <p className="mt-1 text-sm">before the day runs out. Everything you do takes time.</p>
          </div>
        </div>
      )}

      {/* Zoom and back-to-you, bottom right. */}
      <div className="fixed right-3 bottom-3 z-20 hidden flex-col gap-1.5 sm:flex" onPointerDown={(e) => e.stopPropagation()}>
        {([["+", "Zoom in (+)", () => zoomBy(1 / 1.25)], ["−", "Zoom out (−)", () => zoomBy(1.25)]] as const).map(([t, label, go]) => (
          <button key={t} type="button" title={label} aria-label={label} onClick={go} className="px-frame px-shadow h-9 w-9 font-display text-lg leading-none text-[var(--gold)]">{t}</button>
        ))}
      </div>
      {looking && (
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => { setSnap(false); setPan({ x: 0, y: 0 }); }}
          className="px-frame px-shadow fixed top-24 left-1/2 z-20 -translate-x-1/2 px-3 py-1 font-display text-sm text-[var(--gold)]">
          ⌖ Back to you <span className="text-[var(--muted)]">C</span>
        </button>
      )}
    </div>
  );
}

const MINI = grid(32);

/**
 * The corner map: the whole day small, always in view. Click a place to choose it
 * (the bottom note then offers to walk there); the 🗺️ button opens it big.
 */
export function Minimap({ daily, theme, s, selected, onSelect }: { daily: Daily; theme: Theme; s: MapState; selected: number; onSelect: (id: number) => void }) {
  const src = useTerrainImage(daily, theme, MINI, false);
  const pct = (px: number) => `${(px / MINI.w) * 100}%`;
  const box = (id: number) => ({ left: pct(MINI.pad + (id % SIDE) * MINI.cell), top: pct(MINI.pad + Math.floor(id / SIDE) * MINI.cell), width: pct(MINI.cell), height: pct(MINI.cell) });
  return (
    <div className="px-frame px-shadow relative aspect-square w-24 sm:w-48">
      {src && (
          // eslint-disable-next-line @next/next/no-img-element -- painted in the browser (terrain.ts)
          <img src={src} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full [image-rendering:pixelated]" />
        )}
      {daily.map.nodes.map((node) => node.kind === "blocked" ? null : (
        <button
          key={node.id} type="button" title={node.name} onClick={() => onSelect(node.id)}
          className={`absolute flex items-center justify-center ${node.id === selected ? "outline-2 -outline-offset-2 outline-[#ecd394]" : "hover:outline-1 hover:-outline-offset-2 hover:outline-[#f2e4bf]/60"}`}
          style={box(node.id)}
        >
          {node.kind !== "wild" && <span className={s.done.includes(node.id) ? "opacity-40 grayscale" : ""}><Emoji e={node.emoji} size={16} /></span>}
        </button>
      ))}
      {/* You. */}
      <motion.span
        aria-hidden className="pointer-events-none absolute h-[7%] w-[7%] border-2 border-black bg-[#ffd27a]"
        initial={false}
        animate={{ left: `calc(${pct(centreOf(MINI, s.at % SIDE) + 6)} - 3.5%)`, top: `calc(${pct(centreOf(MINI, Math.floor(s.at / SIDE)) + 6)} - 3.5%)` }}
        transition={{ duration: STEP_SECONDS, ease: "linear" }}
      />
    </div>
  );
}

/** The screen closing in squares (and opening again with `out`), between the map and a fight. */
export function PixelWipe({ out = false }: { out?: boolean }) {
  const cols = 16, rows = 10;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
      {Array.from({ length: cols * rows }, (_, i) => {
        // Corner to corner, a little ragged.
        const d = (((i % cols) + Math.floor(i / cols)) / (cols + rows)) * 0.32 + rnd(i, 7) * 0.08;
        return <span key={i} className="bg-[#0b0907]" style={{ animation: `daily-wipe 0.14s steps(2) ${(out ? 0.4 - d : d).toFixed(3)}s both ${out ? "reverse" : "normal"}` }} />;
      })}
    </div>
  );
}
