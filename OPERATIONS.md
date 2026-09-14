# Operations

How to deploy this, what to check before you do, and what to look at when
something is wrong. Setup and development live in [README.md](./README.md);
this file is about the running system.

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

### On Fly

`fly.toml` at the repo root carries the settings above (`kill_timeout = 20`, no
HTTP service, 512MB). Build from the repo root, not `rpgbot/` — the Dockerfile
needs the root lockfile.

```bash
fly secrets set -a rpgbot-eilynw DISCORD_TOKEN='...' DATABASE_URL='postgresql://...'
fly deploy --ha=false
fly machine list -a rpgbot-eilynw        # exactly one machine
```

Each of these was learned the hard way:

- **Secrets, not the launch form.** Environment variables typed into the
  dashboard's launch form never reached the machine; the bot exited 78
  (`Cannot start: required environment variables are not set`) until they were
  set as secrets.
- **Bare values, no quotes.** The `'...'` above is shell quoting and is
  stripped. Quotes pasted into the dashboard's secret box are kept, and `pg`
  reads `"postgresql://…` as host `base` — every query fails with
  `ENOTFOUND base`. The bot now refuses such a value at startup.
- **One machine.** A launch without `--ha=false` adds a standby machine. Destroy
  it: the write-back cache flushes absolute values, so two instances overwrite
  each other's XP and gold, and a network split can start the standby while the
  primary is still running.
- **"Suspended" after a crash loop.** Fly stops restarting a machine that keeps
  failing, and a later deploy does not start it again:
  `fly machine start <id> -a rpgbot-eilynw`.

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

### On Vercel

The project's **Root Directory** is `web`. Each of these was learned the hard way:

- **No blank variables.** `NEXTAUTH_URL` set to an empty string fails the build
  with `ERR_INVALID_URL`, `input: ''` on `/_not-found`: NextAuth v4 runs
  `new URL(process.env.NEXTAUTH_URL ?? …)` at import, and `""` is not nullish.
  Delete a variable you have not filled in rather than leaving it empty.
- **`NEXTAUTH_URL` is the origin only** — `https://<project>.vercel.app`, no
  path, no trailing slash, **Production** environment only. NextAuth appends
  `/api/auth/callback/discord` itself; only the Discord portal gets the full
  path. Left unset, v4 falls back to the per-deployment URL, which changes every
  deploy and never matches the registered redirect.
- **Values are bare**, as on Fly: no quotes around `DATABASE_URL`.
- **`NEXT_PUBLIC_DISCORD_CLIENT_ID` is baked in at build time**, and so is any
  `NEXTAUTH_URL` change — redeploy after editing either.
- **Renaming the Vercel project changes the domain**, which breaks
  `NEXTAUTH_URL` and the Discord redirect until both are updated.
- **Sign-in does not work on preview deployments** — `NEXTAUTH_URL` points at
  production. Previews are for looking at pages, not for testing auth.

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

## Crash alerts

The bot posts to a Discord webhook when it dies from an uncaught exception or an
unhandled rejection. Without it the only trace is a log line nobody is watching,
and the first signal that anything broke is a member saying the bot is down.

Create a webhook in the channel you want alerted (**Edit Channel →
Integrations → Webhooks**), then:

```bash
fly secrets set -a rpgbot-eilynw ALERT_WEBHOOK_URL=https://discord.com/api/webhooks/...
npm run alert:test          # posts a test message; run it against the same value
```

`npm run alert:test` also runs the formatting self-check, so it is safe to run
with the variable unset — it just skips the live post.

Worth knowing:

- **Unset means silent, not broken.** `ALERT_WEBHOOK_URL` is deliberately not in
  `REQUIRED_ENV`: a missing alert channel is not a reason to refuse to start.
  The startup log says `Crash alerts: on.` or `off` so you can tell which you got.
- **The alert goes out before the shutdown flush.** `shutdown()` ends in
  `process.exit()`, which would kill an in-flight request. It is capped at 3s
  and can never reject, so it cannot cost the flush its 10s.
- **It does not cover the dashboard.** Vercel functions are a separate process
  on a separate host; their errors land in Vercel's logs. Sentry is still the
  answer there if it turns out to matter.
- **It does not cover a bot that is up but wrong.** A hung gateway connection or
  a database that stopped answering is not a crash, and nothing alerts on it.

---

## When something is wrong

**Bot is offline / crash-looping.** Check the alert channel first — a crash
posts its stack trace there. Then `fly logs -a rpgbot-eilynw`, or
`docker compose logs --tail=200 bot` locally. It
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
day. A backup nobody has restored is a belief, not a backup.

### The restore drill

Run this once before advertising, and again whenever the retention window
changes. It touches nothing: it restores into a *new branch*, which is a
separate endpoint that production never reads. The SQL below is also in
`rpgbot/db/restore-drill.sql`, ready to paste.

**1. Snapshot production.** In the Neon SQL Editor, on the production branch:

```sql
SELECT now() AS taken_at,
       (SELECT count(*) FROM public.guilds)              AS guilds,
       (SELECT count(*) FROM public.users)               AS users,
       (SELECT count(*) FROM public.user_guild_profiles) AS profiles,
       (SELECT count(*) FROM public.events)              AS events,
       (SELECT count(*) FROM public.schema_migrations)   AS migrations,
       (SELECT coalesce(sum(xp), 0) FROM public.user_guild_profiles)   AS total_xp,
       (SELECT coalesce(sum(gold), 0) FROM public.user_guild_profiles) AS total_gold;
```

Write the row down. Also pick one real profile to look for later — one older
than the restore point, or it will be missing or different in the branch:

```sql
SELECT id, user_id, guild_id, xp, level, gold, updated_at
FROM public.user_guild_profiles
WHERE updated_at < now() - interval '2 hours'
ORDER BY updated_at DESC
LIMIT 1;
```

**2. Restore into a branch.** Console → **Branches** → **New branch**, parent =
production, **Include data up to** a specific time an hour or so ago. Name it
`restore-drill`. This is the step being tested — if the time picker will not go
back as far as you expected, that *is* the finding, and the retention setting is
the thing to fix.

**3. Verify the branch has real data.** Switch the SQL Editor's branch selector
to `restore-drill` — **check it actually switched before running anything** —
and re-run the snapshot query. Expect the same shape as production with slightly
smaller numbers: an hour-old database, not an empty one. Zero rows anywhere, or
a `migrations` count below production's, means the restore did not give you what
you think it did.

Then confirm the profile from step 1 is present and intact:

```sql
SELECT id, user_id, guild_id, xp, level, gold, updated_at
FROM public.user_guild_profiles
WHERE id = <the id from step 1>;
```

**4. Know how you would cut over.** Nothing to run here, just be sure of it: a
real recovery means pointing `DATABASE_URL` at the restored branch — `fly
secrets set -a rpgbot-eilynw DATABASE_URL=...`, the same variable on Vercel, redeploy
both — or promoting the branch to primary in the console. The bot holds up to
30s of unflushed XP in memory, so restart it *after* the cutover, not before.

**5. Delete the branch.** Console → **Branches** → `restore-drill` → Delete. A
branch left behind keeps consuming storage against the project.

Record the date you last did this here:

    Last restore drill: 2026-09-13 — passed


---

## Not covered yet

Worth knowing before launch, all of them deliberate gaps rather than oversights:

- **No error monitoring beyond crashes.** The bot posts a crash to Discord (see
  above), but nothing groups errors, tracks releases, or reports anything from
  the dashboard. Sentry is the fix if the webhook stops being enough.
- **No healthcheck.** The bot exposes no HTTP endpoint, so `docker compose ps`
  reports the process is running, not that it is connected to Discord and to
  Postgres. Most hosts want an endpoint to probe.
- **No automated deploy.** CI checks the code; pushing it is manual.
- **No rate limiting** on the dashboard's config write route — deliberately.
  Every request re-checks server ownership against Discord, the body is
  validated and capped at 1MB, and saves are version-checked, so the most a
  caller can do is spam writes to a server they already own. Add a limit if
  that ever shows up in the logs.
- **Sharding.** Not needed below ~2,500 guilds. Discord verification arrives
  first, at 100.
