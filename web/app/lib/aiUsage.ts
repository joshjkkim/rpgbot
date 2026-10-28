import { dbQuery } from "@/app/lib/db";

/** Records a model call's tokens (ai_usage), for cost per server and the helper's daily cap. Never fails the request.
 *  Cached input is stored at what it's billed as (reads 0.1x, writes 1.25x), so input_tokens x price is the real cost. */
export async function logUsage(guildId: string, kind: "builder" | "helper", message: { model: string; usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } }) {
    const u = message.usage;
    const input = Math.round(u.input_tokens + (u.cache_read_input_tokens ?? 0) * 0.1 + (u.cache_creation_input_tokens ?? 0) * 1.25);
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

/** Dollars per million tokens, input and output, for the models the features use. */
const PRICES: Record<string, [number, number]> = {
    "claude-opus-5-5": [4, 20],
    "claude-sonnet-5-5": [2, 10],
    "claude-haiku-5-5": [1, 5],
};

/** Every server together can spend this much a day on AI; past it, new requests wait for tomorrow. */
const DAILY_BUDGET = Number(process.env.AI_DAILY_BUDGET_USD ?? 5);

/** False once today's spending across all servers reaches the budget. Cached input counts at full price, so it errs on the safe side. */
export async function withinBudget(): Promise<boolean> {
    const res = await dbQuery<{ model: string; input: string; output: string }>(
        `SELECT model, sum(input_tokens) AS input, sum(output_tokens) AS output FROM ai_usage WHERE created_at > NOW() - INTERVAL '1 day' GROUP BY model`
    ).catch(() => null);
    // ponytail: no table yet (migration 007 not applied) means no record, so no budget check either.
    if (!res) return true;
    const spent = res.rows.reduce((sum, r) => {
        const [i, o] = PRICES[r.model] ?? PRICES["claude-opus-5-5"]!;
        return sum + (Number(r.input) * i + Number(r.output) * o) / 1e6;
    }, 0);
    return spent < DAILY_BUDGET;
}
