import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { makeWorld } from "@/app/lib/aiWorld";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The bot's /setup makes a world here, since the API key and the allowance
 * live on this side. Only the bot can call it: it sends PREVIEW_SECRET, as
 * this side does when it calls the bot, and has checked Manage Server itself.
 */
export async function POST(request: Request) {
  const secret = process.env.PREVIEW_SECRET?.trim();
  const sent = Buffer.from(request.headers.get("x-preview-secret") ?? "");
  if (!secret || sent.length !== Buffer.byteLength(secret) || !timingSafeEqual(sent, Buffer.from(secret))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { guildId?: unknown; prompt?: unknown } | null;
  const guildId = typeof body?.guildId === "string" && /^\d{5,20}$/.test(body.guildId) ? body.guildId : null;
  if (!guildId) return NextResponse.json({ error: "bad_guild" }, { status: 400 });
  const made = await makeWorld(guildId, body?.prompt);
  return made.ok ? NextResponse.json({ pack: made.world.pack }) : NextResponse.json({ error: made.error, message: made.message }, { status: made.status });
}
