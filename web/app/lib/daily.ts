import { dbQuery } from "@/app/lib/db";
import type { DailyOverride } from "@content/daily";

/** Admins' changes to days of the Daily (daily_overrides), by day. Empty until the table exists. */
export async function dailyOverrides(from: number, to = from): Promise<Map<number, DailyOverride>> {
  const res = await dbQuery<{ day: number; override: DailyOverride }>(
    `SELECT day, override FROM daily_overrides WHERE day BETWEEN $1 AND $2`, [from, to],
  ).catch(() => null);
  return new Map((res?.rows ?? []).map((r) => [r.day, r.override]));
}
