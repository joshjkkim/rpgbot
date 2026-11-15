import { createCanvas } from "@napi-rs/canvas";
import { drawGatheringPanel, panelSymbols, PANEL_H, PANEL_W, type GatheringPanel } from "../../content/gatheringPanel.js";
import { registerCardFonts } from "./fonts.js";
import { emojiImageUrl, loadCachedImage } from "./drawEmojis.js";
import { sceneArtSlots } from "../../content/gatheringScenes.js";
import { gridImagePath } from "../../content/gridLooks.js";
import { DASHBOARD_URL } from "../dashboardLinks.js";

export async function renderGatheringPanel(panel: GatheringPanel): Promise<Buffer> {
    registerCardFonts();
    const labels = panelSymbols(panel);
    const images = Object.fromEntries(await Promise.all(labels.map(async (label) => {
        const url = emojiImageUrl(label);
        const image = url ? await loadCachedImage(url).catch(() => null) : null;
        if (!image) return [label, null];
        const sprite = createCanvas(12, 12);
        sprite.getContext("2d").drawImage(image, 0, 0, 12, 12);
        return [label, sprite];
    })));
    const art = Object.fromEntries(await Promise.all(Object.keys(sceneArtSlots(panel.game)).map(async (slot) => {
        const path = gridImagePath(panel.art?.[slot]);
        return [slot, path ? await loadCachedImage(new URL(path, DASHBOARD_URL).href).catch(() => null) : null];
    })));
    const face = panel.avatarUrl ? await loadCachedImage(panel.avatarUrl).catch(() => null) : null;
    const canvas = createCanvas(PANEL_W * 2, PANEL_H * 2);
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    drawGatheringPanel(ctx, panel, images, art, face);
    return canvas.toBuffer("image/png");
}
