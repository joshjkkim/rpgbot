"use client";

import { useEffect, useRef, useState } from "react";
import { totalXpForLevel, type CurveLevels } from "@/app/lib/levelCurve";

const HEIGHT = 220;
const PAD = { top: 12, right: 16, bottom: 26, left: 52 };
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en");

// Past 10^15 the digits are float noise, and Node and the browser print them
// differently, which breaks hydration. Scientific notation reads the same everywhere.
const formatXp = (n: number) => (n >= 1e15 ? n.toExponential(2) : full.format(n));
const formatTick = (n: number) => (n >= 1e15 ? n.toExponential(0) : compact.format(n));

/** A 1, 2 or 5 × 10^n step that splits `span` into about `count` parts. */
function niceStep(span: number, count: number) {
  const raw = Math.max(span, 1) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
}

/**
 * Total XP needed for each level, from the same formula the bot uses. Shows up
 * to the level cap, or 50 levels when there is none. Dots mark XP overrides.
 */
export default function LevelCurveChart({ levels }: { levels: CurveLevels }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const last = Math.max(2, levels.maxLevel ?? 50);
  const points = Array.from({ length: last }, (_, i) => ({ level: i + 1, xp: totalXpForLevel(i + 1, levels) }));
  const peak = Math.max(...points.map((p) => p.xp));

  if (!Number.isFinite(peak) || points.some((p) => !Number.isFinite(p.xp) || p.xp < 0)) {
    return (
      <div ref={ref}>
        <p className="text-sm text-[#c96b5b]">
          These parameters give an impossible XP total, so members could never level up. Check the values above.
        </p>
      </div>
    );
  }

  const plotW = Math.max(width - PAD.left - PAD.right, 1);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const yStep = niceStep(peak, 4);
  const yMax = Math.max(yStep * Math.ceil(peak / yStep), yStep);
  const x = (level: number) => PAD.left + ((level - 1) / (last - 1)) * plotW;
  const y = (xp: number) => PAD.top + plotH * (1 - xp / yMax);

  const yTicks = Array.from({ length: Math.round(yMax / yStep) + 1 }, (_, i) => i * yStep);
  const xStep = niceStep(last - 1, Math.max(2, Math.floor(plotW / 70)));
  const xTicks = [1, ...Array.from({ length: Math.floor(last / xStep) }, (_, i) => (i + 1) * xStep)].filter(
    (l, i, all) => l <= last && (i === 0 || l - all[0] >= xStep / 2)
  );

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.level)},${y(p.xp)}`).join("");
  const area = `${line}L${x(last)},${y(0)}L${x(1)},${y(0)}Z`;
  const overrides = points.filter((p) => levels.xpOverrides?.[p.level] != null);
  const hovered = hover == null ? null : points[hover - 1];
  const stall = points.find((p) => p.xp > 1e9);

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const level = Math.round(((px - PAD.left) / plotW) * (last - 1)) + 1;
    setHover(Math.min(last, Math.max(1, level)));
  }

  return (
    <div ref={ref} className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">Total XP by level</h3>
        {overrides.length > 0 && <span className="text-xs text-[var(--muted)]">Dots are XP overrides</span>}
      </div>
      {stall && (
        <p className="text-xs text-[#c96b5b]">
          Level {stall.level} needs over a billion total XP, so members will effectively stop levelling there.
        </p>
      )}

      <div className="relative">
        <svg
          width={width}
          height={HEIGHT}
          className="block touch-none select-none"
          onPointerMove={onPointerMove}
          onPointerDown={onPointerMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`Total XP from level 1 (${formatXp(points[0].xp)}) to level ${last} (${formatXp(points[last - 1].xp)})`}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[var(--muted)] text-[11px] tabular-nums">
                {formatTick(t)}
              </text>
            </g>
          ))}
          {xTicks.map((l) => (
            <text key={l} x={x(l)} y={HEIGHT - 8} textAnchor="middle" className="fill-[var(--muted)] text-[11px] tabular-nums">
              {l}
            </text>
          ))}

          <path d={area} fill="var(--accent)" opacity={0.1} />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {overrides.map((p) => (
            <circle key={p.level} cx={x(p.level)} cy={y(p.xp)} r={4} fill="var(--accent)" stroke="var(--surface-2)" strokeWidth={2} />
          ))}

          {hovered && (
            <g pointerEvents="none">
              <line x1={x(hovered.level)} x2={x(hovered.level)} y1={PAD.top} y2={y(0)} stroke="var(--border-bright)" />
              <circle cx={x(hovered.level)} cy={y(hovered.xp)} r={4.5} fill="var(--accent)" stroke="var(--surface-2)" strokeWidth={2} />
            </g>
          )}
        </svg>

        {hovered && (
          <div
            className="pointer-events-none absolute top-1 rounded-[3px] border border-[var(--border-bright)] bg-[#0e0f14]/95 px-2.5 py-1.5 text-xs leading-5 whitespace-nowrap shadow-[0_2px_8px_rgb(0_0_0/0.6)]"
            style={{
              left: Math.min(Math.max(x(hovered.level) + 10, 0), Math.max(width - 150, 0)),
            }}
          >
            <div className="font-medium">Level {hovered.level}</div>
            <div className="tabular-nums">{formatXp(hovered.xp)} total XP</div>
            {hovered.level > 1 && (
              <div className="tabular-nums text-[var(--muted)]">
                +{formatXp(hovered.xp - points[hovered.level - 2].xp)} from level {hovered.level - 1}
              </div>
            )}
          </div>
        )}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-[var(--muted)]">Show as a table</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-sm border border-[var(--border)]">
          <table className="w-full text-xs tabular-nums">
            <thead className="sticky top-0 bg-[var(--surface-2)] text-left text-[var(--muted)]">
              <tr>
                <th className="px-3 py-1.5 font-medium">Level</th>
                <th className="px-3 py-1.5 text-right font-medium">Total XP</th>
                <th className="px-3 py-1.5 text-right font-medium">From previous level</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={p.level} className="border-t border-[var(--border)]">
                  <td className="px-3 py-1">{p.level}</td>
                  <td className="px-3 py-1 text-right">{formatXp(p.xp)}</td>
                  <td className="px-3 py-1 text-right">{i ? `+${formatXp(p.xp - points[i - 1].xp)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
