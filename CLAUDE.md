# CLAUDE.md

Context for AI agents (and humans) working in this repo. Setup and testing are in
[README.md](./README.md); deploys, migrations and incidents are in
[OPERATIONS.md](./OPERATIONS.md). This file covers what those don't: where
things run, the workflow, and the conventions the code relies on.

havocish is a Discord RPG/leveling bot (`havocish/`, discord.js + TypeScript) and
its Next.js dashboard and website (`web/`), in one npm workspace, sharing one
Postgres database. Live at havocish.com.

## Where things run

| What | Where | Ships by |
| --- | --- | --- |
| Bot | Fly app `rpgbot-eilynw` (one machine, region ord) | `fly deploy -a rpgbot-eilynw`, by hand |
| Dashboard + site | Vercel project `rpgbot-web`, root `web/` | Auto on merge to main. Check havocish.com updated: a merge once didn't trigger a prod deploy |
| Database | Neon, `production` branch | Migrations by hand, before the deploy that needs them |
| Slash commands | Discord, global | Registered by hand when a command definition changes (below) |

**Local runs use the dev bot ("havocish dev") and the Neon `development` branch.**
`havocish/.env` and `web/.env.local` hold dev values. Never put the production
token in `.env`: two processes with one token both answer every event.

## Commands

From `havocish/` unless noted.

```bash
npm run dev:watch                 # run the dev bot
npm run deploy-test-commands      # register commands to the test server (instant)
npm run typecheck                 # bot src + scripts
npm --workspace havocish run smoke  # from repo root; uses the scratch schema havocish_test, never real rows
npm run docs:commands             # regenerate web/app/docs/commands.json (CI fails if stale)
npx tsc --noEmit && npx eslint    # in web/
```

Production command registration (only when a command's name, options or
description change), using prod values for that one command:

```bash
env $(grep '^DISCORD_TOKEN=' .env.prod.bak | xargs) CLIENT_ID=1440169378435043378 npm run deploy-commands
```

## Workflow

**Releases go through a `dev` branch** (since 2026-10-19). Merging to `main` deploys the dashboard to production straight away (Vercel), so work collects on `dev` and ships in batches:

- Feature PRs branch from `dev` and target `dev` (`gh pr create --base dev`). Test on the dev bot; Vercel builds a preview for `dev`.
- Release: one PR `dev` → `main` (merge, don't squash, so `dev` and `main` share history). Then `fly deploy`, prod command registration if commands changed, and the changelog post.
- Urgent fixes branch from `main`, merge to `main`, deploy, then merge `main` back into `dev`.

- One PR per change, **squash merge** (`gh pr merge N --squash --delete-branch`).
- **Wait for CI to pass before merging.** It runs typecheck, lint, build, the smoke suite, the schema check, the Docker build and the command-reference check.
- Don't stack a PR on another PR's branch: `--delete-branch` on the base closes the stacked PR. Merge, then branch from main.
- Player-facing changes add a bullet under `## Unreleased` in `CHANGELOG.md`. Use only `##`/`###` headings, flat `- ` bullets and `**bold**`/`*italic*`/`` `code` ``, since the changelog page's parser handles nothing else. Start each bullet with a bold lead that reads on its own (`- **Party fights: join someone's fight.** …`): the Discord post shows only the leads and links to the full notes on the site.
- Releases go out in batches: rename Unreleased to `## vX.Y · Month D, YYYY`, preview with `npm run changelog:post`, and post with `-- --send` **only after the owner says yes**.
- Changed a command? Run `npm run docs:commands` and commit the JSON.
- `/docs` pages state defaults (XP per message, cooldowns, curves). Update them when a default changes.
- Commit messages: avoid backticks inside a double-quoted `git commit -m`, because the shell runs them. Use a heredoc or `-F file`.
- The owner prefers paste-able SQL for the Neon SQL Editor over `psql` one-liners, and plain-language explanations.

## How the code fits together

**Guild config** is one JSON blob per server (`guilds.config`), typed as `GuildConfig` in `havocish/src/types/guild.ts`.
- `DEFAULT_GUILD_CONFIG` holds the defaults, and `mergeConfig` (`db/guilds.ts`) fills them in on read. It merges **only as deep as written**, so a new section needs its own entry there.
- The bot caches config for 60 s (`cache/guildService.ts`).
- The dashboard saves the whole config with a version hash, and refuses if it changed meanwhile.
- The bot writes single settings with `setGuildConfigFlag` (`jsonb_set`), so it never overwrites a dashboard edit.
- The dashboard mirrors config types per editor (`web/app/components/*/…Editor.tsx`); keep them in step with the bot's types.

**Profiles** are a write-back cache (`cache/profileService.ts`).
- Change a profile with `getOrCreateProfile` then `commitProfileChanges`, never with raw SQL from a command. The commit merges concurrent XP/gold deltas and emits `levelUp`.
- `user_stats` is a JSON bag of counters, which also holds gathering progress (`user_stats.gathering`).

**Items:** inventories store a copy of each item's name and emoji, but displays read the **live** definition from config first, so renames show everywhere. The dashboard tooltip (`web/app/components/shop/itemTooltip.tsx`) and the bot's item card (`havocish/src/ui/canvas/itemCard.ts`, `itemEffects`) render the same lines. Change one, change the other.

**Gathering** (`/gather`): owner-made activities, each played as a button minigame.
- `commands/user/gather.ts` is the runner: it starts runs and owns their timers, timeout and payout.
- Each game is a file in `ui/gathering/` implementing `Game` from `run.ts` (`grid`, `timing`, `find`). Adding a game means a new file, a `GameType` entry, and its fields in `web/app/components/gathering/gatheringEditor.tsx`.
- Shared rules (skills, loot rolls, tools, cooldowns) are in `player/gathering.ts`.

**Content (`havocish/src/content/`)** is the one folder both the bot and the dashboard import (the dashboard as `@content/*`): starter packs, server setup, and the content library.
- Starter packs: `content/packs/*.json`, plus rows in the `starter_packs` table that read live from a template server. `applyPack` never overwrites an id the server already has. The Features page's demos read `classic-fantasy.json`, so pack edits show up there.
- The library (`content/library.ts`) adds single entries with what they need (`plan`, `addEntries`), reusing what the server has.
- Files here import each other with `.ts` extensions (the bot's build rewrites them to `.js`; Turbopack can't map `.js` to `.ts`), and nothing here may import from the rest of the bot or from `web/`.

**Characters:** public posts (encounters, bosses, announcements) go through `speak()` in `havocish/src/ui/characters.ts`, which posts as a character through a webhook or falls back to the bot. Edit those messages with `editSpoken()`, since a webhook's message can't be edited with `message.edit`. New public posts should use `speak()` too.

**Health check:** `havocish/src/health/checkGuild.ts` lists setups that would fail quietly. A new feature that can be misconfigured should add checks there.

## Product decisions to respect

- Access: the dashboard and the manager commands allow the **owner or Manage Server**. Keep the bot (`canManage`) and the dashboard (`canManageGuild`) in step.
- Owner-facing config lives on the dashboard. In Discord, `/config` is on/off switches and `/admin` fixes members. The old `/config-*` commands stay until owners give feedback; don't delete them unasked.
- havocish should feel like a **mini-game editor**: every player-visible word is owner-editable, and nothing is hardcoded to one theme. Classic Fantasy is an example, not the product.
- Combat is the backbone. Gathering and quests feed into it rather than replace it.
- UI style: WoW Classic, calm and muted, pixel art (`web/app/sprites.ts`). No glossy SaaS patterns, icon-card grids or eyebrow labels. Show real output (renders, live components) over descriptions.
