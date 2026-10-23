import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { gridRules, makeClusteredGrid, makeGrid, type GridCell } from "../../player/gathering.js";
import { addFind, rollRunLoot, type Game } from "./run.js";

/** Grid: reveal tiles with limited tries; a hazard ends the run with half the haul. */

type State = { cells: GridCell[]; shown: (string | null)[]; triesLeft: number; adjacent: boolean };

/** With "only next to opened", a tile is open to pick when nothing is open yet, or a neighbour is. */
function reachable(s: State, i: number): boolean {
    if (!s.adjacent || s.shown.every((x) => x == null)) return true;
    const side = 4;
    const near = [i - side, i + side, ...(i % side ? [i - 1] : []), ...((i + 1) % side ? [i + 1] : [])];
    return near.some((j) => j >= 0 && j < s.shown.length && s.shown[j] != null);
}

export const grid: Game<State> = {
    words: {
        tile: "❔",
        empty: "·",
        hazard: "💥",
        hazardLine: "Disaster! You get away with half of what you found.",
        collapseLine: "It all comes down: everything you found is lost.",
        leave: "Leave",
        tries: "tries",
        verb: "found",
    },

    start(run) {
        const rules = gridRules(run.location, run.skill, run.toolBonus, run.mods.difficulty);
        const cells = run.mods.rules.has("grid.clustered") ? makeClusteredGrid(rules) : makeGrid(rules);
        return { cells, shown: Array(rules.size).fill(null), triesLeft: rules.tries, adjacent: run.mods.rules.has("grid.adjacent") };
    },

    body(run, s, w) {
        const rows = [0, 1, 2, 3].map((row) => new ActionRowBuilder<ButtonBuilder>().addComponents([0, 1, 2, 3].map((col) => {
            const i = row * 4 + col;
            const shown = s.shown[i];
            const cell = s.cells[i];
            // Labels, not emoji fields: an owner's emoji text can't make Discord reject the message.
            return new ButtonBuilder()
                .setCustomId(`gather:tile:${run.ownerId}:${i}`)
                .setLabel(shown ?? w.tile!)
                .setStyle(shown == null ? ButtonStyle.Secondary : cell === "find" ? ButtonStyle.Success : cell === "hazard" ? ButtonStyle.Danger : ButtonStyle.Secondary)
                .setDisabled(shown != null || s.triesLeft <= 0 || !reachable(s, i));
        })));
        return { text: `**${s.triesLeft}** ${w.tries} left`, rows };
    },

    click(run, s, w, action, arg, _at, ctx) {
        if (action !== "tile") return;
        const i = Number(arg);
        if (!(i >= 0 && i < s.cells.length) || s.shown[i] != null || s.triesLeft <= 0 || !reachable(s, i)) return;
        s.triesLeft--;

        const cell = s.cells[i];
        if (cell === "hazard") {
            s.shown[i] = w.hazard!;
            return "hazard";
        }
        const drop = cell === "find" ? rollRunLoot(run, ctx.config) : null;
        if (drop) addFind(run, drop);
        s.shown[i] = drop ? ctx.config.shop?.items?.[drop.itemId]?.emoji || "✨" : w.empty!;
        return s.triesLeft <= 0 ? "out" : undefined;
    },
};
