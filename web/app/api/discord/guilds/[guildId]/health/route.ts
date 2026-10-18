import { NextResponse } from "next/server";
import { requireGuildManager } from "@/app/lib/discord";

const AUTH_ERRORS = { 401: "unauthorized", 403: "forbidden", 503: "discord_unavailable" } as const;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The server health check for the Overview. The bot runs it
 * (havocish/src/health/checkGuild.ts), since only it can see its own
 * permissions in each channel; this route checks ownership and holds the secret.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ guildId: string }> }) {
    const { guildId } = await params;

    const auth = await requireGuildManager(guildId);
    if (!auth.ok) {
        return NextResponse.json({ error: AUTH_ERRORS[auth.status] }, { status: auth.status });
    }

    const url = process.env.BOT_PREVIEW_URL?.trim();
    const secret = process.env.PREVIEW_SECRET?.trim();
    if (!url || !secret) return NextResponse.json({ error: "unavailable" }, { status: 503 });

    const res = await fetch(`${url.replace(/\/+$/, "")}/health`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-preview-secret": secret },
        body: JSON.stringify({ guildId }),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
    }).catch(() => null);

    if (!res?.ok) return NextResponse.json({ error: "unavailable" }, { status: 502 });
    return NextResponse.json(await res.json(), { headers: { "cache-control": "no-store" } });
}
