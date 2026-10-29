import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { dbQuery } from "@/app/lib/db";
import { limitsFor, logUsage, withinBudget } from "@/app/lib/aiUsage";
import { buildPack, parseSkeleton, SKELETON_PROMPT } from "@content/aiPack";
import type { StarterPack } from "@content/packs";

export type MadeWorld = { id: string; prompt: string; pack: StarterPack };

/** The server's AI-made worlds, newest first. */
export async function madeWorlds(guildId: string): Promise<MadeWorld[]> {
  const res = await dbQuery<MadeWorld>(`SELECT id, prompt, pack FROM ai_packs WHERE discord_guild_id = $1 ORDER BY created_at DESC`, [guildId]);
  return res.rows;
}

/**
 * Makes a world from an owner's description: checks the server's allowance and
 * the day's budget, has the model write the words, and buildPack sets every
 * number. Used by the Library, and by the bot's /setup. Callers check access.
 */
export async function makeWorld(guildId: string, rawPrompt: unknown): Promise<{ ok: true; world: MadeWorld } | { ok: false; status: number; error: string; message: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, status: 503, error: "not_configured", message: "The AI builder isn't switched on yet." };
  const prompt = typeof rawPrompt === "string" ? rawPrompt.trim() : "";
  if (prompt.length < 10 || prompt.length > 1500) return { ok: false, status: 400, error: "bad_prompt", message: "Describe your world in 10 to 1500 characters." };
  // ponytail: count-then-insert, so two clicks at once can both get through; a reservation row if that's ever abused.
  const { packs } = await limitsFor(guildId);
  if ((await madeWorlds(guildId)).length >= packs) return { ok: false, status: 429, error: "used_up", message: `This server has made all ${packs} of its worlds.` };
  if (!(await withinBudget())) return { ok: false, status: 503, error: "busy", message: "The AI features are resting for today. Try again tomorrow." };

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
  const failed = { ok: false as const, status: 502, error: "generation_failed", message: "Something went wrong making your world. Try again." };
  if (!message || message.stop_reason === "refusal" || message.stop_reason === "max_tokens" || !text) {
    return message?.stop_reason === "refusal" ? { ...failed, message: "That description couldn't be used. Try describing it another way." } : failed;
  }
  // The schema is too big for structured outputs, so the reply is read leniently and buildPack checks every part.
  const skeleton = parseSkeleton(text);
  if (!skeleton) return failed;
  const id = randomUUID();
  const pack = buildPack(skeleton, `ai-${id}`);
  await dbQuery(`INSERT INTO ai_packs (id, discord_guild_id, prompt, pack) VALUES ($1, $2, $3, $4)`, [id, guildId, prompt, JSON.stringify(pack)]);
  return { ok: true, world: { id, prompt, pack } };
}
