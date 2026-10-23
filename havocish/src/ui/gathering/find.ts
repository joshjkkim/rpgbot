import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { GatheringLocation } from "../../types/gathering.js";
import { addFind, fill, itemLabel, rollRunLoot, type Ctx, type Game, type Run, type Words } from "./run.js";

/**
 * Find it: a 4×4 patch of look-alikes hides the item being searched for. Click
 * it before time runs out; a wrong click costs two seconds. A few rounds a run.
 */

/**
 * Seconds a round, and how many kinds of look-alike, after skill eases them.
 * Each step of a trait's or condition's difficulty is 1.5 s less (never under
 * 3 s) and one more kind of look-alike.
 */
export function findRules(location: GatheringLocation, skill: number, toolBonus = 0, difficulty = 0) {
    const d = location.difficulty ?? {};
    return {
        rounds: d.rounds ?? 3,
        seconds: Math.max(3, (d.seconds ?? 8) + Math.floor((skill - 1) * 0.12) + toolBonus - 1.5 * difficulty),
        decoyKinds: Math.max(1, (d.decoyKinds ?? 3) - (skill >= 20 ? 1 : 0) + difficulty),
    };
}

/** How long "glimpse" shows the patch before covering it. */
const GLIMPSE_MS = 2500;

const WRONG_PENALTY_MS = 2000;

type State = {
    roundsLeft: number;
    round: number;
    target: { itemId: string; quantity: number; label: string } | null;
    cells: string[];
    /** Where the targets are: one, or two with "twin"; found ones are taken out. */
    targets: number[];
    /** Tiles already picked right this round, shown as found. */
    got: number[];
    /** With "glimpse": when the patch gets covered. */
    hiddenAt: number;
    endsAt: number;
    decoys: string[];
};

/** Lays the round's tiles out: look-alikes everywhere, the target in one place (two with "twin"). */
function layout(run: Run, s: State, label: string, decoys: string[]) {
    s.cells = Array.from({ length: 16 }, () => decoys[Math.floor(Math.random() * decoys.length)]!);
    const spots = shuffle(Array.from({ length: 16 }, (_, i) => i).filter((i) => !s.got.includes(i)));
    s.targets = spots.slice(0, run.mods.rules.has("find.twin") ? 2 - s.got.length : 1);
    for (const i of [...s.targets, ...s.got]) s.cells[i] = label;
}

function shuffle<T>(xs: T[]) {
    for (let i = xs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [xs[i], xs[j]] = [xs[j]!, xs[i]!];
    }
    return xs;
}

/** Sets up the next round, or says the run is over. */
function nextRound(run: Run, s: State, w: Words, ctx: Ctx): "out" | undefined {
    if (s.roundsLeft <= 0) return "out";
    const drop = rollRunLoot(run, ctx.config);
    if (!drop) return "out";
    s.roundsLeft--;
    s.round++;

    const rules = findRules(run.location, run.skill, run.toolBonus, run.mods.difficulty);
    const label = ctx.config.shop?.items?.[drop.itemId]?.emoji || "✨";
    const decoys = shuffle((w.decoys ?? "").split(/\s+/).filter((d) => d && d !== label)).slice(0, rules.decoyKinds);
    if (!decoys.length) decoys.push("▫️");

    s.target = { ...drop, label };
    s.got = [];
    layout(run, s, label, decoys);
    s.decoys = decoys;
    s.endsAt = Date.now() + rules.seconds * 1000;
    s.hiddenAt = run.mods.rules.has("find.glimpse") ? Date.now() + GLIMPSE_MS : 0;
    if (s.hiddenAt) {
        // Its own timer: the game's one timer is the round's deadline.
        const round = s.round;
        setTimeout(() => { if (ctx.alive() && s.round === round) void ctx.refresh(); }, GLIMPSE_MS).unref();
    }
    schedule(run, s, w, ctx);
    return undefined;
}

/** The round's deadline timer, re-set whenever a wrong click moves it. */
function schedule(run: Run, s: State, w: Words, ctx: Ctx) {
    const round = s.round;
    ctx.later(Math.max(0, s.endsAt - Date.now()), async () => {
        if (!ctx.alive() || s.round !== round) return;
        run.status = w.slow!;
        const end = nextRound(run, s, w, ctx);
        await (end ? ctx.end(end) : ctx.refresh());
    });
}

export const find: Game<State> = {
    words: {
        prompt: "Find the {target}!",
        wrong: "Not that one!",
        slow: "Too slow, it's gone.",
        decoys: "🌱 ☘️ 🍀 🌿 🍃 🌾",
        hidden: "❔",
        rounds: "rounds",
        leave: "Leave",
        verb: "found",
    },

    start(run, w, ctx) {
        const s: State = {
            roundsLeft: findRules(run.location, run.skill, run.toolBonus, run.mods.difficulty).rounds, round: 0, target: null,
            cells: [], targets: [], got: [], hiddenAt: 0, endsAt: 0, decoys: [],
        };
        nextRound(run, s, w, ctx);
        return s;
    },

    body(run, s, w, config) {
        // "Glimpse": after a moment every tile is covered, except ones already found.
        const covered = s.hiddenAt > 0 && Date.now() >= s.hiddenAt;
        const rows = [0, 1, 2, 3].map((row) => new ActionRowBuilder<ButtonBuilder>().addComponents([0, 1, 2, 3].map((col) => {
            const i = row * 4 + col;
            const got = s.got.includes(i);
            return new ButtonBuilder()
                .setCustomId(`gather:pick:${run.ownerId}:${s.round}.${i}`)
                .setLabel(covered && !got ? w.hidden ?? "❔" : s.cells[i] ?? "·")
                .setStyle(got ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setDisabled(got);
        })));
        const target = s.target ? itemLabel(config, s.target.itemId) : "";
        return {
            text: `### ${fill(w.prompt!, { target })}\n-# Time runs out <t:${Math.ceil(s.endsAt / 1000)}:R> · ${s.roundsLeft} more ${w.rounds} after this`,
            rows,
        };
    },

    click(run, s, w, action, arg, _at, ctx) {
        if (action !== "pick" || !s.target) return;
        const [round, index] = arg.split(".").map(Number);
        if (round !== s.round) return;

        if (s.targets.includes(index!)) {
            addFind(run, s.target);
            run.status = `${itemLabel(ctx.config, s.target.itemId, s.target.quantity)}!`;
            s.targets = s.targets.filter((t) => t !== index);
            s.got.push(index!);
            // "Twin": the round goes on until both are found.
            return s.targets.length ? undefined : nextRound(run, s, w, ctx);
        }

        s.endsAt -= WRONG_PENALTY_MS;
        // "Reshuffle": a wrong pick scrambles where everything is.
        if (run.mods.rules.has("find.reshuffle")) {
            layout(run, s, s.target.label, s.decoys);
            // With "glimpse" too, the new layout gets its own moment on show.
            if (s.hiddenAt) {
                s.hiddenAt = Date.now() + GLIMPSE_MS;
                const round = s.round;
                setTimeout(() => { if (ctx.alive() && s.round === round) void ctx.refresh(); }, GLIMPSE_MS).unref();
            }
        }
        if (s.endsAt <= Date.now()) {
            run.status = w.slow!;
            return nextRound(run, s, w, ctx);
        }
        run.status = w.wrong!;
        schedule(run, s, w, ctx);
    },
};
