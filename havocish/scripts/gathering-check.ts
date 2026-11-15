/** Button-game regressions, with no database, Discord connection or real timers. */
import assert from "node:assert/strict";
import { grid, gridRules, makeWall, swing, type GridState } from "../src/ui/gathering/grid.js";
import { find } from "../src/ui/gathering/find.js";
import { timing } from "../src/ui/gathering/timing.js";
import { DEFAULT_GUILD_CONFIG } from "../src/types/guild.js";
import { NO_MODS } from "../src/player/twists.js";
import type { Ctx, Run } from "../src/ui/gathering/run.js";
import { createCanvas } from "@napi-rs/canvas";
import { drawGatheringPanel, panelSymbols, PANEL_H, PANEL_W, type GatheringPanel } from "../src/content/gatheringPanel.js";
import { normalizeGathering } from "../src/content/normalizeGathering.js";
import { mergeConfig } from "../src/db/guilds.js";
import { timingSceneOf, findSceneOf } from "../src/content/gatheringScenes.js";
import { puzzleCellXY } from "../src/content/puzzleDraw.js";
import { makePuzzle, puzzleRules, puzzleSolved, poweredTiles, rotateTile, turnPuzzle, turnsTo } from "../src/content/puzzle.js";
import { rng } from "../src/content/gridDraw.js";
import { puzzle } from "../src/ui/gathering/puzzle.js";
import { runXpMultiplier } from "../src/ui/gathering/run.js";

const config = structuredClone(DEFAULT_GUILD_CONFIG);
config.shop.items = { sample: { id: "sample", name: "Sample", emoji: "💎", rarity: "rare", categoryId: "test", price: 1 } };
const run = (): Run => ({
    ownerId: "1", discordGuildId: "2", userId: 1, guildId: 2,
    activity: { id: "test", name: "Test", emoji: "💎", skillName: "Test", game: "grid", enabled: true, locations: {} },
    location: { id: "test", name: "Test", emoji: "💎", minSkill: 1, skillXp: 1, loot: [{ itemId: "sample", chance: 1, min: 1, max: 1 }] },
    skill: 1, toolId: null, toolBonus: 0, energyLabel: "⚡ 9/10", found: {}, status: null,
    message: null, timer: null, deadline: null, state: null,
    mods: { ...NO_MODS, rules: new Set() },
});
let scheduled: (() => void | Promise<void>) | undefined;
const ctx: Ctx = { config, alive: () => true, refresh: async () => {}, end: async () => {}, later: (_ms, fn) => { scheduled = fn; } };

const g = run();
const gs = grid.start(g, grid.words, ctx);
assert.equal(gs.cells.length, 20, "Grid uses the newer 5×4 board");
assert.equal(gs.swings, 12);
assert.equal(swing(gs, 1.5, false), false);
assert.equal(swing(gs, 15, false), true);
assert.equal(gs.cells[15]!.kind, "open");
assert.equal(gs.pos, 15);
assert.equal(grid.body(g, gs, grid.words, config).rows.length, 4);
const rules = gridRules(g.location, 1);
const wall = makeWall(rules, () => ({itemId: "sample", quantity: 1}));
assert.equal(wall.filter((c) => c.kind === "ore").length, 4);
const state: GridState = { cells: Array.from({length: 20}, () => ({kind: "rock", hp: 1, max: 1})), swings: 12, rules, pos: -1, last: null };
state.cells[15] = {kind: "ore", hp: 2, max: 2, itemId: "sample", quantity: 1};
swing(state, 15, false);
assert.equal(state.cells[15]!.hp, 1, "finds retain durability");
swing(state, 15, false);
assert.equal(state.last?.got?.itemId, "sample");

const f = run(); f.mods.rules.add("find.twin");
const fs = find.start(f, find.words, ctx);
assert.match(find.body(f, fs, find.words, config).text, /two targets/);
const initialDeadline = fs.endsAt;
find.click(f, fs, find.words, "pick", `${fs.round}.1.5`, Date.now(), ctx);
assert.equal(fs.endsAt, initialDeadline, "malformed tile indices do not consume time");
assert.deepEqual(f.found, {}, "malformed tile indices do not grant loot");
const first = fs.targets[0]!;
find.click(f, fs, find.words, "pick", `${fs.round}.${first}`, Date.now(), ctx);
assert.equal(f.found.sample, 1);
const deadline = fs.endsAt;
find.click(f, fs, find.words, "pick", `${fs.round}.${first}`, Date.now(), ctx);
assert.equal(fs.endsAt, deadline, "duplicate found tiles do not cost time");
assert.equal(f.found.sample, 1, "duplicate found tiles do not grant loot twice");
const second = fs.targets[0]!;
find.click(f, fs, find.words, "pick", `${fs.round}.${second}`, deadline + 1, ctx);
assert.equal(f.found.sample, 1, "late targets do not grant loot");
assert.equal(fs.round, 2, "a late pick moves to the next round");
assert.equal(f.status, find.words.slow);
const wrong = fs.cells.findIndex((_, i) => !fs.targets.includes(i));
const beforeWrong = fs.endsAt;
find.click(f, fs, find.words, "pick", `${fs.round}.${wrong}`, Date.now(), ctx);
assert.equal(fs.endsAt, beforeWrong - 2000, "a wrong choice costs exactly two seconds");

const t = run();
const ts = timing.start(t, timing.words, ctx);
timing.click(t, ts, timing.words, "start", "0", Date.now(), ctx);
assert.equal(ts.attemptsLeft, 2);
assert(scheduled);
const savedRandom = Math.random;
Math.random = () => 0;
try { await scheduled(); } finally { Math.random = savedRandom; }
assert.equal(ts.phase, "signal");
timing.click(t, ts, timing.words, "act", "1", ts.signalAt, ctx);
assert.equal(ts.phase, "pull");
const pull = timing.body(t, ts, timing.words, config).rows[0]!.components[ts.dir === "left" ? 0 : 1]!.data;
assert("custom_id" in pull);
const arg = pull.custom_id!.split(":")[3]!;
timing.click(t, ts, timing.words, "pull", arg, Date.now(), ctx);
assert.equal(ts.roundsLeft, 1);
timing.click(t, ts, timing.words, "pull", arg, Date.now(), ctx);
assert.equal(ts.roundsLeft, 1, "a repeated direction click cannot skip the next pull");
timing.click(t, ts, timing.words, "pull", `${ts.attempt}.${ts.roundsLeft}.${ts.dir}`, Date.now(), ctx);
assert.equal(t.found.sample, 1);
timing.click(t, ts, timing.words, "start", "0", Date.now(), ctx);
assert.equal(ts.attemptsLeft, 2, "an old Start button cannot consume another attempt");
timing.click(t, ts, timing.words, "start", "1", Date.now(), ctx);
ts.phase = "signal"; ts.signalAt = Date.now();
timing.click(t, ts, timing.words, "act", "2", ts.signalAt - 1, ctx);
assert.equal(t.status, timing.words.early, "a click stamped before the signal cannot land a find");
assert.equal(t.found.sample, 1);

console.log("Gathering checks passed: feedback, instructions, deadlines, duplicate and stale clicks.");

const canvas = createCanvas(PANEL_W, PANEL_H);
const paint = canvas.getContext("2d");
const panel: GatheringPanel = {
    game: "find", title: "Sample", subtitle: "Location", progress: "3 / 5 tries", remaining: 3, total: 5,
    cells: [{ label: "?", tone: "hidden" }, { label: "!", tone: "found" }],
};
drawGatheringPanel(paint, panel);
const foundScene = canvas.toBuffer("image/png");
drawGatheringPanel(paint, { ...panel, cells: panel.cells!.map((c) => ({ ...c, tone: "hidden" })) });
assert.notDeepEqual(canvas.toBuffer("image/png"), foundScene, "found objects have a visible marker");
const hidden = { ...panel, cells: [{ label: "secret", tone: "hidden" as const, covered: true }] };
drawGatheringPanel(paint, hidden);
const coveredScene = canvas.toBuffer("image/png");
drawGatheringPanel(paint, { ...hidden, cells: [{ label: "different secret", tone: "hidden", covered: true }] });
assert.deepEqual(canvas.toBuffer("image/png"), coveredScene, "Glimpse hides the identity of covered objects");
assert.deepEqual(panelSymbols(hidden), [], "covered objects are not fetched or rendered as images");
const timingPanel = { ...panel, game: "timing" as const, phase: "waiting" as const };
drawGatheringPanel(paint, timingPanel);
const waitingScene = canvas.toBuffer("image/png");
drawGatheringPanel(paint, { ...timingPanel, phase: "signal" });
assert.notDeepEqual(canvas.toBuffer("image/png"), waitingScene, "the signal changes the focal object and water");
drawGatheringPanel(paint, { ...timingPanel, phase: "pull", direction: "left" });
const leftScene = canvas.toBuffer("image/png");
drawGatheringPanel(paint, { ...timingPanel, phase: "pull", direction: "right" });
assert.notDeepEqual(canvas.toBuffer("image/png"), leftScene, "pulls change the line and object direction");
const replacement = createCanvas(96, 96);
replacement.getContext("2d").fillStyle = "#ff0000";
replacement.getContext("2d").fillRect(0, 0, 96, 96);
drawGatheringPanel(paint, { ...timingPanel, phase: "signal" }, {}, { signal: replacement });
const pixel = [...paint.getImageData(360, 160, 1, 1).data].slice(0, 3);
assert.deepEqual(pixel, [255, 0, 0], "signal artwork replaces the default focal object");
drawGatheringPanel(paint, { ...timingPanel, phase: "signal", ended: true }, {}, { signal: replacement });
assert.notDeepEqual([...paint.getImageData(360, 160, 1, 1).data].slice(0, 3), pixel, "finished runs stop showing an active signal");
console.log("Gathering scene checks passed: discoveries, Glimpse, reaction states, directions and custom artwork.");

const settings = ["workshop", "signal", "fishing"] as const;
const scenes = settings.map((timingScene) => {
    drawGatheringPanel(paint, { ...timingPanel, timingScene });
    return canvas.toBuffer("image/png");
});
assert.notDeepEqual(scenes[0], scenes[1], "Workshop and Signal station change the actual background");
assert.notDeepEqual(scenes[1], scenes[2], "Fishing is a distinct optional setting");
assert.equal(timingSceneOf(undefined), "workshop");
assert.equal(timingSceneOf("invalid"), "workshop");
const background = createCanvas(472, 304);
background.getContext("2d").fillStyle = "#0000ff";
background.getContext("2d").fillRect(0, 0, 472, 304);
for (const timingScene of settings) {
    drawGatheringPanel(paint, { ...timingPanel, timingScene }, {}, { background });
    for (const [x, y] of [[24, 260], [100, 210], [180, 180], [352, 48]]) {
        assert.deepEqual([...paint.getImageData(x!, y!, 1, 1).data].slice(0, 3), [0, 0, 255], `${timingScene}: a custom background isn't covered by built-in scenery, props or lighting`);
    }
}
console.log("Timing customization checks passed: distinct settings, neutral default and full background replacement.");

const searchSettings = ["clearing", "ruins", "cargo"] as const;
const searchScenes = searchSettings.map((findScene) => {
    drawGatheringPanel(paint, { ...panel, findScene, look: "mine" });
    return canvas.toBuffer("image/png");
});
assert.notDeepEqual(searchScenes[0], searchScenes[1], "Find scenes change geometry even with the same palette");
assert.notDeepEqual(searchScenes[1], searchScenes[2], "Ruins and Cargo hold have different scenery and patches");
assert.equal(findSceneOf(undefined), "clearing");
assert.equal(findSceneOf("invalid"), "clearing");
const objectSprite = createCanvas(12, 12);
objectSprite.getContext("2d").fillStyle = "#ffffff";
objectSprite.getContext("2d").fillRect(0, 0, 12, 12);
for (const findScene of searchSettings) {
    const customScene: GatheringPanel = { ...panel, findScene, cells: Array.from({ length: 16 }, () => ({ label: "item", tone: "hidden" })) };
    drawGatheringPanel(paint, customScene, { item: objectSprite }, { background });
    for (const [x, y] of [[24, 260], [80, 180], [124, 36], [128, 80]]) {
        assert.deepEqual([...paint.getImageData(x!, y!, 1, 1).data].slice(0, 3), [0, 0, 255], `${findScene}: uploaded backgrounds remain visible under built-in patches, plants and props`);
    }
    drawGatheringPanel(paint, { ...hidden, findScene });
    const concealed = canvas.toBuffer("image/png");
    drawGatheringPanel(paint, { ...hidden, findScene, cells: [{ label: "another secret", tone: "hidden", covered: true }] });
    assert.deepEqual(canvas.toBuffer("image/png"), concealed, `${findScene}: Glimpse keeps object identity hidden`);
}
console.log("Find customization checks passed: scene geometry, background replacement and Glimpse in every setting.");

const coveredRun = run();
const coveredState = find.start(coveredRun, find.words, ctx);
coveredState.hiddenAt = Date.now() - 1;
const hiddenRender = await find.scene!(coveredRun, coveredState, find.words, config);
assert(find.body(coveredRun, coveredState, find.words, config).rows.every((row) => row.components.every((button) => "label" in button.data && button.data.label === find.words.hidden)), "covered buttons also conceal their labels");
coveredState.cells.fill("changed secret");
assert.deepEqual(await find.scene!(coveredRun, coveredState, find.words, config), hiddenRender, "the live renderer cannot disclose covered objects after loading images");

const legacy = {
    activities: {
        mine: { game: "dig", name: "My mine", words: { rock: "Panel" }, locations: { a: { difficulty: { swings: 17, tries: 5, ores: 8, finds: 2 }, loot: [{ itemId: "sample", chance: 1 }] } } },
        salvage: { game: "grid", words: { tile: "Plate", hazard: "⚡" }, locations: { a: { difficulty: { tries: 9, finds: 5, hazards: 2 }, traits: [{ effects: { rules: ["grid.clustered", "dig.seams"] } }] } } },
    },
    conditions: { fog: { effects: { rules: ["dig.dark", "grid.unstable", "find.glimpse"] } } },
};
const before = structuredClone(legacy);
const upgraded = normalizeGathering(legacy);
assert.equal(upgraded.activities.mine.game, "grid");
assert.deepEqual(upgraded.activities.mine.locations.a.difficulty, { swings: 17, ores: 8 }, "newer settings win over the old reveal settings");
assert.deepEqual(upgraded.activities.mine.locations.a.loot, legacy.activities.mine.locations.a.loot);
assert.deepEqual(upgraded.activities.salvage.locations.a.difficulty, { ores: 5, loose: 2 }, "old reveal tries are dropped, not read as swings");
assert.deepEqual(upgraded.activities.salvage.locations.a.traits[0]!.effects.rules, ["grid.seams"]);
assert.deepEqual(upgraded.conditions.fog.effects.rules, ["grid.dark", "grid.loose", "find.glimpse"]);
assert.equal((upgraded.activities.salvage.words as Record<string, string>).rock, "Plate");
assert.deepEqual(legacy, before, "read compatibility never mutates saved data");
assert.deepEqual(normalizeGathering(upgraded), upgraded, "upgrading an already-upgraded activity is stable");
const rawConfig = structuredClone(config);
rawConfig.gathering.activities = legacy.activities as unknown as typeof rawConfig.gathering.activities;
assert.equal(mergeConfig(rawConfig).gathering.activities.mine!.game, "grid", "the bot config read uses compatibility");
console.log("Grid compatibility checks passed: old names, settings, rules, loot and idempotence.");

for (let seed = 1; seed <= 1000; seed++) {
    const state = makePuzzle(0, rng(seed));
    assert(!puzzleSolved(state.tiles, state.source, state.goal), `board ${seed} starts unsolved`);
    assert(state.movesTotal >= 5, `board ${seed} needs at least 5 turns`);
    assert(puzzleSolved(state.solution, state.source, state.goal), `board ${seed} has a valid solution`);
    assert.equal(new Set(state.route).size, state.route.length, "solution routes have no repeated tiles");
    for (const at of state.route) {
        const turns = turnsTo(state.tiles[at]!, state.solution[at]!);
        for (let n = 0; n < turns && !state.solved; n++) assert(turnPuzzle(state, at, state.revision));
        if (state.solved) break;
    }
    assert(state.solved && state.movesLeft >= 0, `board ${seed} solves within its exact minimum-route budget`);
    assert(!turnPuzzle(state, 0, state.revision), "solved boards cannot consume more moves");
}
assert.deepEqual(puzzleRules({ extraMoves: NaN, rewards: 999 }), { extraMoves: 6, rewards: 5 });
assert.equal(puzzleRules({}, 21, 2, 2).extraMoves, 6, "skill and tool bonuses combine with condition difficulty");
assert.equal(puzzleRules({ extraMoves: 0 }, 1, 0, 100).extraMoves, 0, "conditions cannot remove the guaranteed solution budget");
for (const mask of [3, 5, 7, 10, 12, 14]) {
    assert.equal(rotateTile(rotateTile(rotateTile(rotateTile(mask)))), mask);
}
assert.deepEqual([...poweredTiles([10, 5, 10, 10, ...Array(12).fill(5)], 0)], [0], "connections must match in both directions");
const pr = run(); pr.activity.game = "puzzle"; pr.mods.xp = 1.5;
const ps = puzzle.start(pr, puzzle.words, ctx); pr.state = ps;
assert.equal(runXpMultiplier(pr), 0, "unfinished puzzles cannot earn skill XP by leaving or timing out");
const beforeTurn = ps.movesLeft;
assert(!turnPuzzle(ps, 1.5, ps.revision));
assert.equal(ps.movesLeft, beforeTurn);
const firstTurn = puzzle.click(pr, ps, puzzle.words, "rotate", "0.0", Date.now(), ctx);
assert.equal(firstTurn, undefined);
assert.equal(ps.movesLeft, beforeTurn - 1);
puzzle.click(pr, ps, puzzle.words, "rotate", "1.0", Date.now(), ctx);
assert.equal(ps.movesLeft, beforeTurn - 1, "stale or duplicate button clicks do not spend moves");
// Restore the known route; the preview and Discord use the same turn function.
for (const at of ps.route) {
    const turns = turnsTo(ps.tiles[at]!, ps.solution[at]!);
    for (let n = 0; n < turns && !ps.solved; n++) puzzle.click(pr, ps, puzzle.words, "rotate", `${at}.${ps.revision}`, Date.now(), ctx);
    if (ps.solved) break;
}
assert(ps.solved);
assert.equal(pr.found.sample, 3, "completion rolls the configured loot");
assert.equal(runXpMultiplier(pr), 1.5, "solved boards retain normal XP modifiers");
puzzle.click(pr, ps, puzzle.words, "rotate", `0.${ps.revision}`, Date.now(), ctx);
assert.equal(pr.found.sample, 3, "completion rewards cannot be claimed twice");
const failedRun = run(); failedRun.activity.game = "puzzle";
const failedPuzzle = puzzle.start(failedRun, puzzle.words, ctx); failedRun.state = failedPuzzle; failedPuzzle.movesLeft = 1;
assert.equal(puzzle.click(failedRun, failedPuzzle, puzzle.words, "rotate", "0.0", Date.now(), ctx), "out");
assert.deepEqual(failedRun.found, {});
assert.equal(runXpMultiplier(failedRun), 0);
assert(puzzle.body(failedRun, failedPuzzle, puzzle.words, config).rows.every((row) => row.components.every((b) => b.data.disabled)), "exhausted boards disable every tile");
console.log("Puzzle checks passed: 1000 solvable boards, reciprocal paths, move budgets, stale clicks and completion-only rewards.");

const puzzlePanel: GatheringPanel = { ...panel, game: "puzzle", puzzle: { tiles: makePuzzle(6, rng(73)).tiles, source: 8, goal: 15 }, look: "mine" };
const puzzleScenes = (["runes", "water", "circuit"] as const).map((puzzleScene) => {
    drawGatheringPanel(paint, { ...puzzlePanel, puzzleScene });
    return canvas.toBuffer("image/png");
});
assert.notDeepEqual(puzzleScenes[0], puzzleScenes[1], "Rune and Water connector geometry differ with the same palette");
assert.notDeepEqual(puzzleScenes[1], puzzleScenes[2], "Circuit connectors have distinct traces and tile hardware");
drawGatheringPanel(paint, puzzlePanel, {}, { background });
assert.deepEqual([...paint.getImageData(48, 32, 1, 1).data].slice(0, 3), [0, 0, 255], "custom puzzle backgrounds replace the environment");
const connector = createCanvas(76, 76);
connector.getContext("2d").fillStyle = "#ff0000";
connector.getContext("2d").fillRect(36, 0, 4, 38);
const rotatedTiles = Array(16).fill(5); rotatedTiles[0] = 10;
drawGatheringPanel(paint, { ...puzzlePanel, puzzle: { tiles: rotatedTiles, source: 4, goal: 7 } }, {}, { straight: connector });
const firstCell = puzzleCellXY(0);
assert.deepEqual([...paint.getImageData(firstCell.x + 60, firstCell.y + 38, 1, 1).data].slice(0, 3), [255, 0, 0], "uploaded connector artwork rotates with its tile");
console.log("Puzzle art checks passed: scene styles, full backgrounds and rotating connector uploads.");

