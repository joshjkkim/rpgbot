import { gridSettings } from "../../content/gridSettings.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { GatheringLocation, TwistRule } from "../../types/gathering.js";
import { renderGridScene } from "../canvas/gridScene.js";
import { addFind, fill, itemLabel, rollRunLoot, type Game } from "./run.js";

/**
 * Grid: a rock face drawn as a scene, worked one swing at a time. You start at
 * the tunnel mouth and can only swing at rock next to open space, so you
 * tunnel toward what you want. Ore shows in the rock once your light reaches
 * it, takes more swings the rarer it is, and the good stuff sits further in.
 * A better tool breaks rock faster. Loose rock falls when you dig out what
 * holds it up, and lands on you if you're standing there.
 */

export const COLS = 5;
export const ROWS = 4;
/** The tunnel mouth, left of the face: the two rows a person fills. */
const MOUTH_ROWS = [ROWS - 2, ROWS - 1];

export type CellKind = "rock" | "hard" | "loose" | "ore" | "open";
export type Cell = { kind: CellKind; hp: number; max: number; itemId?: string; quantity?: number; rarity?: string | undefined };

/** Swings a block of ore takes, by rarity, before a tool's bonus. */
const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];
/** Swings lost when loose rock lands on you. */
export const FALL_COST = 2;

export function gridRules(location: GatheringLocation, skill: number, toolBonus = 0, difficulty = 0, rules: Set<TwistRule> = new Set()) {
    const d = gridSettings(location.difficulty);
    const ores = d.ores;
    return {
        ...d,
        adjacent: rules.has("grid.adjacent") ? 1 : d.adjacent,
        swings: Math.max(1, Math.min(200, d.swings + (d.skillSwingsEvery ? Math.floor(Math.max(0, skill - 1) / d.skillSwingsEvery) : 0) - 2 * difficulty)),
        ores,
        loose: Math.max(0, Math.min(d.loose + (rules.has("grid.loose") ? 2 : 0) + Math.max(0, difficulty), 6)),
        hard: Math.max(0, Math.min(d.hard + difficulty, COLS * ROWS - ores - 8)),
        light: rules.has("grid.dark") ? Math.max(1, d.light - 1) : d.light,
        power: d.power + (d.toolPower ? Math.max(0, toolBonus) : 0),
        clean: Math.min(100, d.cleanChance + Math.min(30, Math.max(0, skill) * d.skillCleanBonus)),
        seams: rules.has("grid.seams"),
    };
}

export type GridRules = ReturnType<typeof gridRules>;
export type Ore = { itemId: string; quantity: number; rarity?: string | undefined };

const near = (i: number) => {
    const r = Math.floor(i / COLS), c = i % COLS;
    return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
        .filter(([y, x]) => y! >= 0 && y! < ROWS && x! >= 0 && x! < COLS)
        .map(([y, x]) => y! * COLS + x!);
};
/** The blocks the tunnel mouth touches. */
const MOUTH = MOUTH_ROWS.map((r) => r * COLS);

/**
 * A fresh rock face. Ore goes anywhere but the mouth, rarer finds further in;
 * loose rock sits over something solid, so digging under it is what drops it.
 */
export function makeWall(rules: GridRules, pickOre: () => Ore | null, roll = Math.random): Cell[] {
    const cells: Cell[] = Array.from({ length: COLS * ROWS }, () => ({ kind: "rock", hp: rules.rockHp, max: rules.rockHp }));
    const free = () => cells.map((c, i) => (c.kind === "rock" && !MOUTH.includes(i) ? i : -1)).filter((i) => i >= 0);
    const take = (pool: number[]) => pool.splice(Math.floor(roll() * pool.length), 1)[0];

    const oreAt: number[] = [];
    for (let n = 0; n < rules.ores; n++) {
        const open = free();
        // Seams: each new block of ore beside an earlier one, where there's room.
        const beside = rules.seams ? oreAt.flatMap(near).filter((j) => open.includes(j)) : [];
        const i = take(beside.length && roll() < 0.85 ? beside : open);
        if (i === undefined) break;
        cells[i] = { kind: "ore", hp: 0, max: 0 };
        oreAt.push(i);
    }
    // The rarest finds sit furthest from the mouth.
    const ores = oreAt.map(() => pickOre()).filter((o): o is Ore => !!o);
    if (rules.rareDepth) ores.sort((a, b) => RARITY_ORDER.indexOf(a.rarity ?? "common") - RARITY_ORDER.indexOf(b.rarity ?? "common"));
    if (rules.rareDepth) oreAt.sort((a, b) => (a % COLS) - (b % COLS) || a - b);
    for (const [n, i] of oreAt.entries()) {
        const ore = ores[n];
        if (!ore) { cells[i] = { kind: "rock", hp: rules.rockHp, max: rules.rockHp }; continue; }
        const hp = rules.oreHp + Math.max(0, RARITY_ORDER.indexOf(ore.rarity ?? "common")) * rules.rarityHp;
        cells[i] = { kind: "ore", hp, max: hp, ...ore };
    }

    for (let n = 0; n < rules.hard; n++) {
        const i = take(free());
        if (i !== undefined) cells[i] = { kind: "hard", hp: rules.hardHp, max: rules.hardHp };
    }
    for (let n = 0; n < rules.loose; n++) {
        const i = take(free().filter((j) => j < (ROWS - 1) * COLS && cells[j + COLS]!.kind !== "open"));
        if (i !== undefined) cells[i] = { kind: "loose", hp: rules.looseHp, max: rules.looseHp };
    }
    return cells;
}

export type GridState = {
    cells: Cell[];
    swings: number;
    rules: GridRules;
    /** The block you're standing in, or -1 at the tunnel mouth. */
    pos: number;
    /** The last swing, for the picture: where, how hard, and what came of it. */
    last: { at: number; damage: number; broke: boolean; clean: boolean; got?: Ore; fell?: number } | null;
};

/** Whether a block can be swung at: solid, and next to open space or the mouth. */
export function reachable(s: GridState, i: number): boolean {
    const cell = s.cells[i];
    if (!Number.isInteger(i) || !cell || cell.kind === "open") return false;
    if (!s.rules.adjacent) return lit(s, i);
    return MOUTH.includes(i) || near(i).some((j) => s.cells[j]!.kind === "open");
}

/** Blocks from the nearest open space or the mouth: what the light reaches. */
export function distance(s: GridState, i: number): number {
    const r = Math.floor(i / COLS), c = i % COLS;
    let best = Math.min(...MOUTH_ROWS.map((y) => Math.abs(y - r) + c + 1));
    for (const [j, cell] of s.cells.entries()) {
        if (cell.kind === "open") best = Math.min(best, Math.abs(Math.floor(j / COLS) - r) + Math.abs((j % COLS) - c));
    }
    return best;
}

export const lit = (s: GridState, i: number) => distance(s, i) <= s.rules.light;

/**
 * Loose rock with open space under it falls until it lands. Returns where it
 * landed on the person, if it did.
 */
export function settle(s: GridState): number | null {
    if (!s.rules.falling) return null;
    let hit: number | null = null;
    for (let moved = true; moved;) {
        moved = false;
        for (let i = (ROWS - 1) * COLS - 1; i >= 0; i--) {
            const below = i + COLS;
            if (s.cells[i]!.kind !== "loose" || s.cells[below]!.kind !== "open") continue;
            // Landing on you, it breaks up and packs into the gap: plain rock that stays put.
            s.cells[below] = below === s.pos ? { kind: "rock", hp: s.rules.rockHp, max: s.rules.rockHp } : s.cells[i]!;
            s.cells[i] = { kind: "open", hp: 0, max: 0 };
            if (below === s.pos) hit = below;
            moved = true;
        }
    }
    return hit;
}

/** One swing at block `i`. Returns false when it can't be swung at. */
export function swing(s: GridState, i: number, clean: boolean): boolean {
    if (s.swings <= 0 || !reachable(s, i)) return false;
    const cell = s.cells[i]!;
    s.swings--;
    const damage = s.rules.power + (clean ? 1 : 0);
    cell.hp = Math.max(0, cell.hp - damage);
    s.last = { at: i, damage, broke: cell.hp === 0, clean };
    if (cell.hp > 0) return true;

    if (cell.kind === "ore" && cell.itemId) s.last.got = { itemId: cell.itemId, quantity: cell.quantity ?? 1, rarity: cell.rarity };
    s.cells[i] = { kind: "open", hp: 0, max: 0 };
    // You step into what you dug out.
    const from = s.pos;
    s.pos = i;
    if (settle(s) !== null) {
        s.swings = Math.max(0, s.swings - s.rules.fallCost);
        s.last.fell = s.rules.fallCost;
        // Knocked back to where you were standing.
        s.pos = from;
    }
    return true;
}

export const done = (s: GridState) => s.swings <= 0 || !s.cells.some((_, i) => reachable(s, i));

export const grid: Game<GridState> = {
    words: {
        rock: "🪨",
        hard: "⬛",
        loose: "⚠️",
        dark: "▒",
        empty: "·",
        you: "🧍",
        tries: "swings",
        leave: "Leave",
        verb: "found",
        crack: "It cracks.",
        clean: "Clean strike!",
        broke: "It breaks away.",
        got: "Got {item}!",
        fall: "Loose rock comes down on you! −{n} {tries}.",
        hint: "",
    },

    start(run, _w, { config }) {
        const rules = gridRules(run.location, run.skill, run.toolBonus, run.mods.difficulty, run.mods.rules);
        const pickOre = () => {
            const drop = rollRunLoot(run, config);
            return drop ? { ...drop, rarity: config.shop?.items?.[drop.itemId]?.rarity } : null;
        };
        return { cells: makeWall(rules, pickOre), swings: rules.swings, rules, pos: -1, last: null };
    },

    body(run, s, w, config) {
        const rows = Array.from({ length: ROWS }, (_, r) => new ActionRowBuilder<ButtonBuilder>().addComponents(
            Array.from({ length: COLS }, (_, c) => {
                const i = r * COLS + c;
                const cell = s.cells[i]!;
                const seen = lit(s, i);
                const can = reachable(s, i) && s.swings > 0;
                const icon = cell.kind === "open" ? (i === s.pos ? w.you! : w.empty!)
                    : !seen ? w.dark!
                    : cell.kind === "ore" ? config.shop?.items?.[cell.itemId ?? ""]?.emoji || "✨"
                    : w[cell.kind]!;
                // Labels, not emoji fields: an owner's emoji text can't make Discord reject the message.
                return new ButtonBuilder()
                    .setCustomId(`gather:tile:${run.ownerId}:${i}`)
                    .setLabel(cell.kind !== "open" && seen && cell.hp > 1 ? `${icon} ${cell.hp}` : icon)
                    .setStyle(!can ? ButtonStyle.Secondary : cell.kind === "ore" ? ButtonStyle.Success : cell.kind === "loose" ? ButtonStyle.Danger : ButtonStyle.Primary)
                    .setDisabled(!can);
            }),
        ));
        const hint = w.hint || [
            s.rules.adjacent ? "Work on spaces next to cleared ground." : "Work on any visible space.",
            "Finds appear within your visibility range.",
            s.rules.falling ? "Unstable obstacles fall when cleared underneath." : "Obstacles stay in place.",
        ].join(" ");
        return { text: `**${s.swings}** ${w.tries} left\n-# ${hint}`, rows };
    },

    scene(run, s, _w, config) {
        return renderGridScene({
            cells: s.cells.map((cell, i) => ({ ...cell, seen: lit(s, i), dim: distance(s, i) === s.rules.light + 1, emoji: config.shop?.items?.[cell.itemId ?? ""]?.emoji })),
            pos: s.pos,
            last: s.last ? { ...s.last, emoji: s.last.got ? config.shop?.items?.[s.last.got.itemId]?.emoji : undefined } : null,
            avatarUrl: run.avatarUrl,
            tool: (run.toolId && config.shop?.items?.[run.toolId]?.emoji) || run.activity.emoji,
            look: run.activity.look,
            colours: run.activity.colours,
            art: run.activity.art,
        });
    },

    click(run, s, w, action, arg, _at, ctx) {
        if (action !== "tile") return;
        const i = Number(arg);
        const clean = Math.random() * 100 < s.rules.clean;
        if (!swing(s, i, clean)) return;
        const last = s.last!;
        if (last.got) addFind(run, last.got);
        run.status = [
            last.clean ? w.clean : null,
            last.got ? fill(w.got!, { item: itemLabel(ctx.config, last.got.itemId, last.got.quantity) }) : last.broke ? w.broke : w.crack,
            last.fell !== undefined ? fill(w.fall!, { n: String(last.fell), tries: w.tries! }) : null,
        ].filter(Boolean).join(" ");
        return done(s) ? "out" : undefined;
    },
};
