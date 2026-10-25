import { dbQuery } from "@/app/lib/db";

export const runtime = "nodejs";

/**
 * A character's uploaded picture. Public, since Discord fetches it as a webhook
 * avatar. Ids are random UUIDs, and the picture never changes, so it caches
 * for good. The headers make sure it can only ever be shown as an image.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const res = await dbQuery<{ content_type: string; data: Buffer }>(`SELECT content_type, data FROM character_images WHERE id = $1`, [id]);
  const row = res.rows[0];
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.content_type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
