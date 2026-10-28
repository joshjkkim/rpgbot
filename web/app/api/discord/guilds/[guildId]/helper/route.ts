import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { fetchGuildMeta, requireGuildManager } from "@/app/lib/discord";
import { dbQuery } from "@/app/lib/db";
import { fetchHealth } from "@/app/lib/health";
import { helperCallsToday, logUsage, withinBudget } from "@/app/lib/aiUsage";
import { cleanChanges, HELPER_PROMPT, outline, PROPOSE_TOOL, READ_TOOL, valueAt } from "@content/helper";
import type { GuildConfigJson } from "@content/packs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const AUTH_ERRORS = { 401: "unauthorized", 403: "forbidden", 503: "discord_unavailable" } as const;

/** Messages each server can send the helper a day. */
const DAILY = Number(process.env.AI_HELPER_DAILY ?? 20);
/** Only the last few messages go to the model, so a long chat costs no more per message than a short one. */
const KEEP = 7;

const CHANNEL_KINDS: Record<number, string> = { 0: "#", 2: "voice ", 4: "category ", 5: "#", 13: "stage ", 15: "forum #" };

/** One part of the config for read_config: never the whole thing (that's what the outline saves), and capped. */
function read(config: GuildConfigJson, path: unknown): string {
  if (!Array.isArray(path) || !path.length || !path.every((p) => typeof p === "string")) return "Give a path, section first.";
  const value = valueAt(config, path);
  if (value === undefined) return "Nothing is there.";
  const json = JSON.stringify(value);
  return json.length <= 6000 ? json : `${json.slice(0, 6000)}… (cut off: read a narrower path, like one entry)`;
}

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
    `Config outline (entries shown by name; read_config for the full detail of any part): ${JSON.stringify(outline(config))}`,
  ].join("\n\n");

  // The outline goes with every message; the model reads the parts it needs in full. Thinking is off: these are short lookups.
  const client = new Anthropic();
  const convo = (messages as Anthropic.MessageParam[]).slice(-KEEP);
  const usage = { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 };
  let message: Anthropic.Message | null = null;
  const blocks: Anthropic.ContentBlock[] = [];
  for (let turn = 0; turn < 4; turn++) {
    message = await client.messages
      .create({
        model: "claude-haiku-5-5",
        max_tokens: 4000,
        thinking: { type: "disabled" },
        system: [
          { type: "text", text: HELPER_PROMPT },
          { type: "text", text: context, cache_control: { type: "ephemeral" } },
        ],
        tools: [READ_TOOL, PROPOSE_TOOL],
        messages: convo,
      })
      .catch((err: unknown) => {
        console.error("Helper request failed:", err);
        return null;
      });
    if (!message) break;
    blocks.push(...message.content);
    const u = message.usage;
    usage.input_tokens += u.input_tokens;
    usage.cache_read_input_tokens += u.cache_read_input_tokens ?? 0;
    usage.cache_creation_input_tokens += u.cache_creation_input_tokens ?? 0;
    usage.output_tokens += u.output_tokens;
    const reads = message.content.filter((b) => b.type === "tool_use" && b.name === READ_TOOL.name) as Anthropic.ToolUseBlock[];
    if (message.stop_reason !== "tool_use" || !reads.length) break;
    convo.push({ role: "assistant", content: message.content });
    convo.push({
      role: "user",
      content: message.content.flatMap((b) => b.type !== "tool_use" ? [] : [{
        type: "tool_result" as const,
        tool_use_id: b.id,
        content: b.name === READ_TOOL.name ? read(config, (b.input as { path?: unknown }).path) : "Shown to the owner to apply.",
      }]),
    });
  }
  if (!message) return NextResponse.json({ error: "failed", message: "The helper couldn't answer just now. Try again." }, { status: 502 });
  await logUsage(guildId, "helper", { model: message.model, usage });

  const reply = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n\n").trim();
  const call = blocks.findLast((b) => b.type === "tool_use" && b.name === PROPOSE_TOOL.name);
  const input = call?.type === "tool_use" ? (call.input as { summary?: unknown; changes?: unknown }) : null;
  const changes = input ? cleanChanges(input.changes, config) : [];
  return NextResponse.json({
    reply: reply || (message.stop_reason === "refusal" ? "I can't help with that one." : ""),
    proposal: changes.length ? { summary: typeof input?.summary === "string" ? input.summary : "", changes } : null,
  });
}
