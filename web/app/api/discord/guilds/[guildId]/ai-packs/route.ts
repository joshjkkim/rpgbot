import { NextResponse } from "next/server";
import { requireGuildManager } from "@/app/lib/discord";
import { limitsFor } from "@/app/lib/aiUsage";
import { madeWorlds, makeWorld } from "@/app/lib/aiWorld";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A whole world takes the model a minute or two to write.
export const maxDuration = 300;

const AUTH_ERRORS = { 401: "unauthorized", 403: "forbidden", 503: "discord_unavailable" } as const;

/** The server's AI-made worlds, and how many more it can make. */
export async function GET(_request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const auth = await requireGuildManager(guildId);
  if (!auth.ok) return NextResponse.json({ error: AUTH_ERRORS[auth.status] }, { status: auth.status });
  const [rows, { packs }] = await Promise.all([madeWorlds(guildId), limitsFor(guildId)]);
  return NextResponse.json({ packs: rows, left: Math.max(0, packs - rows.length), enabled: !!process.env.ANTHROPIC_API_KEY });
}

/** Makes a world from the owner's description. */
export async function POST(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const auth = await requireGuildManager(guildId);
  if (!auth.ok) return NextResponse.json({ error: AUTH_ERRORS[auth.status] }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as { prompt?: unknown } | null;
  const made = await makeWorld(guildId, body?.prompt);
  return made.ok ? NextResponse.json({ pack: made.world }) : NextResponse.json({ error: made.error, message: made.message }, { status: made.status });
}
