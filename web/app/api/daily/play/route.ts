import { NextResponse } from "next/server";
import { dayNumber } from "@content/daily";
import { dbQuery } from "@/app/lib/db";

/*
 * The Daily's play counts (daily_plays): the page sends "player" on a browser's first Play of the day,
 * and how each run ended. Anonymous counts for today only; anything else is ignored.
 */

const COLUMN = { player: "players", won: "wins", timeout: "timeouts", lost: "falls" } as const;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { day?: unknown; event?: unknown } | null;
  const column = COLUMN[String(body?.event) as keyof typeof COLUMN];
  if (!column || body?.day !== dayNumber()) return new NextResponse(null, { status: 204 });
  await dbQuery(
    `INSERT INTO daily_plays (day, ${column}) VALUES ($1, 1)
     ON CONFLICT (day) DO UPDATE SET ${column} = daily_plays.${column} + 1, updated_at = NOW()`,
    [body.day],
  ).catch(() => null);
  return new NextResponse(null, { status: 204 });
}
