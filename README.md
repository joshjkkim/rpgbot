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
2. Under **Bot → Privileged Gateway Intents**, enable **Server Members Intent**
   and **Message Content Intent**. The bot requests `GuildMembers` and
   `MessageContent` (`rpgbot/src/index.ts`) and will fail to log in without
   them — message XP and voice XP both depend on these.
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

Changes to an already-deployed database go in `rpgbot/db/migrations/` as
numbered files, never by editing `schema.sql` in place:

```bash
psql "$DATABASE_URL" -f rpgbot/db/migrations/001_performance_indexes.sql
```

(`001` is not yet applied to production. It uses `CREATE INDEX CONCURRENTLY`,
so it is safe to run while the bot is up.)

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
npm run deploy-test-commands   # register slash commands (see below)
npm run dev:bot                # start the bot  (tsx src/index.ts)
npm run dev:web                # start the dashboard on :3000
```

**When to re-run `deploy-test-commands`:** only when a command's *definition*
changes — its name, description, options, or a new command added to
`commandList` in `rpgbot/src/commands/index.ts`. Editing the code that *handles*
a command needs nothing but a bot restart. It registers guild-scoped commands to
`SERVER_ID`, which appear instantly; global registration would take up to an
hour.

The bot has no hot reload — restart it after a change. On `SIGINT`/`SIGTERM` it
flushes the write-back cache before exiting, so stop it with **Ctrl-C** rather
than killing the process: up to 30 seconds of XP and gold lives only in memory
at any moment.

---

## Testing

There is a headless smoke suite for the persistence layer that never touches
Discord. It runs against an **isolated scratch schema**, not your real data.

```bash
# One-time (or whenever schema.sql changes): build the scratch schema.
cd rpgbot
set -a; . .env; set +a          # export DATABASE_URL for the script
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
- **`loadTestEnv.ts` must be the first import in a test script.** `src/db/index.ts`
  builds its `Pool` at module-evaluation time, and ESM evaluates imports before
  the importing module's body — calling `dotenv` inside the script itself would
  run after the pool was already built against an empty `DATABASE_URL`.
- **Slash commands not updating?** Re-run `deploy-test-commands`, and confirm
  `SERVER_ID` is the server you are actually testing in.
- **Bot won't log in / no XP from messages?** Check the two privileged intents
  are still enabled in the developer portal.
