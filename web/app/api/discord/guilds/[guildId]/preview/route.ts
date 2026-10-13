import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { requireGuildOwner } from "@/app/lib/discord";

// Same meanings as the config route: sign in again, not the owner, Discord did not answer.
const AUTH_ERRORS = { 401: "unauthorized", 403: "forbidden", 503: "discord_unavailable" } as const;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A profile card or level-up banner drawn with the draft style the owner is
 * editing. The bot does the drawing (havocish/src/http/previewServer.ts) so the
 * preview is the real image; this route checks ownership and holds the secret.
 */
export async function POST(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
    const { guildId } = await params;

    const auth = await requireGuildOwner(guildId);
    if (!auth.ok) {
        return NextResponse.json({ error: AUTH_ERRORS[auth.status] }, { status: auth.status });
    }

    const url = process.env.BOT_PREVIEW_URL?.trim();
    const secret = process.env.PREVIEW_SECRET?.trim();
    if (!url || !secret) {
        return NextResponse.json({ error: "previews_unavailable" }, { status: 503 });
    }

    const body = await request.json().catch(() => null);
    const session = await getServerSession(authOptions);

    const res = await fetch(`${url.replace(/\/+$/, "")}/preview`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-preview-secret": secret },
        body: JSON.stringify({
            guildId,
            kind: body?.kind === "levelup" ? "levelup" : "profile",
            style: body?.style ?? {},
            // The owner's own name and avatar, so the preview is their card.
            user: { username: session?.user?.name, avatarUrl: session?.user?.image },
        }),
        signal: AbortSignal.timeout(10_000),
    }).catch(() => null);

    if (!res?.ok) {
        return NextResponse.json({ error: "preview_failed" }, { status: 502 });
    }
    return new Response(await res.arrayBuffer(), {
        headers: { "content-type": "image/png", "cache-control": "no-store" },
    });
}
