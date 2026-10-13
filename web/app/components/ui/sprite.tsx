import { PALETTE, SPRITES, type SpriteName } from "@/app/sprites";

/** Character-grid pixel art as SVG rects; see app/sprites.ts. */
export function Pixels({ grid, x = 0, y = 0 }: { grid: string[]; x?: number; y?: number }) {
  return grid.flatMap((row, py) =>
    [...row].map((ch, px) =>
      ch === "." ? null : <rect key={`${px},${py}`} x={x + px} y={y + py} width={1} height={1} fill={PALETTE[ch]} />,
    ),
  );
}

export function Sprite({ name, size = 36 }: { name: SpriteName; size?: number }) {
  return (
    <svg viewBox="0 0 12 12" width={size} height={size} shapeRendering="crispEdges" aria-hidden className="shrink-0">
      <Pixels grid={SPRITES[name]} />
    </svg>
  );
}
