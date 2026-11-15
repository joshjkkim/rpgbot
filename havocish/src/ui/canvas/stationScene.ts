import { createCanvas } from "@napi-rs/canvas";
import { W, H } from "../../content/gridDraw.js";
import { gridImagePath } from "../../content/gridLooks.js";
import { drawStationScene, STATION_ART_SLOTS, type StationSceneArgs } from "../../content/stationScene.js";
import { emojiImageUrl, loadCachedImage } from "./drawEmojis.js";
import { registerCardFonts } from "./fonts.js";
import { DASHBOARD_URL } from "../dashboardLinks.js";

/** A timed station's slots as a PNG; uploaded art and item symbols that fail to load are just left out. */
export async function renderStationScene(args: StationSceneArgs, artPaths: Record<string, string> = {}): Promise<Buffer> {
    registerCardFonts();
    const symbols = Object.fromEntries(await Promise.all([...new Set(args.slots.map((s) => s.symbol).filter((s): s is string => !!s))].map(async (symbol) => {
        const url = emojiImageUrl(symbol);
        return [symbol, url ? await loadCachedImage(url).catch(() => null) : null];
    })));
    const art = Object.fromEntries(await Promise.all(Object.keys(STATION_ART_SLOTS).map(async (slot) => {
        const path = gridImagePath(artPaths[slot]);
        return [slot, path ? await loadCachedImage(new URL(path, DASHBOARD_URL).href).catch(() => null) : null];
    })));
    const canvas = createCanvas(W * 2, H * 2);
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    drawStationScene(ctx, args, art, symbols);
    return canvas.toBuffer("image/png");
}
