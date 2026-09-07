import { NextResponse } from "next/server";
import { requireGuildOwner } from "@/app/lib/discord";
import { dbQuery } from "@/app/lib/db";

export async function GET(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
    const { guildId } = await params;
    console.log("Fetching logs for guildId:", guildId);

    const auth = await requireGuildOwner(guildId);
    console.log("Authorization result:", auth);
    if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });

    const res = await dbQuery<{ config: any }>(
        `SELECT * FROM events WHERE discord_guild_id = $1 ORDER BY timestamp DESC LIMIT 50`,
        [guildId]
    );

    const result = res.rows;
    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return NextResponse.json({ logs: result });
}