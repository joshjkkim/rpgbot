// Mirrors calculateTotalXpForLevel in havocish/src/leveling/levels.ts, which is
// what actually levels members up. `npx tsx scripts/check-level-curve.ts` at the repo root
// fails if the two drift apart.

export type CurveType = "linear" | "exponential" | "polynomial" | "logarithmic";

export type CurveLevels = {
  curveType: CurveType;
  curveParams?: Record<string, number>;
  xpOverrides?: Record<number, number>;
  maxLevel?: number | null;
};

type ParamSpec = {
  key: string;
  label: string;
  /** What the bot uses when the parameter is missing. */
  fallback: number;
  /** What the dashboard fills in when the curve type is picked. */
  suggested: number;
  step: number;
  min?: number;
};

/** The parameters the bot reads for each curve type. */
export const CURVE_PARAMS: Record<CurveType, ParamSpec[]> = {
  linear: [{ key: "rate", label: "XP per level", fallback: 100, suggested: 100, step: 1, min: 0 }],
  exponential: [
    { key: "factor", label: "Level 1 XP", fallback: 50, suggested: 100, step: 1, min: 0 },
    { key: "base", label: "Growth per level", fallback: 2, suggested: 1.15, step: 0.01, min: 1 },
  ],
  polynomial: [
    { key: "factor", label: "Level 1 XP", fallback: 100, suggested: 10, step: 1, min: 0 },
    { key: "degree", label: "Power", fallback: 2, suggested: 2, step: 0.1, min: 0 },
  ],
  logarithmic: [
    { key: "factor", label: "Scale", fallback: 200, suggested: 200, step: 1, min: 0 },
    { key: "base", label: "Log base", fallback: 2, suggested: 2, step: 0.1, min: 1.01 },
  ],
};

export const CURVE_HINTS: Record<CurveType, string> = {
  linear: "Total XP = XP per level × level.",
  exponential: "Total XP = level 1 XP × growth^(level − 1).",
  polynomial: "Total XP = level 1 XP × level^power.",
  logarithmic: "Total XP = scale × log(level + 1) in the chosen base.",
};

/**
 * Keeps only the parameters the bot reads, filling gaps with its fallbacks.
 *
 * The dashboard used to save perLevel, growth, a/power/b and a/b/c, which the
 * bot never read -- it ran on its fallbacks, or on a colliding `base`. Keeping
 * what the bot actually uses means saving changes nothing for members.
 */
export function normalizeCurveParams(type: CurveType, params: Record<string, number> = {}) {
  return Object.fromEntries(
    (CURVE_PARAMS[type] ?? []).map((s) => [s.key, params[s.key] ?? s.fallback])
  ) as Record<string, number>;
}

export function suggestedCurveParams(type: CurveType) {
  return Object.fromEntries(CURVE_PARAMS[type].map((s) => [s.key, s.suggested])) as Record<string, number>;
}

export function totalXpForLevel(level: number, levels: CurveLevels): number {
  if (level <= 0) return 0;

  const override = levels.xpOverrides?.[level];
  if (override != null) return override;

  const p = normalizeCurveParams(levels.curveType, levels.curveParams);
  switch (levels.curveType) {
    case "linear":
      return p.rate * level;
    case "exponential":
      return Math.floor(p.factor * Math.pow(p.base, level - 1));
    case "polynomial":
      return Math.floor(p.factor * Math.pow(level, p.degree));
    case "logarithmic":
      return Math.floor((p.factor * Math.log(level + 1)) / Math.log(p.base));
    default:
      return 0;
  }
}
