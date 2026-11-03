-- 009: Daily overrides.
--
-- The website's Daily (havocish.com/daily) picks each day's world, enemies,
-- shop and moves from the day's number (content/daily.ts). A row here, set
-- from /admin, replaces any of those picks for one day: see DailyOverride.

BEGIN;

CREATE TABLE IF NOT EXISTS public.daily_overrides (
    day        INTEGER     PRIMARY KEY,
    override   JSONB       NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
