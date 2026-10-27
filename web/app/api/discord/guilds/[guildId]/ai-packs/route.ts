import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { requireGuildManager } from "@/app/lib/discord";
import { dbQuery } from "@/app/lib/db";
import { logUsage, withinBudget } from "@/app/lib/aiUsage";
import { buildPack, parseSkeleton, SKELETON_PROMPT } from "@content/aiPack";
import type { StarterPack } from "@content/packs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A whole world takes the model a minute or two to write.
export const maxDuration = 300;

const AUTH_ERRORS = { 401: "unauthorized", 403: "forbidden", 503: "discord_unavailable" } as const;

/** Worlds each server can make for free. */
const FREE = Number(process.env.AI_FREE_PACKS ?? 3);

async function made(guildId: string) {
  const res = await dbQuery<{ id: string; prompt: string; pack: StarterPack }>(
    `SELECT id, prompt, pack FROM ai_packs WHERE discord_guild_id = $1 ORDER BY created_at DESC`,
    [guildId]
  );
  return res.rows;
}

/** The server's AI-made worlds, and how many more it can make. */
export async function GET(_request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const auth = await requireGuildManager(guildId);
  if (!auth.ok) return NextResponse.json({ error: AUTH_ERRORS[auth.status] }, { status: auth.status });
  const rows = await made(guildId);
  return NextResponse.json({ packs: rows, left: Math.max(0, FREE - rows.length), enabled: !!process.env.ANTHROPIC_API_KEY });
}

/** Makes a world from the owner's description. The model writes the words; buildPack sets every number. */
export async function POST(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const auth = await requireGuildManager(guildId);
  if (!auth.ok) return NextResponse.json({ error: AUTH_ERRORS[auth.status] }, { status: auth.status });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "not_configured", message: "The AI builder isn't switched on yet." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { prompt?: unknown } | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 10 || prompt.length > 1500) {
    return NextResponse.json({ error: "bad_prompt", message: "Describe your world in 10 to 1500 characters." }, { status: 400 });
  }
  // ponytail: count-then-insert, so two clicks at once can both get through; a reservation row if that's ever abused.
  if ((await made(guildId)).length >= FREE) {
    return NextResponse.json({ error: "used_up", message: `Each server can make ${FREE} worlds for now.` }, { status: 429 });
  }

  if (!(await withinBudget())) return NextResponse.json({ error: "busy", message: "The AI features are resting for today. Try again tomorrow." }, { status: 503 });

  // Sonnet writes worlds about as well as Opus for half the cost (tried side by side); Haiku left the minigame words untouched.
  const message = await new Anthropic().messages
    .stream({
      model: "claude-sonnet-5-5",
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system: SKELETON_PROMPT,
      messages: [{ role: "user", content: prompt }],
    })
    .finalMessage()
    .catch((err: unknown) => {
      console.error("AI builder request failed:", err);
      return null;
    });

  if (message) await logUsage(guildId, "builder", message);
  const text = message?.content.find((b) => b.type === "text")?.text;
  if (!message || message.stop_reason === "refusal" || message.stop_reason === "max_tokens" || !text) {
    const why = message?.stop_reason === "refusal" ? "That description couldn't be used. Try describing it another way." : "Something went wrong making your world. Try again.";
    return NextResponse.json({ error: "generation_failed", message: why }, { status: 502 });
  }

  // The schema is too big for structured outputs, so the reply is read leniently and buildPack checks every part.
  const skeleton = parseSkeleton(text);
  if (!skeleton) return NextResponse.json({ error: "generation_failed", message: "Something went wrong making your world. Try again." }, { status: 502 });
  const id = randomUUID();
  const pack = buildPack(skeleton, `ai-${id}`);
  await dbQuery(`INSERT INTO ai_packs (id, discord_guild_id, prompt, pack) VALUES ($1, $2, $3, $4)`, [id, guildId, prompt, JSON.stringify(pack)]);
  return NextResponse.json({ pack: { id, prompt, pack } });
}
