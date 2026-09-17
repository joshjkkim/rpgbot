import { createCanvas } from "@napi-rs/canvas";
import { AttachmentBuilder } from "discord.js";
import type { shopItemAction, shopItemConfig } from "../../types/economy.js";
import { registerCardFonts } from "./fonts.js";
import { drawTextWithEmojis } from "./drawEmojis.js";
import {
    GOLD, GREEN, PARCHMENT, PARCHMENT_DIM, RARITY_COLOURS, RED, drawPanelFrame,
} from "./theme.js";

/**
 * The item tooltip, rendered as an image.
 *
 * This is a port of web/app/components/shop/itemTooltip.tsx: the same lines in
 * the same order, so an item reads identically on the dashboard and in Discord.
 * When one changes, change the other.
 */

const STAT_NAMES = { hp: "Health", atk: "Attack", def: "Defense", spd: "Speed" } as const;

type Line = {
    text: string;
    colour: string;
    /** Font family registered in fonts.ts. */
    font?: "Inter" | "InterSemi";
    size?: number;
    /** Extra pixels above this line, for the gaps the tooltip has before flavour text. */
    gapAbove?: number;
};

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

// The bot applies boosts only to XP and gold from fights, and only while equipped.
function boostLine(mult: number | undefined, what: string) {
    if (mult == null || mult === 1) return null;
    const pct = Math.round(Math.abs(mult - 1) * 100);
    return `Equip: Fights award ${pct}% ${mult > 1 ? "more" : "less"} ${what}.`;
}

function describeAction(a: shopItemAction) {
    switch (a.type) {
        case "assignRole": return "Grants a server role.";
        case "removeRole": return "Removes a server role.";
        case "sendMessage": return "Posts a message.";
        case "giveStat": return `Gives ${a.amount ?? 0} ${a.statId || "of a stat"}.`;
        case "giveItem": return `Gives ${a.quantity ?? 1} x ${a.itemId || "an item"}.`;
    }
}

/**
 * Turns an item into the lines the card shows. Pure and canvas-free, so the
 * smoke tests can assert on what an item reads as without rendering anything.
 */
export function itemCardLines(item: shopItemConfig): Line[] {
    const { stats = {}, boosts = {}, cosmetic = {} } = item.effects ?? {};
    const rarity = RARITY_COLOURS[item.rarity ?? "common"] ?? RARITY_COLOURS.common;

    const lines: Line[] = [{
        text: item.emoji ? `${item.emoji} ${item.name || item.id}` : (item.name || item.id),
        colour: rarity,
        font: "InterSemi",
        size: 22,
    }];

    const cap = item.maxPerUser ?? 0;
    if (cap > 0) lines.push({ text: cap === 1 ? "Unique" : `Unique (${cap})`, colour: PARCHMENT });
    if (item.equipable) {
        const slot = item.equipSlot ?? "accessory";
        lines.push({ text: slot.charAt(0).toUpperCase() + slot.slice(1), colour: PARCHMENT });
    }

    const baseStats = (Object.keys(STAT_NAMES) as Array<keyof typeof STAT_NAMES>).filter((k) => stats[k]);
    for (const k of baseStats) {
        lines.push({ text: `${signed(stats[k]!)} ${STAT_NAMES[k]}`, colour: PARCHMENT });
    }

    const equipLines = [
        stats.crit ? `Equip: ${signed(stats.crit)}% critical strike chance.` : null,
        boostLine(boosts.xpMultiplier, "XP"),
        boostLine(boosts.goldMultiplier, "gold"),
        cosmetic.title ? `Equip: Grants the title "${cosmetic.title}".` : null,
    ].filter((l): l is string => !!l);
    for (const text of equipLines) lines.push({ text, colour: GREEN });

    // Every equip bonus is read from equipped items, so on anything else they do nothing.
    if (!item.equipable && (baseStats.length > 0 || equipLines.length > 0)) {
        lines.push({ text: "Not equipable, so these bonuses never apply.", colour: RED });
    }

    for (const a of Object.values(item.actions ?? {})) {
        lines.push({ text: `Use: ${describeAction(a)}`, colour: GREEN });
    }

    if (item.description) {
        lines.push({ text: `"${item.description}"`, colour: GOLD, gapAbove: 6 });
    }
    if (item.minLevel) {
        lines.push({ text: `Requires Level ${item.minLevel}`, colour: PARCHMENT_DIM, gapAbove: 6 });
    }
    if (item.sellPrice) {
        lines.push({ text: `Sell Price: ${item.sellPrice} gold`, colour: PARCHMENT_DIM });
    }

    return lines;
}

const WIDTH = 420;       // logical pixels; the canvas renders at 2x for crispness
const SCALE = 2;
const PAD = 22;          // inset from the card edge to the first glyph
const LINE_H = 20;
const DEFAULT_SIZE = 14;

function fontFor(line: Line) {
    return `${line.size ?? DEFAULT_SIZE}px ${line.font ?? "Inter"}`;
}

/** Splits a line at the content width, so long descriptions do not run off the card. */
function wrap(ctx: any, line: Line, maxWidth: number): Line[] {
    ctx.font = fontFor(line);
    if (ctx.measureText(line.text).width <= maxWidth) return [line];

    const out: Line[] = [];
    let current = "";
    for (const word of line.text.split(" ")) {
        const next = current ? `${current} ${word}` : word;
        if (current && ctx.measureText(next).width > maxWidth) {
            out.push({ ...line, text: current, gapAbove: out.length === 0 ? (line.gapAbove ?? 0) : 0 });
            current = word;
        } else {
            current = next;
        }
    }
    if (current) out.push({ ...line, text: current, gapAbove: out.length === 0 ? (line.gapAbove ?? 0) : 0 });
    return out;
}

/**
 * Renders an item as a tooltip image. Attach it to any message that refers to
 * an item -- a loot drop, a shop listing, an inventory selection.
 */
export async function renderItemCard(item: shopItemConfig): Promise<AttachmentBuilder> {
    registerCardFonts();

    const maxWidth = WIDTH - PAD * 2;

    // Measure on a throwaway context: the card's height depends on how many
    // lines the item produces and how many of those wrap.
    const measure = createCanvas(WIDTH, 10).getContext("2d");
    const lines = itemCardLines(item).flatMap((l) => wrap(measure, l, maxWidth));

    const height = PAD * 2 + lines.reduce(
        (h, l) => h + LINE_H + (l.gapAbove ?? 0),
        0,
    );

    const canvas = createCanvas(WIDTH * SCALE, height * SCALE);
    const ctx = canvas.getContext("2d");
    ctx.scale(SCALE, SCALE);

    drawPanelFrame(ctx, WIDTH, height);

    let y = PAD + DEFAULT_SIZE;
    for (const line of lines) {
        y += line.gapAbove ?? 0;
        ctx.font = fontFor(line);
        ctx.fillStyle = line.colour;
        // The name can carry a server's custom emoji, which needs fetching.
        await drawTextWithEmojis({ ctx, text: line.text, x: PAD, y, emojiSize: line.size ?? DEFAULT_SIZE });
        y += LINE_H;
    }

    return new AttachmentBuilder(canvas.toBuffer("image/png"), {
        name: `item-${item.id}.png`,
    });
}
