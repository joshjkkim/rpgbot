import { dbQuery } from "@/app/lib/db";

/** Records a model call's tokens (ai_usage), for cost per server and the helper's daily cap. Never fails the request. */
export async function logUsage(guildId: string, kind: "builder" | "helper", message: { model: string; usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } }) {
    const u = message.usage;
    const input = u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    await dbQuery(
        `INSERT INTO ai_usage (discord_guild_id, kind, model, input_tokens, output_tokens) VALUES ($1, $2, $3, $4, $5)`,
        [guildId, kind, message.model, input, u.output_tokens]
    ).catch((err) => console.error("Logging AI usage failed:", err));
}

/** Helper messages a server has sent in the last day. */
export async function helperCallsToday(guildId: string): Promise<number> {
    const res = await dbQuery<{ n: string }>(
        `SELECT count(*) AS n FROM ai_usage WHERE discord_guild_id = $1 AND kind = 'helper' AND created_at > NOW() - INTERVAL '1 day'`,
        [guildId]
    ).catch(() => null);
    return Number(res?.rows[0]?.n ?? 0);
}
