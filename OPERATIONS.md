# Operations

How to deploy this, what to check before you do, and what to look at when
something is wrong. Setup and development live in [README.md](./README.md);
this file is about the running system.

---

## The one-time step this repo is waiting on

The production database had migrations `001` and `002` applied by hand, before
`scripts/migrate.sh` kept a ledger. Tell the ledger about them **once**, so
`--status` reports the truth instead of claiming both are pending:

```bash
cd rpgbot
./scripts/migrate.sh --mark-applied db/migrations/001_performance_indexes.sql
./scripts/migrate.sh --mark-applied db/migrations/002_guild_removed_at.sql
./scripts/migrate.sh --status        # both should read "applied"
```

`--mark-applied` records a migration **without running it**. It is correct here
because both are genuinely in the database already, and it is the wrong tool
for anything else.

---

## Before every deploy

```bash
npm run doctor
```

Read-only, and it prints which database it opened before it does anything. It
checks, in the order these things actually go wrong:

| Check | Why it is there |
| --- | --- |
| Required env is set | An unset `DATABASE_URL` does not throw — `pg` falls back to localhost, so the bot starts, logs in, and silently fails every write |
| Database reachable | The obvious one |
| All five tables present | A database that never had `schema.sql` applied |
| Columns migrations added | The deploy-ordering failure, below |
| Every migration applied | The question the ledger exists to answer |
| No `INVALID` indexes | A failed `CREATE INDEX CONCURRENTLY` leaves one behind; the planner ignores it, so the query stays slow and nothing looks broken |

A non-zero exit means do not deploy.

---

## Deploy order: migrations first, always

**Apply the migration, then deploy the code that needs it.** Never the reverse.

The failure is not graceful. `guilds.removed_at` is written by *every*
`upsertGuild()` call, not just the removal path — so shipping the bot ahead of
migration 002 would not have broken guild removal, it would have broken **every
guild write in every server**. Assume the next column is the same.

```bash
cd rpgbot
./scripts/migrate.sh --status     # what is pending
./scripts/migrate.sh --all        # apply it
npm run doctor                    # confirm
# ...only now deploy the bot
```

`migrate.sh` talks to the **direct** endpoint, never Neon's pooler: PgBouncer
runs transaction pooling, and `CREATE INDEX CONCURRENTLY` cannot run inside a
transaction block. Through the pooler a migration fails, or worse leaves an
`INVALID` index that silently never gets used. Use the script, not bare `psql`.

---

## Deploying the bot

```bash
docker compose up -d --build
docker compose logs -f bot
```

Two compose settings are load-bearing and must be carried to any other host:

- **`restart: unless-stopped`.** The bot deliberately exits non-zero on an
  unhandled rejection or uncaught exception. That is only useful if something
  brings it back.
- **`stop_grace_period: 20s`.** On `SIGTERM` the bot flushes the write-back
  cache, with its own 10s internal timeout. Compose's default 10s can cut that
  flush off partway and lose buffered XP and gold. The equivalents elsewhere:
  `kill_timeout` on Fly, `TimeoutStopSec` on systemd, and Kubernetes'
  `terminationGracePeriodSeconds`.

**Up to 30 seconds of XP and gold lives only in memory at any moment.** Anything
that kills the process without a clean `SIGTERM` — `docker kill`, an OOM kill, a
host yanking the instance — loses it. That is the cost of the write-back cache
and it is bounded at 30s by the flush timer.

Slash commands are **not** registered by the container. That is a separate,
occasional action against Discord's API, run by hand when a command's
*definition* changes:

```bash
npm run deploy-commands      # global; up to an hour to propagate
```

## Deploying the dashboard

Set in the host's environment: `DATABASE_URL`, `NEXTAUTH_URL` (the real origin,
not localhost), `NEXTAUTH_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`,
`NEXT_PUBLIC_DISCORD_CLIENT_ID`.

Then register `<NEXTAUTH_URL>/api/auth/callback/discord` as a redirect URI under
**OAuth2 → Redirects** in the Discord developer portal. Sign-in fails with
`invalid_redirect_uri` until you do, and the localhost entry does not cover it.

The dashboard's pg pool is capped at `max: 2` on purpose — every warm serverless
instance holds its own pool, so the real connection count is instances × max.

---

## Writing a migration

1. Number it: `db/migrations/003_what_it_does.sql`. Prefixes are zero-padded
   because they are sorted lexically.
2. Make it **idempotent** — `IF NOT EXISTS`, `IF EXISTS`. A migration is
   re-run precisely when the first attempt failed partway, which is the worst
   possible moment for it to error on "already exists". CI enforces this by
   applying every migration twice.
3. If it adds a **column**, add that column to `db/schema.sql` too. Migrations
   carry indexes that a fresh install can live without; they must never carry a
   column a fresh install needs. CI enforces this by building a database both
   ways and diffing the columns (`scripts/check-schema-drift.sh`).
4. If the code writes the new column unconditionally, add it to
   `REQUIRED_COLUMNS` in `scripts/doctor.ts`, so a deploy that gets ahead of
   its migration is caught by the preflight instead of by users.
5. Never edit a migration that has been applied. The ledger stores a checksum
   and `migrate.sh` will refuse it — the database does not contain what the
   edited file says, and re-running will not make it so. Write another one.

---

## When something is wrong

**Bot is offline / crash-looping.** `docker compose logs --tail=200 bot`. It
exits non-zero on purpose, so a loop means it is failing at startup. Exit code
78 is a configuration problem and the log names the missing variable. Check the
**Server Members Intent** is still enabled in the developer portal — the bot
requests `GuildMembers` and cannot log in without it.

**Bot is online but nothing saves.** Almost always the database. `npm run
doctor`. An idle-client error is logged as "Idle Postgres client errored (pool
recovered)" and is harmless — `pg` discards the dead client and the next query
gets a fresh one.

**A command answers "This application did not respond".** The process died
mid-interaction, or the handler took over 3 seconds without deferring.

**XP or gold went backwards after a restart.** The shutdown flush did not
finish. Check the grace period on whatever host this is — see above.

**Dashboard says "sign in again" (401).** Expected after a Discord access token
expires and the refresh fails; a revoked authorisation never starts working
again. Signing in again is the fix.

**Dashboard says Discord is unavailable (503).** Genuinely Discord, or the
network between it and the dashboard. 401 and 503 are kept distinct precisely so
this is not ambiguous.

**A config save was rejected with a conflict (409).** Working as intended. The
config is one JSONB blob the bot also writes to — a purchase decrementing stock,
an edit made from a Discord config panel — so a save only applies if the config
still hashes to what the page loaded. Reload and reapply.

**A query got slow after a migration.** Look for an `INVALID` index (`npm run
doctor`). A failed `CONCURRENTLY` build leaves one, and the planner ignores it
silently. Drop it and rebuild:

```sql
DROP INDEX CONCURRENTLY idx_name;   -- then re-run the migration
```

---

## Backups

The database is the entire product: every member's level, gold, inventory and
streak, in one place, with no other copy. Confirm the Neon project's retention
and point-in-time restore window covers a mistake you would not notice the same
day, and **test a restore once** before launch. A backup nobody has restored is
a belief, not a backup.

---

## Not covered yet

Worth knowing before launch, all of them deliberate gaps rather than oversights:

- **No error monitoring.** Nothing reports a crash anywhere. Today the first
  signal is a user saying the bot is down. Sentry in `index.ts` and in the
  dashboard is the obvious fix.
- **No healthcheck.** The bot exposes no HTTP endpoint, so `docker compose ps`
  reports the process is running, not that it is connected to Discord and to
  Postgres. Most hosts want an endpoint to probe.
- **No automated deploy.** CI checks the code; pushing it is manual.
- **No rate limiting** on the dashboard's config write route.
- **Sharding.** Not needed below ~2,500 guilds. Discord verification arrives
  first, at 100.
