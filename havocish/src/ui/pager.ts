import { ButtonBuilder, ButtonStyle, resolveColor, type ColorResolvable } from "discord.js";

export const PAGE_SIZE = 5;

/** One page of `list`, with `page` clamped into range. */
export function pageOf<T>(list: T[], page: number) {
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const p = Math.min(Math.max(0, Number.isFinite(page) ? page : 0), pages - 1);
    return { items: list.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE), page: p, pages };
}

/** ◀ Page x/y ▶ buttons, or none when everything fits on one page. */
export function pagerButtons(idFor: (page: number) => string, page: number, pages: number) {
    if (pages <= 1) return [];
    return [
        new ButtonBuilder().setCustomId(idFor(page - 1)).setEmoji("◀️").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(idFor(page)).setLabel(`Page ${page + 1}/${pages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(idFor(page + 1)).setEmoji("▶️").setStyle(ButtonStyle.Secondary).setDisabled(page >= pages - 1),
    ];
}

/** The server's theme colour for a container accent, or none if it is malformed. */
export function accentColor(hex: string | undefined) {
    try {
        return resolveColor((hex || "#00AE86") as ColorResolvable);
    } catch {
        return undefined;
    }
}
