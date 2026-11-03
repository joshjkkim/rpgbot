-- 011: Daily play counts.
--
-- How many played each day of the website's Daily (havocish.com/daily) and
-- how their runs ended. Anonymous counts only: no players, no accounts. The
-- page adds to them (web/app/api/daily/play), and /admin/daily shows them.

BEGIN;

CREATE TABLE IF NOT EXISTS public.daily_plays (
    day        INTEGER     PRIMARY KEY,
    players    INTEGER     NOT NULL DEFAULT 0,
    wins       INTEGER     NOT NULL DEFAULT 0,
    timeouts   INTEGER     NOT NULL DEFAULT 0,
    falls      INTEGER     NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
