/**
 * The classic look, shared by everything the bot draws.
 *
 * These are the fixed neutral anchors from the fantasy profile card: never
 * theme-tinted, so a card reads the same whatever accent colour a server picks.
 * Accent-derived shades stay local to each renderer, since they depend on
 * config.style.mainThemeColor.
 *
 * The dashboard mirrors these in web/app/globals.css. Keep the two in step by
 * eye -- they are different runtimes and there is no build step between them.
 */

export const BLACK_WALNUT = "#0A0806";
export const DARK_BARK = "#17110A";   // outer background
export const BARK = "#201609";        // inner card fill
export const STONE_BORDER = "#8A7A62";  // structural borders -- warm stone, not gold
export const STONE_DIM = "rgba(138,122,98,0.35)";
export const STONE_FAINT = "rgba(138,122,98,0.12)";

// Parchment cream -- always the same warm ivory for text and structural lines
export const PARCHMENT = "#D4C9AE";
export const PARCHMENT_DIM = "rgba(212,201,174,0.5)";
export const PARCHMENT_FAINT = "rgba(212,201,174,0.15)";

// Item quality colours. Copied from web/app/components/shop/itemTooltip.tsx:
// the bot and the dashboard are separate deploys with no shared package, and
// one six-row table does not justify building one.
export const RARITY_COLOURS = {
    poor: "#8a857c",
    common: "#e2dacb",
    uncommon: "#7fb86a",
    rare: "#6c95d0",
    epic: "#a584cc",
    legendary: "#d0894a",
} as const;

// Line colours that carry meaning rather than structure.
export const GREEN = "#8fbf72";   // an effect that fires
export const RED = "#c96b5b";     // an effect that never will
export const GOLD = "#C4973A";    // flavour text

export function roundRectPath(
    c: any,
    x: number, y: number,
    w: number, h: number,
    r: number,
) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
}

/**
 * Draws the aged-wood background and carved stone border every card sits in,
 * scaled to whatever size the caller needs.
 */
export function drawPanelFrame(ctx: any, w: number, h: number) {
    ctx.fillStyle = DARK_BARK;
    ctx.fillRect(0, 0, w, h);

    // Fine diagonal wood grain.
    ctx.strokeStyle = "rgba(200,165,100,0.02)";
    ctx.lineWidth = 1;
    for (let i = -h * 2; i < w + h; i += 9) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + h * 1.5, h);
        ctx.stroke();
    }

    // Stone outer border. The profile card breaks this into a chiselled dash,
    // but at tooltip size a dash reads as a selection marquee, so keep it solid.
    ctx.strokeStyle = STONE_DIM;
    ctx.lineWidth = 1;
    roundRectPath(ctx, 5.5, 5.5, w - 11, h - 11, 6);
    ctx.stroke();

    // Inner fill, inset from the border, edged in warm stone.
    ctx.fillStyle = BARK;
    roundRectPath(ctx, 10.5, 10.5, w - 21, h - 21, 4);
    ctx.fill();
    ctx.strokeStyle = STONE_BORDER;
    ctx.lineWidth = 1.5;
    ctx.stroke();
}
