import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { rollLoot } from "../../player/gathering.js";
import type { GatheringLocation } from "../../types/gathering.js";
import { addFind, fill, itemLabel, type Ctx, type Game, type Run, type Words } from "./run.js";

/**
 * Find it: a 4×4 patch of look-alikes hides the item being searched for. Click
 * it before time runs out; a wrong click costs two seconds. A few rounds a run.
 */

/** Seconds a round, and how many kinds of look-alike, after skill eases them. */
export function findRules(location: GatheringLocation, skill: number, toolBonus = 0) {
    const d = location.difficulty ?? {};
    return {
        rounds: d.rounds ?? 3,
        seconds: (d.seconds ?? 8) + Math.floor((skill - 1) * 0.12) + toolBonus,
        decoyKinds: Math.max(1, (d.decoyKinds ?? 3) - (skill >= 20 ? 1 : 0)),
    };
}

const WRONG_PENALTY_MS = 2000;

type State = {
    roundsLeft: number;
    round: number;
    target: { itemId: string; quantity: number; label: string } | null;
    cells: string[];
    targetIndex: number;
    endsAt: number;
};

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
    const drop = rollLoot(run.location.loot ?? [], ctx.config);
    if (!drop) return "out";
    s.roundsLeft--;
    s.round++;

    const rules = findRules(run.location, run.skill, run.toolBonus);
    const label = ctx.config.shop?.items?.[drop.itemId]?.emoji || "✨";
    const decoys = shuffle((w.decoys ?? "").split(/\s+/).filter((d) => d && d !== label)).slice(0, rules.decoyKinds);
    if (!decoys.length) decoys.push("▫️");

    s.target = { ...drop, label };
    s.cells = Array.from({ length: 16 }, () => decoys[Math.floor(Math.random() * decoys.length)]!);
    s.targetIndex = Math.floor(Math.random() * 16);
    s.cells[s.targetIndex] = label;
    s.endsAt = Date.now() + rules.seconds * 1000;
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
        rounds: "rounds",
        leave: "Leave",
        verb: "found",
    },

    start(run, w, ctx) {
        const s: State = { roundsLeft: findRules(run.location, run.skill, run.toolBonus).rounds, round: 0, target: null, cells: [], targetIndex: -1, endsAt: 0 };
        nextRound(run, s, w, ctx);
        return s;
    },

    body(run, s, w, config) {
        const rows = [0, 1, 2, 3].map((row) => new ActionRowBuilder<ButtonBuilder>().addComponents([0, 1, 2, 3].map((col) => {
            const i = row * 4 + col;
            return new ButtonBuilder()
                .setCustomId(`gather:pick:${run.ownerId}:${s.round}.${i}`)
                .setLabel(s.cells[i] ?? "·")
                .setStyle(ButtonStyle.Secondary);
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

        if (index === s.targetIndex) {
            addFind(run, s.target);
            run.status = `${itemLabel(ctx.config, s.target.itemId, s.target.quantity)}!`;
            return nextRound(run, s, w, ctx);
        }

        s.endsAt -= WRONG_PENALTY_MS;
        if (s.endsAt <= Date.now()) {
            run.status = w.slow!;
            return nextRound(run, s, w, ctx);
        }
        run.status = w.wrong!;
        schedule(run, s, w, ctx);
    },
};
