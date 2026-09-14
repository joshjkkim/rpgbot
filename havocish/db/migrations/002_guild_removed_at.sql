-- 002: track when the bot was removed from a guild.
--
-- Applied to production 2026-09-11. Whether a migration is live is recorded in
-- the schema_migrations ledger, not in this comment -- check with:
--   cd rpgbot && ./scripts/migrate.sh --status
--
-- Removal is soft. Deleting the row would cascade away every profile, and a
-- server that kicks the bot and re-adds it an hour later -- during a permissions
-- clean-up, say -- would come back with every member's XP, gold and inventory
-- gone. `removed_at` is cleared on rejoin instead, so nothing is lost and the
-- dashboard can still tell a live install from a dead one.
--
-- Unlike 001 this takes no CONCURRENTLY, so it runs in a transaction. Adding a
-- nullable column with no default is metadata-only in Postgres 11+: no table
-- rewrite, no lock worth worrying about.

BEGIN;

ALTER TABLE public.guilds
    ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.guilds.removed_at IS
    'When the bot was last removed from this guild; NULL while it is installed.';

COMMIT;
