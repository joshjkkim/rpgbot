import { totalXpForLevel } from "./levelCurve";
import { PACES, type Pace } from "@content/setup";

export * from "@content/setup";

/** How many XP-earning messages reach `level` at this pace, ignoring dailies and bonuses. */
export function messagesToLevel(pace: Pace, level: number) {
  const p = PACES[pace];
  return Math.ceil(totalXpForLevel(level, { ...p.curve, xpOverrides: {} }) / p.basePerMessage);
}
