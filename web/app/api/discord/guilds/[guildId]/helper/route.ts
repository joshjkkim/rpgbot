import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { fetchGuildMeta, requireGuildManager } from "@/app/lib/discord";
import { dbQuery } from "@/app/lib/db";
import { fetchHealth } from "@/app/lib/health";
import { helperCallsToday, logUsage, withinBudget } from "@/app/lib/aiUsage";
import { cleanChanges, HELPER_PROMPT, PROPOSE_TOOL } from "@content/helper";
import type { GuildConfigJson } from "@content/packs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const AUTH_ERRORS = { 401: "unauthorized", 403: "forbidden", 503: "discord_unavailable" } as const;

/** Messages each server can send the helper a day. */
const DAILY = Number(process.env.AI_HELPER_DAILY ?? 100);

const CHANNEL_KINDS: Record<number, string> = { 0: "#", 2: "voice ", 4: "category ", 5: "#", 13: "stage ", 15: "forum #" };

/** Answers one message, with the server's config, channels, roles and health check in view. Edits come back for the owner to apply. */
export async function POST(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const auth = await requireGuildManager(guildId);
  if (!auth.ok) return NextResponse.json({ error: AUTH_ERRORS[auth.status] }, { status: auth.status });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "not_configured", message: "The helper isn't switched on yet." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { messages?: unknown } | null;
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const valid = messages.length > 0 && messages.length <= 40 && messages.every((m, i) =>
    m && typeof m === "object" && (m as { role?: unknown }).role === (i % 2 ? "assistant" : "user")
    && typeof (m as { content?: unknown }).content === "string" && (m as { content: string }).content.length <= 4000);
  if (!valid || messages.length % 2 === 0) return NextResponse.json({ error: "bad_messages" }, { status: 400 });
  if ((await helperCallsToday(guildId)) >= DAILY) {
    return NextResponse.json({ error: "used_up", message: "The helper has answered a lot today. It'll be back tomorrow." }, { status: 429 });
  }

  if (!(await withinBudget())) return NextResponse.json({ error: "busy", message: "The AI features are resting for today. Try again tomorrow." }, { status: 503 });

  const [row, meta, health] = await Promise.all([
    dbQuery<{ config: GuildConfigJson | null }>(`SELECT config FROM guilds WHERE discord_guild_id = $1`, [guildId]),
    fetchGuildMeta(guildId),
    fetchHealth(guildId),
  ]);
  const config = row.rows[0]?.config ?? {};
  const context = [
    `Channels: ${meta ? meta.channels.filter((c) => CHANNEL_KINDS[c.type]).map((c) => `${CHANNEL_KINDS[c.type]}${c.name} (${c.id})`).join(", ") : "unknown (the bot can't list them)"}`,
    `Roles: ${meta ? meta.roles.filter((r) => r.id !== guildId).map((r) => `@${r.name} (${r.id})`).join(", ") : "unknown"}`,
    `Health check: ${health?.issues ? (health.issues.length ? health.issues.map((i) => `[${i.severity}, ${i.page} page] ${i.message}`).join(" | ") : "no problems") : health ? "the bot isn't in this server" : "unavailable"}`,
    `Config: ${JSON.stringify(config)}`,
  ].join("\n\n");

  const message = await new Anthropic().messages
    .create({
      model: "claude-haiku-5-5",
      max_tokens: 8000,
      // The prompt and this server's context stay the same through a conversation, so later messages read them from cache.
      system: [
        { type: "text", text: HELPER_PROMPT },
        { type: "text", text: context, cache_control: { type: "ephemeral" } },
      ],
      tools: [PROPOSE_TOOL],
      messages: messages as Anthropic.MessageParam[],
    })
    .catch((err: unknown) => {
      console.error("Helper request failed:", err);
      return null;
    });
  if (!message) return NextResponse.json({ error: "failed", message: "The helper couldn't answer just now. Try again." }, { status: 502 });
  await logUsage(guildId, "helper", message);

  const reply = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n\n").trim();
  const call = message.content.find((b) => b.type === "tool_use" && b.name === PROPOSE_TOOL.name);
  const input = call?.type === "tool_use" ? (call.input as { summary?: unknown; changes?: unknown }) : null;
  const changes = input ? cleanChanges(input.changes, config) : [];
  return NextResponse.json({
    reply: reply || (message.stop_reason === "refusal" ? "I can't help with that one." : ""),
    proposal: changes.length ? { summary: typeof input?.summary === "string" ? input.summary : "", changes } : null,
  });
}
