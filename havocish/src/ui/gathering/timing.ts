import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { rollLoot } from "../../player/gathering.js";
import type { GatheringLocation } from "../../types/gathering.js";
import type { GuildConfig } from "../../types/guild.js";
import { addFind, fill, itemLabel, type Game, type Run } from "./run.js";

/**
 * Timing: start an attempt, wait for the signal, react inside the window. A
 * better find then pulls left or right a few times before it is landed.
 *
 * Fairness: the reaction is measured from when the signal was on screen (the
 * edit resolved) to when Discord stamped the click, so the bot's own lag is
 * not held against the player.
 */

const RARITY_ROUNDS: Record<string, number> = { uncommon: 1, rare: 2, epic: 3, legendary: 3 };

/** The window after skill eases it: +30 ms a level, never under 2.5 s. */
export function timingWindowMs(location: GatheringLocation, skill: number) {
    return Math.max(2500, (location.difficulty?.windowMs ?? 3000) + 30 * (skill - 1));
}

/** Pull rounds for a find: more for rarer items, capped, and one fewer from skill 25. */
export function pullRounds(location: GatheringLocation, skill: number, rarity: string | undefined) {
    const base = Math.min(RARITY_ROUNDS[rarity ?? ""] ?? 0, location.difficulty?.maxRounds ?? 3);
    if (base === 0) return 0;
    return Math.max(base >= 2 ? 1 : 0, base - (skill >= 25 ? 1 : 0));
}

type Phase = "ready" | "waiting" | "signal" | "pull";

type State = {
    phase: Phase;
    attemptsLeft: number;
    /** Counts attempts, so a timer from an earlier one can't touch the current one. */
    attempt: number;
    pending: { itemId: string; quantity: number } | null;
    roundsLeft: number;
    dir: "left" | "right";
    signalAt: number;
};

/** Ends an attempt with a line, then either readies the next one or ends the run. */
function settle(s: State, run: Run, line: string) {
    run.status = line;
    s.pending = null;
    s.phase = "ready";
    return s.attemptsLeft <= 0 ? ("out" as const) : undefined;
}

function landed(s: State, run: Run, w: Record<string, string>, config: GuildConfig) {
    const drop = s.pending!;
    addFind(run, drop);
    return settle(s, run, `${w.landed} ${itemLabel(config, drop.itemId, drop.quantity)}`);
}

export const timing: Game<State> = {
    words: {
        start: "Start",
        waiting: "Wait for it…",
        signal: "❗ Now!",
        action: "Go",
        early: "Too early, it got away.",
        late: "Too slow, it got away.",
        pull: "It pulls {dir}!",
        left: "⬅️ Left",
        right: "Right ➡️",
        lost: "Wrong way, it got away.",
        landed: "Got it:",
        attempts: "attempts",
        leave: "Leave",
        verb: "got",
    },

    start(run) {
        return {
            phase: "ready", attemptsLeft: run.location.difficulty?.attempts ?? 3, attempt: 0,
            pending: null, roundsLeft: 0, dir: "left", signalAt: 0,
        };
    },

    body(run, s, w) {
        const button = (id: string, label: string, style = ButtonStyle.Secondary) =>
            new ButtonBuilder().setCustomId(`gather:${id}:${run.ownerId}:${s.attempt}`).setLabel(label).setStyle(style);
        const row = new ActionRowBuilder<ButtonBuilder>();
        let text = `**${s.attemptsLeft}** ${w.attempts} left`;

        if (s.phase === "ready") row.addComponents(button("start", w.start!, ButtonStyle.Primary));
        if (s.phase === "waiting") { text += `\n### ${w.waiting}`; row.addComponents(button("act", w.action!)); }
        if (s.phase === "signal") { text += `\n# ${w.signal}`; row.addComponents(button("act", w.action!, ButtonStyle.Success)); }
        if (s.phase === "pull") {
            text += `\n### ${fill(w.pull!, { dir: s.dir === "left" ? w.left! : w.right! })}`;
            row.addComponents(
                new ButtonBuilder().setCustomId(`gather:pull:${run.ownerId}:left`).setLabel(w.left!).setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`gather:pull:${run.ownerId}:right`).setLabel(w.right!).setStyle(ButtonStyle.Primary),
            );
        }
        return { text, rows: [row] };
    },

    click(run, s, w, action, arg, at, ctx) {
        if (action === "start" && s.phase === "ready" && s.attemptsLeft > 0) {
            s.attemptsLeft--;
            s.attempt++;
            s.pending = rollLoot(run.location.loot ?? [], ctx.config);
            s.phase = "waiting";
            run.status = null;
            const attempt = s.attempt;

            ctx.later(2000 + Math.random() * 4000, async () => {
                if (!ctx.alive() || s.attempt !== attempt || s.phase !== "waiting") return;
                s.phase = "signal";
                await ctx.refresh();
                s.signalAt = Date.now();
                // A second of grace past the window before calling it, for slow connections.
                ctx.later(timingWindowMs(run.location, run.skill) + 1000, async () => {
                    if (!ctx.alive() || s.attempt !== attempt || s.phase !== "signal") return;
                    const end = settle(s, run, w.late!);
                    await (end ? ctx.end(end) : ctx.refresh());
                });
            });
            return;
        }

        if (action === "act" && Number(arg) === s.attempt) {
            if (s.phase === "waiting") return settle(s, run, w.early!);
            if (s.phase !== "signal") return;
            if (at - s.signalAt > timingWindowMs(run.location, run.skill) || !s.pending) return settle(s, run, w.late!);

            const rarity = ctx.config.shop?.items?.[s.pending.itemId]?.rarity;
            s.roundsLeft = pullRounds(run.location, run.skill, rarity);
            if (s.roundsLeft === 0) return landed(s, run, w, ctx.config);
            s.phase = "pull";
            s.dir = Math.random() < 0.5 ? "left" : "right";
            return;
        }

        if (action === "pull" && s.phase === "pull") {
            if (arg !== s.dir) return settle(s, run, w.lost!);
            s.roundsLeft--;
            if (s.roundsLeft <= 0) return landed(s, run, w, ctx.config);
            s.dir = Math.random() < 0.5 ? "left" : "right";
        }
    },
};
