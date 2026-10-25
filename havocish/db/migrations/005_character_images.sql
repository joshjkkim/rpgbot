-- 005: pictures for characters.
--
-- Characters (config.characters) post under an owner-made name and picture.
-- Discord's own attachment links now expire, so a picture uploaded on the
-- dashboard is kept here and served from /api/images/<id>, which Discord
-- fetches as the webhook's avatar. Small by design: the upload route takes
-- PNG, JPEG, GIF or WebP up to 512 KB, and drops a guild's pictures that its
-- config no longer uses.

BEGIN;

CREATE TABLE IF NOT EXISTS public.character_images (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_guild_id BIGINT      NOT NULL,
    content_type     TEXT        NOT NULL,
    data             BYTEA       NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS character_images_guild_idx ON public.character_images (discord_guild_id);

COMMIT;
