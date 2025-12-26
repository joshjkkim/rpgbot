import { NextResponse } from "next/server";
import { requireGuildOwner } from "@/app/lib/discord";
import { dbQuery } from "@/app/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
    const { guildId } = await params;
    console.log("Fetching config for guildId:", guildId);

    const auth = await requireGuildOwner(guildId);
    if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });

    const res = await dbQuery<{ config: any }>(
        `SELECT config FROM guilds WHERE discord_guild_id = $1`, 
        [guildId]
    );

    const result = res.rows[0]?.config ?? null;
    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return NextResponse.json({ config: result });
}

export async function POST(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
    const { guildId } = await params;
    const auth = await requireGuildOwner(guildId);
    if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const body = await request.json();
    const newConfig = body.config;

    if (!newConfig) {
        return NextResponse.json({ error: "invalid_config" }, { status: 400 });
    }

    const res = await dbQuery(
        `UPDATE guilds SET config = $1 WHERE discord_guild_id = $2 RETURNING discord_guild_id`, 
        [newConfig, guildId]
    );

    if (!res.rows.length) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
}