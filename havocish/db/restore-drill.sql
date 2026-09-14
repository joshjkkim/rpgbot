-- Restore drill: paste into the Neon SQL Editor one step at a time.
-- Full runbook: OPERATIONS.md → Backups → The restore drill.


-- ─── 0. (production branch) Migrations applied? ──────────────────────────────
-- Expect 001_performance_indexes and 002_guild_removed_at.
SELECT version, applied_at FROM public.schema_migrations ORDER BY version;


-- ─── 1. (production branch) Snapshot. Write the row down. ────────────────────
SELECT now() AS taken_at,
       (SELECT count(*) FROM public.guilds)              AS guilds,
       (SELECT count(*) FROM public.users)               AS users,
       (SELECT count(*) FROM public.user_guild_profiles) AS profiles,
       (SELECT count(*) FROM public.events)              AS events,
       (SELECT count(*) FROM public.schema_migrations)   AS migrations,
       (SELECT coalesce(sum(xp), 0) FROM public.user_guild_profiles)   AS total_xp,
       (SELECT coalesce(sum(gold), 0) FROM public.user_guild_profiles) AS total_gold;

-- Pick a profile older than the restore point, so it exists unchanged there.
SELECT id, user_id, guild_id, xp, level, gold, updated_at
FROM public.user_guild_profiles
WHERE updated_at < now() - interval '2 hours'
ORDER BY updated_at DESC
LIMIT 1;


-- ─── 2. (console) Branches → New branch ──────────────────────────────────────
-- Parent = production, "Include data up to" ~1 hour ago, name = restore-drill.


-- ─── 3. (restore-drill branch — confirm the selector switched!) ──────────────
-- Re-run the snapshot query from step 1. Expect similar, slightly smaller
-- numbers; no zeros, and migrations not below production's.

-- Then check the profile from step 1 matches:
SELECT id, user_id, guild_id, xp, level, gold, updated_at
FROM public.user_guild_profiles
WHERE id = 0;  -- ← replace 0 with the id from step 1


-- ─── 4. (console) Delete the restore-drill branch ────────────────────────────
-- Then set "Last restore drill: <date>" in OPERATIONS.md.
