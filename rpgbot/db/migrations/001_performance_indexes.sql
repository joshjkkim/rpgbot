-- 001: indexes for queries that currently have no supporting index.
--
-- Applied to production 2026-09-06. Re-run against a new database with:
--   psql "$DATABASE_URL" -f rpgbot/db/migrations/001_performance_indexes.sql
--
-- CONCURRENTLY avoids taking a write lock on the table, so this is safe to run
-- while the bot is up. It cannot run inside a transaction block, which is why
-- there is no BEGIN/COMMIT here.

-- /leaderboard does `WHERE guild_id = $1 ORDER BY <xp|gold|streak_count> DESC`
-- and, for the caller's own rank, a RANK() window over the same ordering.
-- Without these it is a full scan plus sort of every profile in the guild.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ugp_guild_xp
    ON public.user_guild_profiles (guild_id, xp DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ugp_guild_gold
    ON public.user_guild_profiles (guild_id, gold DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ugp_guild_streak
    ON public.user_guild_profiles (guild_id, streak_count DESC);

-- viewTrades() filters on guild_id + status.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trades_guild_status
    ON public.trades (guild_id, status);

-- The dashboard's logs route filters on discord_guild_id (not the internal
-- guild_id that idx_events_guild_created_at covers) and orders by timestamp.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_discord_guild_created_at
    ON public.events (discord_guild_id, "timestamp" DESC);
