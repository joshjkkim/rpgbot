import type { Metadata } from "next";
import { isAdmin } from "@/app/lib/admin";
import { dailyOverrides } from "@/app/lib/daily";
import { dayNumber } from "@content/daily";
import { dailyFor } from "@content/dailyWorlds";
import DailyRun from "./dailyRun";

export const metadata: Metadata = {
  title: "Daily",
  description: "A new havocish world every day: 24 hours to gather, craft, fight and beat its boss. The same day for everyone; how fast can you do it?",
};
export const dynamic = "force-dynamic";

/** The Daily fills the screen with its own world, so it has no site header or footer; its HUD links home. */
export default async function DailyPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  // Admins can play any day ahead of time (?day=12), to check what they set on /admin.
  const asked = Number((await searchParams).day);
  const day = Number.isInteger(asked) && asked > 0 && (await isAdmin()) ? asked : dayNumber();
  // Built here so the page's own code carries only today, not every world.
  const daily = dailyFor(day, (await dailyOverrides(day)).get(day));
  return <DailyRun key={day} daily={daily} />;
}
