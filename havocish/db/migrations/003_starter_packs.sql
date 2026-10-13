-- 003: starter packs as data.
--
-- Each row is a pack on the dashboard's Starter packs page. Its items, shop
-- categories, enemies, quests and achievements are read live from the config
-- of `source_discord_guild_id`, a template server edited on the dashboard like
-- any other. Adding or changing a pack is then a row here plus dashboard edits,
-- never a deploy.
--
-- Only this table decides what is a pack, so a server owner cannot publish
-- one by editing their own config. A row whose id matches a JSON pack in
-- web/app/lib/packs replaces it.

BEGIN;

CREATE TABLE IF NOT EXISTS public.starter_packs (
    id                      TEXT        PRIMARY KEY,
    name                    TEXT        NOT NULL,
    description             TEXT        NOT NULL DEFAULT '',
    source_discord_guild_id BIGINT      NOT NULL,
    position                INTEGER     NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.starter_packs IS
    'Dashboard starter packs; content comes live from the source guild''s config.';

COMMIT;
