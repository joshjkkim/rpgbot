import { loadImage } from "@napi-rs/canvas";
import { parse as parseTwemoji } from "twemoji-parser";
import { imgCache } from "../../cache/caches.js";

const discordEmojiRe = /<(a?):([a-zA-Z0-9_]+):(\d+)>/g;

/** Images are kept an hour, so a changed avatar shows up soon. */
const IMAGE_TTL_MS = 60 * 60 * 1000;
/** And at most this many, least recently used dropped first, so memory stays bounded. */
const MAX_IMAGES = 300;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16_000_000;

export async function loadCachedImage(url: string) {
  const hit = imgCache.get(url);
  if (hit && Date.now() - hit.at < IMAGE_TTL_MS) {
    // Re-inserted, so the Map's order is least recently used first.
    imgCache.delete(url);
    imgCache.set(url, hit);
    return hit.img;
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // An owner can link any picture; a huge one would take far more memory decoded.
  if (buf.length > MAX_IMAGE_BYTES) throw new Error(`Image too large (${buf.length} bytes): ${url}`);
  const img = await loadImage(buf);
  if (img.width * img.height > MAX_IMAGE_PIXELS) throw new Error(`Image too large (${img.width}x${img.height}): ${url}`);
  imgCache.delete(url);
  imgCache.set(url, { img, at: Date.now() });
  while (imgCache.size > MAX_IMAGES) imgCache.delete(imgCache.keys().next().value!);
  return img;
}

/** The image for an emoji: a server's custom emoji from Discord's CDN, or Twemoji for a standard one. */
export function emojiImageUrl(emoji: string): string | null {
  const custom = /^<a?:\w+:(\d+)>$/.exec(emoji.trim());
  return custom ? `https://cdn.discordapp.com/emojis/${custom[1]}.png` : twemojiUrlFromEmoji(emoji);
}

function twemojiUrlFromEmoji(emoji: string) {
  const parsed = parseTwemoji(emoji, { assetType: "png" });
  if (!parsed.length) return null;
  // parsed[0].url is already a full CDN URL usually; keep it:
  return parsed[0]?.url ?? null;
}

type Token =
  | { kind: "text"; value: string }
  | { kind: "emoji"; url: string; size: number };

function tokenizeWithEmojis(input: string, emojiSize: number): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  // 1) handle custom discord emojis first
  const matches = [...input.matchAll(discordEmojiRe)];
  if (matches.length) {
    let last = 0;
    for (const m of matches) {
      const [full, animated, _name, id] = m;
      const idx = m.index ?? 0;
      if (idx > last) tokens.push({ kind: "text", value: input.slice(last, idx) });

      // prefer png (static). if animated, you can still try png as fallback.
      const url = `https://cdn.discordapp.com/emojis/${id}.png`;
      tokens.push({ kind: "emoji", url, size: emojiSize });

      last = idx + full.length;
    }
    if (last < input.length) tokens.push({ kind: "text", value: input.slice(last) });
  } else {
    tokens.push({ kind: "text", value: input });
  }

  // 2) now split unicode emojis inside text tokens using twemoji-parser
  const out: Token[] = [];
  for (const t of tokens) {
    if (t.kind !== "text") { out.push(t); continue; }

    const parts = t.value;
    const found = parseTwemoji(parts, { assetType: "png" });
    if (!found.length) { out.push(t); continue; }

    let cursor = 0;
    for (const f of found) {
      const start = f.indices[0];
      const end = f.indices[1];
      if (start > cursor) out.push({ kind: "text", value: parts.slice(cursor, start) });
      out.push({ kind: "emoji", url: f.url, size: emojiSize });
      cursor = end;
    }
    if (cursor < parts.length) out.push({ kind: "text", value: parts.slice(cursor) });
  }

  return out;
}

export async function drawTextWithEmojis(opts: {
  ctx: any;
  text: string;
  x: number;
  y: number;
  emojiSize?: number;
}) {
  const { ctx, text, x, y } = opts;
  const emojiSize = opts.emojiSize ?? 22;

  const tokens = tokenizeWithEmojis(text, emojiSize);

  let cursorX = x;
  for (const tok of tokens) {
    if (tok.kind === "text") {
      ctx.fillText(tok.value, cursorX, y);
      cursorX += ctx.measureText(tok.value).width;
    } else {
      const img = await loadCachedImage(tok.url);
      // align emoji to text baseline
      const ascent = ctx.measureText("M").actualBoundingBoxAscent || (tok.size * 0.8);
        const yTop = y - ascent;                // line top relative to baseline
        const yEmoji = yTop + (ascent - tok.size) / 2; // center emoji within text ascent

        ctx.drawImage(img, cursorX, yEmoji, tok.size, tok.size);
      cursorX += tok.size + 4;
    }
  }
}
