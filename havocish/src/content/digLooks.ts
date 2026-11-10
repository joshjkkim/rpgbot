/**
 * Dig's looks: the colours its rock face is drawn in. Shared by the bot (which
 * draws it), the dashboard (which edits it) and the AI builder (which picks
 * colours for a world). A look is a preset to start from; an owner, the Helper
 * or the AI can set any of the five colours over it, and the rest of the
 * picture (veins, darkness, sky, props) is worked out from those five.
 */

export type DigLook = "mine" | "ice" | "sand" | "metal" | "soil";

/** The colours anyone can set, as #rrggbb. */
export type DigColours = { rock: string; hard: string; loose: string; back: string; light: string };
export const DIG_COLOUR_KEYS = ["rock", "hard", "loose", "back", "light"] as const;
export const DIG_COLOUR_LABELS: Record<keyof DigColours, string> = {
    rock: "Rock", hard: "Hard rock", loose: "Loose rock", back: "Dug-out wall", light: "Light",
};

/** Everything the picture uses. */
export type DigPalette = DigColours & { vein: string; dark: string; sky: [string, string, string]; prop: string };

export const DIG_LOOKS: Record<DigLook, { label: string; palette: DigPalette }> = {
    mine: { label: "Mine: grey stone, timber props", palette: { rock: "#5c5248", hard: "#3a3634", vein: "#787470", loose: "#706252", back: "#26201b", dark: "#0e0b09", sky: ["#3b4452", "#2a2620", "#18130e"], prop: "#604226", light: "#ffb45a" } },
    ice: { label: "Ice: blue, cold light", palette: { rock: "#7492a8", hard: "#4a607a", vein: "#c4e2f0", loose: "#96b4c6", back: "#1c2634", dark: "#080c12", sky: ["#4a5f78", "#2a3646", "#141b24"], prop: "#5c7084", light: "#aadcff" } },
    sand: { label: "Sand: desert rock, warm light", palette: { rock: "#a88a5e", hard: "#806442", vein: "#ceb88c", loose: "#c4a674", back: "#40301e", dark: "#140f0a", sky: ["#7a6a52", "#4a3a26", "#241a10"], prop: "#6e4e2c", light: "#ffc878" } },
    metal: { label: "Metal: steel plating, rust, green work light", palette: { rock: "#5c646c", hard: "#3a4048", vein: "#96a0aa", loose: "#846448", back: "#1a1e24", dark: "#080a0c", sky: ["#1e2a36", "#141a22", "#0a0d12"], prop: "#4c545c", light: "#96ffd2" } },
    soil: { label: "Soil: earth and roots", palette: { rock: "#684a32", hard: "#4a382c", vein: "#8a6e50", loose: "#866240", back: "#281c14", dark: "#0c0806", sky: ["#3e4a3a", "#2a2a1e", "#16120c"], prop: "#604226", light: "#ffbe6e" } },
};

const HEX = /^#[0-9a-f]{6}$/i;

/** Only well-formed colours, from whoever wrote them (an owner, the Helper, the AI). Undefined when none are. */
export function cleanColours(v: unknown): Partial<DigColours> | undefined {
    if (!v || typeof v !== "object") return undefined;
    const out: Partial<DigColours> = {};
    for (const k of DIG_COLOUR_KEYS) {
        const c = (v as Record<string, unknown>)[k];
        if (typeof c === "string" && HEX.test(c.trim())) out[k] = c.trim().toLowerCase();
    }
    return Object.keys(out).length ? out : undefined;
}

/** a toward b by t (0 to 1). */
function mix(a: string, b: string, t: number): string {
    const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [p(a), p(b)];
    return `#${x.map((n, i) => Math.round(n + (y[i]! - n) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** The palette to draw with: the look's, with any set colours over it and the rest worked out from them. */
export function digPalette(look?: string, colours?: unknown): DigPalette {
    const base = DIG_LOOKS[look as DigLook]?.palette ?? DIG_LOOKS.mine.palette;
    const own = cleanColours(colours);
    if (!own) return base;
    const c = { ...base, ...own };
    return {
        ...c,
        vein: mix(c.hard, "#ffffff", 0.45),
        dark: mix(c.back, "#000000", 0.65),
        sky: [mix(c.back, c.light, 0.3), c.back, mix(c.back, "#000000", 0.5)],
        prop: mix(c.hard, c.loose, 0.5),
    };
}
