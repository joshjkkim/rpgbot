// Checks the dashboard's level-curve chart uses the same formula as the bot.
// Lives at the repo root because it spans both workspaces. Run: npx tsx scripts/check-level-curve.ts
import assert from "node:assert/strict";
import { calculateTotalXpForLevel } from "../havocish/src/leveling/levels.js";
import type { GuildConfig } from "../havocish/src/types/guild.js";
import { normalizeCurveParams, totalXpForLevel, type CurveLevels } from "../web/app/lib/levelCurve.js";

const cases: CurveLevels[] = [
  { curveType: "linear", curveParams: {} },
  { curveType: "linear", curveParams: { rate: 75 } },
  { curveType: "exponential", curveParams: { base: 1.15, factor: 100 } },
  // A config saved by the old dashboard: `base` meant starting XP, `growth` was ignored.
  { curveType: "exponential", curveParams: { base: 100, growth: 1.15 } },
  { curveType: "polynomial", curveParams: { a: 10, power: 2, b: 0 } },
  { curveType: "polynomial", curveParams: { factor: 12, degree: 1.5 }, xpOverrides: { 5: 999 } },
  { curveType: "logarithmic", curveParams: { base: 3, factor: 250 } },
];

for (const levels of cases) {
  const config = { levels: { xpOverrides: {}, ...levels } } as unknown as GuildConfig;
  for (let level = 0; level <= 60; level++) {
    assert.equal(
      totalXpForLevel(level, levels),
      calculateTotalXpForLevel(level, config),
      `${JSON.stringify(levels)} at level ${level}`
    );
  }
}

assert.deepEqual(normalizeCurveParams("linear", { base: 100, perLevel: 50 }), { rate: 100 });
assert.deepEqual(normalizeCurveParams("exponential", { base: 100, growth: 1.15 }), { factor: 50, base: 100 });

console.log(`level curve matches the bot across ${cases.length} configs`);
