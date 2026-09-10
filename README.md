# rpgbot

A Discord RPG/leveling bot plus a Next.js dashboard for configuring it, in one npm
workspace repo. Both halves talk to the same Postgres database.

| Workspace | What it is | Runs on |
| --- | --- | --- |
| `rpgbot/` | The Discord bot (discord.js 14, TypeScript, run with `tsx`) | Node process |
| `web/` | Config dashboard (Next.js 16, NextAuth via Discord OAuth) | http://localhost:3000 |

Past work is logged in [DEVLOG.md](./DEVLOG.md).

---

## Prerequisites

- **Node 22+** and npm 10+ (developed on Node 22.8, npm 10.8)
- **Postgres 17** — a hosted Neon database is what this currently runs against
- **`psql`** on your PATH, for applying the schema and the test-database script
- A **Discord application** with a bot user

---

## First-time setup

### 1. Install

```bash
git clone <repo> yeayea && cd yeayea
npm install          # installs both workspaces
```

### 2. Create the Discord application

In the [Discord developer portal](https://discord.com/developers/applications):

1. **New Application** → **Bot** → **Reset Token**, and copy the token.
2. Under **Bot → Privileged Gateway Intents**, enable **Server Members Intent**.
   The bot requests `GuildMembers` (`rpgbot/src/index.ts`) and will fail to log
   in without it — role multipliers and voice XP both need member data.
   **Leave Message Content off.** Nothing reads `message.content`; XP is awarded
   per message *event*. Requesting it would make the invite prompt look invasive
   and would need justifying during verification at 100 servers.
3. Under **OAuth2 → URL Generator**, pick scopes `bot` and
   `applications.commands`, and permissions **Send Messages**, **Embed Links**,
   **Attach Files** (profile cards are rendered images), **Read Message
   History**. Use the generated URL to invite the bot to your test server.
4. Keep the **Application ID** (this is `CLIENT_ID`) and right-click your test
   server → **Copy Server ID** (this is `SERVER_ID`; needs Developer Mode on).

### 3. Create the database

```bash
psql "$DATABASE_URL" -f rpgbot/db/schema.sql
```

That builds all five tables — `users`, `guilds`, `user_guild_profiles`,
`trades`, `events` — from scratch. Schema notes worth knowing are in the header
comment of `rpgbot/db/schema.sql`: Discord snowflakes are `BIGINT`, and XP/gold
are `BIGINT` that come back from `pg` as **strings** and get `BigInt()`'d in the
bot. Don't "simplify" them to `INTEGER`.

Then apply every migration in `rpgbot/db/migrations/`, in order — a fresh
database needs them too, not just a deployed one:

```bash
cd rpgbot
./scripts/migrate.sh db/migrations/001_performance_indexes.sql
./scripts/migrate.sh db/migrations/002_guild_removed_at.sql
```

Use the script rather than calling `psql` directly — see
[Applying a migration](#applying-a-migration) for why.

`schema.sql` carries every *column* the code expects, so the bot runs against a
database built from it alone; the migrations are what add the indexes that keep
it fast. Changes to an already-deployed database go in `migrations/` as numbered
files, never by editing `schema.sql` in place.

### 4. Fill in the env files

Both workspaces have their own. Copy the examples and fill them in:

```bash
cp rpgbot/.env.example rpgbot/.env
cp web/.env.example  web/.env.local
```

`rpgbot/.env`:

| Variable | Notes |
| --- | --- |
| `DISCORD_TOKEN` | Bot token from step 2 |
| `CLIENT_ID` | Application ID |
| `SERVER_ID` | Test server ID — where `deploy-test-commands` registers commands |
| `DATABASE_URL` | Postgres connection string |

`web/.env.local`:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | The same database the bot writes to |
| `NEXTAUTH_URL` | `http://localhost:3000` in dev |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | From **OAuth2** in the portal |

For dashboard login to work, register `http://localhost:3000/api/auth/callback/discord`
as a redirect URI under **OAuth2 → Redirects** in the developer portal.

Every `.env*` file is gitignored except the `.env.example` files.

---

## Running

All commands below are run **from the repo root**.

```bash
npm run deploy-test-commands   # register slash commands to your test server
npm run deploy-commands        # ...or register them globally, for real users
npm run dev:bot                # start the bot  (tsx src/index.ts)
npm run dev:bot:watch          # ...or restart it automatically on every save
npm run dev:web                # start the dashboard on :3000
```

**When to re-run a deploy:** only when a command's *definition* changes — its
name, description, options, or a new command added to `commandList` in
`rpgbot/src/commands/index.ts`. Editing the code that *handles* a command needs
nothing but a bot restart.

**Which scope:** `deploy-test-commands` registers guild-scoped commands to
`SERVER_ID` and they appear instantly — use it while developing.
`deploy-commands` registers globally, which is what anyone who invites the bot
gets, and takes up to an hour to propagate.

A command registered in *both* scopes appears twice in your test server. Once
you have deployed globally, clear the guild copies:

```bash
npm run clear-test-commands
```

`dev:bot` does not reload, so restart it after a change. `dev:bot:watch`
restarts on save instead: `tsx watch` sends `SIGTERM` and waits for the process
to exit, so the shutdown flush still runs and nothing buffered is lost. The
tradeoff is that a restart kills whatever Discord interaction is open at that
moment and the user sees *This application did not respond* — fine alone in a
test server, less so while other people are using the bot.

Either way, stop the bot with **Ctrl-C** rather than killing the process. On
`SIGINT`/`SIGTERM` it flushes the write-back cache before exiting, and up to 30
seconds of XP and gold lives only in memory at any moment.

---

## Testing

There is a headless smoke suite for the persistence layer that never touches
Discord. It runs against an **isolated scratch schema**, not your real data.

```bash
# One-time (or whenever schema.sql changes): build the scratch schema.
cd rpgbot
set -a; . .env; set +a          # export DATABASE_URL for the script
                                # (requires DATABASE_URL to be quoted -- below)
./scripts/setup-test-db.sh

# Then, from anywhere in the repo:
npm --workspace rpgbot run smoke
```

`setup-test-db.sh` drops and recreates a `rpgbot_test` schema inside the same
database, applies `schema.sql` into it, and writes a scratch connection string
to the gitignored `rpgbot/.env.test`. The suite refuses to run if
`current_schema()` is `public`, so it cannot hit production rows.

What it covers: XP write-back buffering, the stale-cache reload path, forced
flush on shutdown, daily XP/gold and streaks, and concurrent XP grants in one
tick. It does **not** cover anything that needs a Discord connection — commands,
interactions, trading UI, and canvas rendering all have to be exercised by
running the bot in your test server.

Typecheck without emitting:

```bash
cd rpgbot && npx tsc --noEmit
```

---

## Building

```bash
npm run build     # builds both workspaces (tsc for the bot, next build for web)
```

The bot compiles to `rpgbot/dist/`; `node dist/index.js` runs the compiled
version.

---

## Deploying

The bot is packaged as a Docker image. `node:22-slim` (Debian/glibc) rather than
Alpine, because `@napi-rs/canvas` ships prebuilt native binaries and the glibc
ones are the well-trodden path.

```bash
cp rpgbot/.env.example rpgbot/.env   # fill in, then:
docker compose up -d --build
docker compose logs -f bot
```

The compose file is deliberately boring, and portable — the same Dockerfile runs
on Fly, Railway, Render, or a plain VPS.

Two settings there are load-bearing, not defaults:

- **`restart: unless-stopped`.** The bot exits non-zero on an unhandled
  rejection or an uncaught exception. That is only useful if something brings it
  back up.
- **`stop_grace_period: 20s`.** On `SIGTERM` the bot flushes the write-back
  cache, with its own 10s internal timeout. Compose's default grace period is
  10s, which can cut that flush off partway and lose buffered XP and gold. Any
  other host needs the same treatment (`kill_timeout` on Fly,
  `TimeoutStopSec` on systemd).

Slash commands are **not** registered by the container. Registration is a
separate, occasional action against Discord's API — run it from your machine
when a command definition changes:

```bash
npm run deploy-commands      # global; up to an hour to propagate
```

### Applying a migration

Schema changes are applied by hand, in order, before the deploy that needs them:

```bash
cd rpgbot
./scripts/migrate.sh db/migrations/001_performance_indexes.sql
```

Use the script, not bare `psql`. `DATABASE_URL` points at Neon's **pooled**
endpoint (`-pooler`), which is PgBouncer in transaction pooling mode, and
`CREATE INDEX CONCURRENTLY` cannot run inside a transaction block. Applied
through the pooler a migration fails — or worse, leaves an `INVALID` index that
the planner silently ignores, so the query stays slow and nothing looks broken.
`migrate.sh` strips `-pooler` and talks to the direct endpoint, the same
substitution `setup-test-db.sh` makes.

It reads `DATABASE_URL` from `rpgbot/.env` itself if the variable is not already
exported, so there is no need to source that file first.

**Applied to production:** `001` (2026-09-06). **Pending:** `002`, which adds
`guilds.removed_at` — the bot writes that column on every guild upsert, so it
must be applied *before* the deploy that carries the `guildDelete` handler, or
every guild write starts failing.

After `001`, verify no index landed invalid:

```bash
psql "$DATABASE_URL" -c \
  "SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
   WHERE NOT i.indisvalid;"
```

---

## Layout

```
rpgbot/
  src/
    index.ts        entrypoint: client, intents, timers, graceful shutdown
    commands/       slash commands — user/ and admin/, registered in index.ts
    events/         messageCreate, guildCreate, interactionCreate, voiceStateUpdate
    cache/          write-back profile cache (caches.ts, profileService.ts)
    db/             pg pool and per-table query modules
    leveling/       XP curves and level-up logic
    player/         combat, fights, inventory
    ui/             embeds, panels (ui/panel/), canvas profile cards (ui/canvas/)
    types/          shared types
  db/
    schema.sql      canonical schema — rebuild a database from this
    migrations/     numbered, applied by hand to live databases
  scripts/
    smoke.ts             persistence smoke tests
    loadTestEnv.ts       loads .env then .env.test, before any db import
    setup-test-db.sh     (re)creates the scratch schema
web/
  app/
    dashboard/[guildId]/  per-guild config pages (xp, levels, shop, quests,
                          achievements, combat, styles, logging, logs)
    api/auth/             NextAuth Discord provider
    components/           one folder per config section
```

---

## Gotchas

- **`npm --workspace rpgbot run smoke`** — the workspace name comes right after
  `--workspace`. `npm --workspace run rpgbot smoke` reads `run` as the workspace
  name and fails with `Unknown command: "rpgbot"`.
- **Neon pooled endpoints reject `search_path`** as a startup parameter, so
  `setup-test-db.sh` strips `-pooler` from the URL and points the tests at the
  direct endpoint.
- **Quote `DATABASE_URL` in `.env`.** A Neon connection string ends in
  `?sslmode=require&channel_binding=require`. Unquoted, that `&` makes
  `set -a; . .env; set +a` set the variable to the *empty string* in bash (it
  backgrounds the assignment) and abort with a parse error in zsh — so
  `setup-test-db.sh` runs against no database at all while looking like a
  connection problem. `dotenv` parses the file correctly regardless, so the bot
  itself is unaffected and only the shell scripts break.
- **Migrations must not go through the pooler.** Use `scripts/migrate.sh`;
  `CREATE INDEX CONCURRENTLY` cannot run in the transaction block PgBouncer
  puts it in.
- **`loadTestEnv.ts` must be the first import in a test script.** `src/db/index.ts`
  builds its `Pool` at module-evaluation time, and ESM evaluates imports before
  the importing module's body — calling `dotenv` inside the script itself would
  run after the pool was already built against an empty `DATABASE_URL`.
- **Slash commands not updating?** Re-run `deploy-test-commands`, and confirm
  `SERVER_ID` is the server you are actually testing in.
- **Bot won't log in / no XP from messages?** Check that **Server Members
  Intent** is still enabled in the developer portal. Message Content is not
  used and does not need to be on.
