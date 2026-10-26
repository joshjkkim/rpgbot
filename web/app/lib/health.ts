/**
 * The server health check (havocish/src/health/checkGuild.ts), which the bot
 * runs since only it can see its own permissions in each channel. Null when
 * the bot can't be reached. Callers must have checked access already.
 */
export async function fetchHealth(guildId: string): Promise<{ inGuild: boolean; issues?: Array<{ severity: string; message: string; page: string }> } | null> {
    const url = process.env.BOT_PREVIEW_URL?.trim();
    const secret = process.env.PREVIEW_SECRET?.trim();
    if (!url || !secret) return null;
    const res = await fetch(`${url.replace(/\/+$/, "")}/health`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-preview-secret": secret },
        body: JSON.stringify({ guildId }),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
    }).catch(() => null);
    return res?.ok ? res.json() : null;
}
