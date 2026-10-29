-- 007: what the AI features cost.
--
-- One row per model call (the AI builder, the dashboard helper), with its
-- token counts, so the cost per server can be read off and the helper can
-- be capped per day.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_usage (
    id               BIGSERIAL   PRIMARY KEY,
    discord_guild_id BIGINT      NOT NULL,
    kind             TEXT        NOT NULL,
    model            TEXT        NOT NULL,
    input_tokens     INTEGER     NOT NULL,
    output_tokens    INTEGER     NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_usage_guild_idx ON public.ai_usage (discord_guild_id, created_at);

COMMIT;
