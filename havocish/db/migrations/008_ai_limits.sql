-- 008: AI limits per server.
--
-- A row raises (or lowers) one server's AI allowance: helper messages a day,
-- and worlds it can make in all. A null column, or no row, means the default
-- (AI_HELPER_DAILY / AI_FREE_PACKS). Edited by hand for now; payments can
-- write here later.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_limits (
    discord_guild_id BIGINT      PRIMARY KEY,
    helper_daily     INTEGER,
    packs            INTEGER,
    note             TEXT,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
