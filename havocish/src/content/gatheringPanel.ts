import { drawTimingScene, drawFindScene, type SceneImages, type TimingScene, type FindScene } from "./gatheringScenes.ts";
import type { GridColours, GridLook } from "./gridLooks.ts";
import { drawPuzzleScene, type PuzzleScene, type PuzzleView } from "./puzzleDraw.ts";

/** The same scene model is drawn in Discord and in the dashboard preview. */
export const PANEL_W = 496;
export const PANEL_H = 328;
export type GatheringPanel = {
    game: "find" | "timing" | "puzzle";
    puzzleScene?: PuzzleScene | undefined;
    puzzle?: PuzzleView;
    timingScene?: TimingScene | undefined;
    findScene?: FindScene | undefined;
    title: string;
    subtitle: string;
    progress: string;
    remaining: number;
    total: number;
    focus?: string;
    phase?: "ready" | "waiting" | "fake" | "signal" | "pull";
    direction?: "left" | "right";
    ended?: boolean;
    cells?: { label: string; tone: "hidden" | "empty" | "found" | "hazard"; covered?: boolean }[];
    look?: GridLook | undefined;
    colours?: Partial<GridColours> | undefined;
    art?: Record<string, string> | undefined;
    avatarUrl?: string | undefined;
};

export function panelSymbols(panel: GatheringPanel): string[] {
    return panel.game === "find" ? [...new Set((panel.cells ?? []).filter((c) => !c.covered).map((c) => c.label))] : [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function drawGatheringPanel(ctx: any, panel: GatheringPanel, images: SceneImages = {}, art: SceneImages = {}, face?: unknown) {
    if (panel.game === "timing") drawTimingScene(ctx, panel, art, face);
    else if (panel.game === "puzzle") {
        if (panel.puzzle) drawPuzzleScene(ctx, { ...panel.puzzle, puzzleScene: panel.puzzleScene, look: panel.look, colours: panel.colours }, art, face);
    } else drawFindScene(ctx, panel, art, images, face);
}
