import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { makePuzzle, poweredTiles, puzzleRules, tileName, TILE_SHAPES, turnPuzzle, PUZZLE_WORDS, type PuzzleState } from "../../content/puzzle.js";
import { renderGatheringPanel } from "../canvas/gatheringPanel.js";
import { addFind, fill, rollRunLoot, type Game } from "./run.js";

export const puzzle: Game<PuzzleState> = {
    words: PUZZLE_WORDS,
    start(run) {
        return makePuzzle(puzzleRules(run.location.difficulty, run.skill, run.toolBonus, run.mods.difficulty).extraMoves);
    },
    body(run, s, w) {
        const powered = poweredTiles(s.tiles, s.source);
        const rows = Array.from({ length: 4 }, (_, row) => new ActionRowBuilder<ButtonBuilder>().addComponents(
            Array.from({ length: 4 }, (_, col) => {
                const i = row * 4 + col;
                return new ButtonBuilder().setCustomId(`gather:rotate:${run.ownerId}:${i}.${s.revision}`)
                    .setLabel(fill(w.rotate!, { tile: tileName(i), shape: TILE_SHAPES[s.tiles[i]!]! }).slice(0, 80) || tileName(i))
                    .setStyle(powered.has(i) ? ButtonStyle.Success : i === s.goal || i === s.source ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    .setDisabled(s.solved || s.movesLeft <= 0);
            }),
        ));
        return { text: `**${s.movesLeft}** ${w.moves}\n${fill(w.prompt!, { start: `${w.source} ${tileName(s.source)}`, goal: `${w.goal} ${tileName(s.goal)}` })}\n-# ${w.hint}`, rows };
    },
    scene(run, s) {
        return renderGatheringPanel({
            game: "puzzle", title: run.activity.name, subtitle: run.location.name, progress: "", remaining: s.movesLeft, total: s.movesTotal,
            puzzle: { tiles: s.tiles, source: s.source, goal: s.goal, active: s.active, solved: s.solved },
            puzzleScene: run.activity.puzzleScene, look: run.activity.look, colours: run.activity.colours, art: run.activity.art, avatarUrl: run.avatarUrl,
        });
    },
    click(run, s, w, action, arg, _at, ctx) {
        if (action !== "rotate" || !/^\d+\.\d+$/.test(arg)) return;
        const [index, revision] = arg.split(".").map(Number);
        if (!turnPuzzle(s, index!, revision!)) return;
        if (s.solved) {
            for (let n = 0; n < puzzleRules(run.location.difficulty).rewards; n++) {
                const drop = rollRunLoot(run, ctx.config);
                if (drop) addFind(run, drop);
            }
            run.status = w.solved!;
            return "out";
        }
        run.status = s.movesLeft ? fill(w.turned!, { tile: tileName(index!) }) : w.failed!;
        return s.movesLeft <= 0 ? "out" : undefined;
    },
};
