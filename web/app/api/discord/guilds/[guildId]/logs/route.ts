import { NextResponse } from "next/server";
import { requireGuildOwner } from "@/app/lib/discord";
import { dbQuery } from "@/app/lib/db";

// 401 = sign in again, 403 = signed in but not this server's owner,
// 503 = Discord did not answer. All three used to be reported as "forbidden".
const AUTH_ERRORS = { 401: "unauthorized", 403: "forbidden", 503: "discord_unavailable" } as const;

export async function GET(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
    const { guildId } = await params;

    const auth = await requireGuildOwner(guildId);
    if (!auth.ok) {
        return NextResponse.json({ error: AUTH_ERRORS[auth.status] }, { status: auth.status });
    }

    const res = await dbQuery<{ config: any }>(
        `SELECT * FROM events WHERE discord_guild_id = $1 ORDER BY timestamp DESC LIMIT 50`,
        [guildId]
    );

    const result = res.rows;
    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return NextResponse.json({ logs: result });
}