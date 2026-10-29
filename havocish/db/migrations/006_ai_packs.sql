-- 006: worlds made with the AI builder.
--
-- An owner describes their world on the Library page; the model writes the
-- words and the dashboard fills in the numbers (content/aiPack.ts). Each
-- result is kept here, so it can be added later or piece by piece like any
-- starter pack, and the row count is the server's free allowance used.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_packs (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_guild_id BIGINT      NOT NULL,
    prompt           TEXT        NOT NULL,
    pack             JSONB       NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_packs_guild_idx ON public.ai_packs (discord_guild_id);

COMMIT;
