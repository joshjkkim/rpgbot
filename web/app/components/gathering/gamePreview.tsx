"use client";

import { useEffect, useRef, useState } from "react";
import { drawGatheringPanel, panelSymbols, PANEL_H, PANEL_W, type GatheringPanel } from "@content/gatheringPanel";
import { SelectField } from "@/app/components/ui/form";
import { twemojiUrl } from "@/app/daily/emoji";
import type { GatheringActivity } from "./gatheringEditor";
import { sceneArtSlots } from "@content/gatheringScenes";
import { gridImagePath } from "@content/gridLooks";
import { makePuzzle, poweredTiles, puzzleRules, tileName, TILE_SHAPES, turnPuzzle, type PuzzleState } from "@content/puzzle";
import { rng } from "@content/gridDraw";

type Props = {
  activity: GatheringActivity;
  defaults: Record<string, string>;
  shopItems: Record<string, { name?: string; emoji?: string }>;
};

export default function GamePreview({ activity: a, defaults, shopItems }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [locationId, setLocationId] = useState("");
  const [stage, setStage] = useState("start");
  const [artStatus, setArtStatus] = useState<{ key: string; failed: string[] }>({ key: "", failed: [] });
  const locations = Object.values(a.locations ?? {});
  const location = locations.find((l) => l.id === locationId) ?? locations[0];
  const d = location?.difficulty ?? {};
  const extraMoves = puzzleRules(d).extraMoves;
  const initialPuzzle = makePuzzle(extraMoves, rng(73));
  const practiceKey = `${location?.id ?? ""}:${extraMoves}`;
  const [practice, setPractice] = useState<{ key: string; state: PuzzleState } | null>(null);
  const board = practice?.key === practiceKey ? practice.state : initialPuzzle;
  const powered = poweredTiles(board.tiles, board.source);
  const w = { ...defaults, ...a.words };
  const loot = (location?.loot ?? []).filter((l) => l.chance > 0 && shopItems[l.itemId]);
  const item = loot[0] ? shopItems[loot[0].itemId] : undefined;
  const target = item?.emoji || "✨";
  const progressed = stage !== "start";
  const panel: GatheringPanel = {
    game: a.game === "timing" ? "timing" : a.game === "puzzle" ? "puzzle" : "find",
    timingScene: a.timingScene,
    findScene: a.findScene,
    puzzleScene: a.puzzleScene,
    title: a.name || "Gathering", subtitle: location?.name ?? "Add a location to set its rules",
    progress: "", remaining: 0, total: 1,
    look: a.look, colours: a.colours, art: a.art,
  };
  let options: { value: string; label: string }[];
  if (panel.game === "timing") {
    options = [{ value: "start", label: "Ready" }, { value: "waiting", label: "Waiting" }, { value: "signal", label: "Signal" }, { value: "pull", label: "Direction" }, { value: "fake", label: "False alarm" }];
    panel.phase = stage === "start" ? "ready" : stage as "waiting" | "signal" | "pull" | "fake";
    panel.focus = stage === "start" ? w.start : stage === "signal" ? w.signal : stage === "pull" ? w.pull.replace("{dir}", w.left) : stage === "fake" ? w.fake : w.waiting;
    panel.direction = "left";
    panel.total = d.attempts ?? 3;
    panel.remaining = Math.max(0, panel.total - (progressed ? 1 : 0));
    panel.progress = `${panel.remaining} / ${panel.total} ${w.attempts}`;
  } else if (panel.game === "find") {
    options = [{ value: "start", label: "Searching" }, { value: "found", label: "Target found" }, { value: "covered", label: "Covered (Glimpse)" }];
    const decoys = (w.decoys ?? "").split(/\s+/).filter((v) => v && v !== target).slice(0, Math.max(1, d.decoyKinds ?? 3));
    panel.title = w.prompt.replace("{target}", item?.name ?? "a find");
    panel.total = d.rounds ?? 3;
    panel.remaining = Math.min(panel.total, 1);
    panel.progress = `${w.rounds} ${panel.remaining} / ${panel.total}`;
    panel.cells = Array.from({ length: 16 }, (_, i) => ({
      label: i === 6 ? target : decoys[i % Math.max(1, decoys.length)] ?? "▫️",
      tone: stage === "found" && i === 6 ? "found" : "hidden",
      covered: stage === "covered",
    }));
  } else {
    options = [];
    panel.puzzle = { tiles: board.tiles, source: board.source, goal: board.goal, active: board.active, solved: board.solved };
    panel.remaining = board.movesLeft; panel.total = board.movesTotal;
  }
  const panelKey = JSON.stringify(panel);
  useEffect(() => {
    let live = true;
    const sample = JSON.parse(panelKey) as GatheringPanel;
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const draw = (images: Record<string, HTMLImageElement | HTMLCanvasElement> = {}) => {
      if (!live) return;
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      const art = Object.fromEntries(Object.keys(sceneArtSlots(sample.game)).map((slot) => [slot, images[`art:${slot}`]]));
      drawGatheringPanel(ctx, sample, images, art);
    };
    draw();
    const failed: string[] = [];
    const assets = [
      ...panelSymbols(sample).map((label) => {
        const custom = /^<a?:\w+:(\d+)>$/.exec(label);
        return [label, custom ? `https://cdn.discordapp.com/emojis/${custom[1]}.png` : twemojiUrl(label)] as const;
      }),
      ...Object.keys(sceneArtSlots(sample.game)).map((slot) => [`art:${slot}`, gridImagePath(sample.art?.[slot])] as const),
    ];
    Promise.all(assets.map(async ([label, url]) => {
      if (!url) return null;
      const img = await new Promise<HTMLImageElement | null>((resolve) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        const timer = setTimeout(() => resolve(null), 5000);
        image.onload = () => { clearTimeout(timer); resolve(image); };
        image.onerror = () => { clearTimeout(timer); resolve(null); };
        image.src = url;
      });
      if (!img) {
        if (label.startsWith("art:")) failed.push(sceneArtSlots(sample.game)[label.slice(4)].label);
        return null;
      }
      if (label.startsWith("art:")) return [label, img] as const;
      const sprite = document.createElement("canvas");
      sprite.width = sprite.height = 12;
      sprite.getContext("2d")?.drawImage(img, 0, 0, 12, 12);
      return [label, sprite] as const;
    })).then((entries) => {
      if (!live) return;
      draw(Object.fromEntries(entries.filter((e) => e !== null)));
      setArtStatus({ key: panelKey, failed });
    });
    return () => { live = false; };
  }, [panelKey]);

  return (
    <div className="max-w-[496px] space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Preview location" value={location?.id ?? ""} options={locations.map((l) => ({ value: l.id, label: l.name }))} onChange={setLocationId} />
        {panel.game !== "puzzle" && <SelectField label="Example state" value={stage} options={options} onChange={setStage} />}
      </div>
      <canvas ref={canvas} width={PANEL_W * 2} height={PANEL_H * 2} className="h-auto w-full border border-[var(--border)]" aria-label={panel.game === "puzzle" ? `${a.name} puzzle board. ${board.movesLeft} moves remaining. Use the tile buttons to rotate connections.` : `${a.name} scene preview, ${options.find((o) => o.value === stage)?.label}`} />
      {panel.game === "puzzle" && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text)]">{board.movesLeft} {w.moves} · {w.prompt.replace(/\{start\}/g, () => `${w.source} ${tileName(board.source)}`).replace(/\{goal\}/g, () => `${w.goal} ${tileName(board.goal)}`)}</p>
          <div className="grid grid-cols-4 gap-1">
            {board.tiles.map((mask, i) => (
              <button key={i} type="button" disabled={board.solved || board.movesLeft <= 0}
                aria-label={`${tileName(i)}: ${["north", "east", "south", "west"].filter((_, direction) => mask & (1 << direction)).join(", ")}. Rotate clockwise.`}
                className="border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm disabled:opacity-50"
                style={{ color: powered.has(i) ? "#8fbf72" : undefined }}
                onClick={() => setPractice((old) => {
                  const previous = old?.key === practiceKey ? old.state : initialPuzzle;
                  const next = { ...previous, tiles: [...previous.tiles] };
                  return turnPuzzle(next, i, board.revision) ? { key: practiceKey, state: next } : old;
                })}>
                {w.rotate.replace(/\{tile\}/g, () => tileName(i)).replace(/\{shape\}/g, () => TILE_SHAPES[mask])}
              </button>
            ))}
          </div>
          <p role="status" className="text-sm text-[var(--muted)]">{board.solved ? w.solved : board.movesLeft <= 0 ? w.failed : w.hint}</p>
          <button type="button" className="text-sm text-[var(--muted)] underline" onClick={() => setPractice({ key: practiceKey, state: makePuzzle(extraMoves) })}>New practice board</button>
        </div>
      )}
      {artStatus.key === panelKey && artStatus.failed.length > 0 && <p role="status" className="text-xs text-amber-400">Couldn’t load {artStatus.failed.join(", ")}. Default scenery is shown.</p>}
      <p className="text-xs text-[var(--muted)]">{panel.game === "puzzle" ? "Practice at skill 1 with no tool or condition bonuses. This board uses no energy and awards no rewards." : "Sample scenes at skill 1 with no tool or condition bonuses. Wording and location settings update the preview. Players use buttons below the scene in Discord."}</p>
      {!loot.length && <p className="text-xs text-amber-400">Add items to this location’s loot table to preview its finds.</p>}
    </div>
  );
}
