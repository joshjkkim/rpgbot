import { NextResponse } from "next/server";
import { requireGuildOwner } from "@/app/lib/discord";
import { dbQuery } from "@/app/lib/db";
import { validateGuildConfig } from "@/app/lib/validateConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
    const { guildId } = await params;

    const auth = await requireGuildOwner(guildId);
    if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });

    // `version` is a hash of the stored config. The client sends it back on save
    // so a write can be rejected if anything changed in the meantime -- see POST.
    const res = await dbQuery<{ config: any; id: any; version: string }>(
        `SELECT id, config, md5(config::text) AS version
         FROM guilds WHERE discord_guild_id = $1`,
        [guildId]
    );

    const row = res.rows[0];
    if (!row || !row.id || !row.config) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return NextResponse.json({ config: row.config, id: row.id, version: row.version });
}

export async function POST(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
    const { guildId } = await params;

    const auth = await requireGuildOwner(guildId);
    if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const newConfig = body.config;
    if (!newConfig) {
        return NextResponse.json({ error: "invalid_config" }, { status: 400 });
    }

    const valid = validateGuildConfig(newConfig);
    if (!valid.ok) {
        return NextResponse.json({ error: "invalid_config", detail: valid.error }, { status: 400 });
    }

    // The config is one JSONB blob that the bot also writes to -- a purchase
    // decrementing an item's stock, or a config panel edit made from Discord.
    // Saving the whole blob unconditionally would silently revert those, so the
    // write only applies if the config still hashes to what the client loaded.
    //
    // The version is required rather than optional: making it optional would
    // leave any client that omits it -- a stale tab running older JS -- still
    // clobbering. A clear 400 telling it to reload is the better failure.
    const expectedVersion = typeof body.version === "string" ? body.version : null;
    if (!expectedVersion) {
        return NextResponse.json(
            { error: "missing_version", detail: "Reload the page and try again." },
            { status: 400 }
        );
    }

    const res = await dbQuery<{ version: string }>(
        `UPDATE guilds SET config = $1
         WHERE discord_guild_id = $2 AND md5(config::text) = $3
         RETURNING md5(config::text) AS version`,
        [newConfig, guildId, expectedVersion]
    );

    if (!res.rows.length) {
        // Nothing matched: either the guild is gone, or someone else wrote first.
        const exists = await dbQuery<{ version: string }>(
            `SELECT md5(config::text) AS version FROM guilds WHERE discord_guild_id = $1`,
            [guildId]
        );

        if (!exists.rows.length) {
            return NextResponse.json({ error: "not_found" }, { status: 404 });
        }

        return NextResponse.json(
            {
                error: "conflict",
                detail: "This server's settings changed since you loaded them. Reload and reapply your edit.",
                version: exists.rows[0]!.version,
            },
            { status: 409 }
        );
    }

    return NextResponse.json({ success: true, version: res.rows[0]!.version });
}
