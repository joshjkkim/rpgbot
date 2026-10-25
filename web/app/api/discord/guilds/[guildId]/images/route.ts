import { NextResponse } from "next/server";
import { requireGuildManager } from "@/app/lib/discord";
import { dbQuery } from "@/app/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTH_ERRORS = { 401: "unauthorized", 403: "forbidden", 503: "discord_unavailable" } as const;

/** Most a picture can weigh. Webhook avatars are shown at 40px; this is plenty. */
const MAX_BYTES = 512 * 1024;

/** What the file's first bytes say it is. Never trust the browser's type: an SVG could carry script. */
function sniff(b: Buffer): string | null {
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 6).toString("ascii") === "GIF87a" || b.subarray(0, 6).toString("ascii") === "GIF89a") return "image/gif";
  if (b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

/** Uploads a character's picture and returns the link to put in the config. */
export async function POST(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const auth = await requireGuildManager(guildId);
  if (!auth.ok) return NextResponse.json({ error: AUTH_ERRORS[auth.status] }, { status: auth.status });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "too_big", message: "Pictures can be up to 512 KB." }, { status: 413 });

  const data = Buffer.from(await file.arrayBuffer());
  const type = sniff(data);
  if (!type) return NextResponse.json({ error: "not_an_image", message: "Use a PNG, JPEG, GIF or WebP picture." }, { status: 415 });

  // Pictures the saved config no longer points at go, once they're a day old (a fresh one may not be saved yet).
  await dbQuery(
    `DELETE FROM character_images i
     WHERE i.discord_guild_id = $1 AND i.created_at < NOW() - INTERVAL '1 day'
       AND position(i.id::text IN COALESCE((SELECT config::text FROM guilds WHERE discord_guild_id = $1), '')) = 0`,
    [guildId]
  );
  const res = await dbQuery<{ id: string }>(
    `INSERT INTO character_images (discord_guild_id, content_type, data) VALUES ($1, $2, $3) RETURNING id`,
    [guildId, type, data]
  );
  return NextResponse.json({ url: `${new URL(request.url).origin}/api/images/${res.rows[0]!.id}` });
}
