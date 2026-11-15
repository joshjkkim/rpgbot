/** Rotate-to-connect rules shared by Discord and the playable dashboard preview. */
import { clampSettings } from "./gridSettings.ts";

export const PUZZLE_SIDE = 4;
/** Boards solvable in fewer turns than this are rerolled, so none are free. */
const MIN_TURNS = 5;
export const TILE_SHAPES = ["·", "╵", "╶", "└", "╷", "│", "┌", "├", "╴", "┘", "─", "┴", "┐", "┤", "┬", "┼"];
const DIRECTIONS = [[-1, 0], [0, 1], [1, 0], [0, -1]] as const;
export const tileName = (i: number) => `${"ABCD"[Math.floor(i / 4)]}${i % 4 + 1}`;
export const rotateTile = (mask: number) => ((mask << 1) & 15) | (mask >> 3);

export const PUZZLE_WORDS = {
    prompt: "Connect {start} to {goal}.",
    hint: "Each tile turns clockwise. Join the entrance on the left to the goal on the right before your moves run out.",
    source: "Entrance",
    goal: "Goal",
    moves: "moves left",
    rotate: "{tile} {shape}",
    turned: "Rotated {tile}.",
    solved: "Connected! Puzzle solved.",
    failed: "No moves left. The connection is incomplete.",
    leave: "Leave",
    timeout: "This puzzle ended after inactivity. Unfinished puzzles give no rewards.",
    verb: "recovered",
};
export const PUZZLE_SETTINGS = {
    extraMoves: { label: "Extra moves", fallback: 6, min: 0, max: 40, hint: "Added to the moves needed for a guaranteed solution. Skill and tools add more; harder conditions reduce this allowance." },
    rewards: { label: "Finds per solve", fallback: 3, min: 1, max: 5, hint: "Loot rolls when the connection is completed. Unfinished boards give no items or skill XP." },
};

export function puzzleRules(d: Record<string, number> = {}, skill = 1, toolBonus = 0, difficulty = 0) {
    const { extraMoves, rewards } = clampSettings(PUZZLE_SETTINGS, d);
    return {
        extraMoves: Math.max(0, extraMoves + Math.floor(Math.max(0, skill - 1) / 10) + Math.max(0, Math.floor(toolBonus)) - Math.round(difficulty) * 2),
        rewards,
    };
}

function neighbour(i: number, direction: number): number | null {
    const [dy, dx] = DIRECTIONS[direction]!;
    const row = Math.floor(i / 4) + dy, col = i % 4 + dx;
    return row >= 0 && row < 4 && col >= 0 && col < 4 ? row * 4 + col : null;
}

export function poweredTiles(tiles: number[], source: number): Set<number> {
    const reached = new Set<number>();
    if (!(tiles[source]! & 8)) return reached;
    const queue = [source];
    reached.add(source);
    for (let n = 0; n < queue.length; n++) {
        const i = queue[n]!;
        for (let dir = 0; dir < 4; dir++) {
            const next = neighbour(i, dir);
            if (next === null || reached.has(next) || !(tiles[i]! & (1 << dir)) || !(tiles[next]! & (1 << ((dir + 2) % 4)))) continue;
            reached.add(next); queue.push(next);
        }
    }
    return reached;
}
export const puzzleSolved = (tiles: number[], source: number, goal: number) =>
    !!(tiles[goal]! & 2) && poweredTiles(tiles, source).has(goal);

export function turnsTo(current: number, target: number): number {
    for (let n = 0; n < 4; n++, current = rotateTile(current)) if (current === target) return n;
    throw new Error("Puzzle tile shapes do not match");
}

export type PuzzleState = {
    tiles: number[];
    /** Known solution and route stay server-side; only the current tiles are drawn. */
    solution: number[];
    route: number[];
    source: number;
    goal: number;
    movesLeft: number;
    movesTotal: number;
    revision: number;
    solved: boolean;
    active?: number;
};

export function makePuzzle(extraMoves = 6, roll = Math.random): PuzzleState {
    for (;;) {
        const board = makeBoard(extraMoves, roll);
        if (board.needed >= MIN_TURNS) return board.state;
    }
}

function makeBoard(extraMoves: number, roll: () => number) {
    const source = Math.floor(roll() * 4) * 4, goal = Math.floor(roll() * 4) * 4 + 3;
    const route = [source];
    const visited = new Set(route);
    const search = (at: number): boolean => {
        if (at === goal) return true;
        const options = DIRECTIONS.map((_, dir) => neighbour(at, dir)).filter((i): i is number => i !== null && !visited.has(i));
        while (options.length) {
            const next = options.splice(Math.floor(roll() * options.length), 1)[0]!;
            visited.add(next); route.push(next);
            if (search(next)) return true;
            visited.delete(next); route.pop();
        }
        return false;
    };
    if (!search(source)) throw new Error("Could not connect puzzle endpoints");
    const solution = Array.from({ length: 16 }, () => {
        let mask = [3, 5, 7][Math.floor(roll() * 3)]!;
        for (let n = Math.floor(roll() * 4); n > 0; n--) mask = rotateTile(mask);
        return mask;
    });
    for (const [n, at] of route.entries()) {
        let mask = n === 0 ? 8 : 0;
        if (n === route.length - 1) mask |= 2;
        for (const next of [route[n - 1], route[n + 1]]) {
            if (next === undefined) continue;
            const dir = DIRECTIONS.findIndex((_, dir) => neighbour(at, dir) === next);
            mask |= 1 << dir;
        }
        solution[at] = mask;
    }
    const tiles = solution.map((mask) => {
        for (let n = Math.floor(roll() * 4); n > 0; n--) mask = rotateTile(mask);
        return mask;
    });
    // The goal always starts closed to the outside; no board arrives already solved.
    while (tiles[goal]! & 2) tiles[goal] = rotateTile(tiles[goal]!);
    const needed = route.reduce((sum, at) => sum + turnsTo(tiles[at]!, solution[at]!), 0);
    const moves = needed + Math.max(0, Math.floor(extraMoves) || 0);
    const state: PuzzleState = { tiles, solution, route, source, goal, movesLeft: moves, movesTotal: moves, revision: 0, solved: false };
    return { needed, state };
}

/** Returns false for stale, invalid, exhausted or already-finished actions. */
export function turnPuzzle(s: PuzzleState, index: number, revision: number): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= 16 || revision !== s.revision || s.solved || s.movesLeft <= 0) return false;
    s.tiles[index] = rotateTile(s.tiles[index]!);
    s.movesLeft--; s.revision++; s.active = index;
    s.solved = puzzleSolved(s.tiles, s.source, s.goal);
    return true;
}
