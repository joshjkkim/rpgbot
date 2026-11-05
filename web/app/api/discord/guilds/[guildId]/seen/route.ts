import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { requireGuildManager } from "@/app/lib/discord";
import { dbQuery } from "@/app/lib/db";

export const runtime = "nodejs";

/**
 * Notes a dashboard page an owner or manager opened, in the interaction log
 * (migration 013) beside their clicks in Discord, so /admin can tell whether a
 * server uses the dashboard at all. The page is the part after the server id.
 */
export async function POST(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
    const { guildId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.userId || !(await requireGuildManager(guildId)).ok) return new NextResponse(null, { status: 204 });
    const page = (await request.text()).replace(/[^a-z0-9/-]/gi, "").slice(0, 60) || "overview";
    await dbQuery(
        `INSERT INTO interaction_log (discord_guild_id, discord_user_id, kind, name) VALUES ($1, $2, 'dashboard', $3)`,
        [guildId, session.userId, page],
    ).catch(() => null);
    return new NextResponse(null, { status: 204 });
}
