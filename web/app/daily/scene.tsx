"use client";

import { Emoji } from "./emoji";
import { Landscape, type Land } from "./landscape";

/*
 * The Daily's backdrop: the whole screen is the day's world. A sky in the
 * world's colours, light from above, weather that drifts (bubbles under the
 * sea, snow on the tundra, rain in the undercity), and the world's own enemies
 * passing far off as silhouettes, so a new world gets a fitting scene without
 * any art of its own.
 */

type Weather = "fireflies" | "bubbles" | "snow" | "rain" | "dust" | "sparkles" | "petals" | "spores" | "stars" | "embers";
export type Theme = { sky: [string, string, string]; glow: string; weather: Weather; tint: string; land: Land };

const THEMES: Record<string, Theme> = {
  "classic-fantasy": { sky: ["#1d1a2b", "#3a2a3a", "#0b0a0d"], glow: "rgb(255 190 110 / 0.10)", weather: "fireflies", tint: "#e0b050", land: { far: "#2a2234", mid: "#161420", ground: ["#4a5a32", "#262c1a", "#3a4628"], props: "pines" } },
  "sunken-isles": { sky: ["#0a2a3a", "#145a6a", "#050f17"], glow: "rgb(120 220 255 / 0.12)", weather: "bubbles", tint: "#7fd8e8", land: { far: "#0c3a48", mid: "#0a2430", ground: ["#c8b47a", "#6a5a3a", "#8a7a52"], props: "coral" } },
  "hollyhock-hollow": { sky: ["#2a3a4a", "#c08a5a", "#0e110a"], glow: "rgb(255 220 120 / 0.12)", weather: "fireflies", tint: "#f0d070", land: { far: "#4a5a3a", mid: "#2a3a22", ground: ["#7aa04a", "#3a5226", "#5a7a36"], props: "pines" } },
  "neon-undercity": { sky: ["#0c0618", "#2a0f3a", "#07040c"], glow: "rgb(255 60 200 / 0.12)", weather: "rain", tint: "#ff4fd8", land: { far: "#1a0f2a", mid: "#0c0814", ground: ["#3a3446", "#1a1622", "#2a2434"], props: "towers", windows: "#ff4fd8" } },
  "glass-dunes": { sky: ["#2a1830", "#e08a4a", "#0f0a06"], glow: "rgb(255 170 80 / 0.12)", weather: "dust", tint: "#f0a050", land: { far: "#8a4a3a", mid: "#5a3424", ground: ["#e0b070", "#a0743e", "#c09050"], props: "cacti" } },
  "thornwick-academy": { sky: ["#1a1230", "#4a3070", "#0b0812"], glow: "rgb(190 150 255 / 0.12)", weather: "sparkles", tint: "#c8a8ff", land: { far: "#2a1e44", mid: "#150f24", ground: ["#5a5a6a", "#2a2a36", "#46465a"], props: "spires", windows: "#ffd27a" } },
  "frontier-station": { sky: ["#05080f", "#101c34", "#03060b"], glow: "rgb(120 170 255 / 0.10)", weather: "stars", tint: "#8ab4ff", land: { far: "#141c2c", mid: "#0a0f18", ground: ["#5a6070", "#2a2e38", "#444a58"], props: "masts", windows: "#ff5a5a" } },
  frostmarch: { sky: ["#1a2a44", "#7a9ac0", "#0a111a"], glow: "rgb(200 230 255 / 0.12)", weather: "snow", tint: "#cfe6ff", land: { far: "#9ab4d0", mid: "#4a6a8a", ground: ["#f0f6ff", "#b0c4dc", "#d0deee"], props: "crystals" } },
  sugarfen: { sky: ["#3a1a3a", "#e08ab0", "#120a10"], glow: "rgb(255 160 210 / 0.12)", weather: "sparkles", tint: "#ffa8d8", land: { far: "#a05a8a", mid: "#6a2a5a", ground: ["#f0a0c0", "#a04a70", "#d07aa0"], props: "candy", windows: "#fff0a0" } },
  "lantern-coast": { sky: ["#141c20", "#3a4a4a", "#070b0c"], glow: "rgb(255 200 110 / 0.10)", weather: "rain", tint: "#f0c070", land: { far: "#1e2a2c", mid: "#10181a", ground: ["#6a6a5a", "#2e2e26", "#4a4a3e"], props: "masts", windows: "#ffc860" } },
  dustwater: { sky: ["#2a1a24", "#d0703a", "#100905"], glow: "rgb(255 150 70 / 0.12)", weather: "dust", tint: "#e8955a", land: { far: "#7a3a2a", mid: "#4a2418", ground: ["#c08a50", "#7a5230", "#a0703e"], props: "rocks" } },
  "yokai-valley": { sky: ["#241a30", "#c07a8a", "#0c090d"], glow: "rgb(255 180 200 / 0.10)", weather: "petals", tint: "#f2a8c0", land: { far: "#5a3a5a", mid: "#2a1e2e", ground: ["#5a7a4a", "#2a3a24", "#46603a"], props: "bamboo" } },
  sporedeep: { sky: ["#061a18", "#0f3a32", "#040c0b"], glow: "rgb(120 255 200 / 0.10)", weather: "spores", tint: "#7affc8", land: { far: "#0f2e2a", mid: "#081a18", ground: ["#3a6a5a", "#1a2e28", "#2a4a40"], props: "mushrooms", windows: "#7affc8" } },
};
const FALLBACK: Theme = { sky: ["#1d1a2b", "#3a2a3a", "#0b0a0d"], glow: "rgb(255 190 110 / 0.10)", weather: "embers", tint: "#e0a050", land: { far: "#2a2234", mid: "#161420", ground: ["#5a4a3a", "#2a2219", "#40342a"], props: "rocks" } };

export function themeFor(worldId: string): Theme {
  return THEMES[worldId] ?? FALLBACK;
}

/** A fixed spread of numbers in [0, 1) by index, rounded so the server and the browser write the same styles. */
function spread(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return Math.round((x - Math.floor(x)) * 1000) / 1000;
}

/** One particle of weather: its look, and how it moves (keyframes are in globals.css). The delay is in the shorthand, which would reset a separate one. */
function particle(w: Weather, i: number, tint: string): React.CSSProperties {
  const left = `${Math.round(spread(i, 1) * 1000) / 10}%`;
  const delay = `-${Math.round(spread(i, 2) * 200) / 10}s`;
  const slow = Math.round(100 + spread(i, 3) * 140) / 10;
  const size = 2 + Math.round(spread(i, 4) * 3);
  const base: React.CSSProperties = { position: "absolute", left, pointerEvents: "none" };
  const anim = (name: string, seconds: number, ease = "linear") => `${name} ${seconds}s ${ease} ${delay} infinite`;
  switch (w) {
    case "bubbles":
      return { ...base, bottom: -20, width: size * 3, height: size * 3, border: `2px solid ${tint}99`, animation: anim("daily-rise", slow) };
    case "snow":
      return { ...base, top: -10, width: size + 1, height: size + 1, background: "#eef6ff", opacity: 0.75, animation: anim("daily-fall", slow) };
    case "rain":
      return { ...base, top: -40, width: 2, height: 12 + size * 4, background: `${tint}99`, animation: anim("daily-rain", Math.round(12 + spread(i, 3) * 10) / 10) };
    case "petals":
      return { ...base, top: -10, width: size + 2, height: size + 2, background: tint, opacity: 0.75, animation: anim("daily-drift", slow) };
    case "dust":
      return { ...base, top: `${Math.round(spread(i, 5) * 100)}%`, width: size, height: size, background: tint, opacity: 0.35, animation: anim("daily-blow", slow) };
    case "stars":
      return { ...base, top: `${Math.round(spread(i, 5) * 70)}%`, width: size > 3 ? 2 : 1, height: size > 3 ? 2 : 1, background: "#fff", animation: anim("daily-twinkle", Math.round(20 + spread(i, 3) * 40) / 10, "ease-in-out") };
    default:
      // Fireflies, sparkles, spores, embers: points of light that wander and pulse.
      return {
        ...base, top: `${Math.round(20 + spread(i, 5) * 75)}%`, width: size + 1, height: size + 1, background: tint,
        animation: `${anim("daily-float", slow, "ease-in-out")}, ${anim("daily-twinkle", Math.round(30 + spread(i, 6) * 30) / 10, "ease-in-out")}`,
      };
  }
}

export function Scene({ theme, silhouettes }: { theme: Theme; silhouettes: string[] }) {
  const count = theme.weather === "rain" ? 60 : theme.weather === "stars" ? 90 : 40;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <Landscape land={theme.land} sky={theme.sky} />

      {/* The world's enemies, far off: dark shapes crossing the middle distance. */}
      {silhouettes.map((e, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            top: `${Math.round(48 + spread(i, 7) * 12)}%`, left: 0, opacity: Math.round((0.16 + spread(i, 8) * 0.12) * 100) / 100, filter: "brightness(0)",
            animation: `daily-cross ${Math.round(50 + spread(i, 10) * 40)}s linear -${Math.round(spread(i, 11) * 80)}s infinite`,
          }}
        >
          {/* Emoji face left; flipped, they walk the way they're going. */}
          <span className="block -scale-x-100"><Emoji e={e} size={22 + Math.round(spread(i, 13) * 14)} /></span>
        </div>
      ))}

      {Array.from({ length: count }, (_, i) => <span key={i} style={particle(theme.weather, i, theme.tint)} />)}

    </div>
  );
}
