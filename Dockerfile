# ── build ─────────────────────────────────────────────────────────────────────
# Debian (glibc), not Alpine: @napi-rs/canvas ships prebuilt native binaries and
# the glibc ones are the well-trodden path. Switching to Alpine means pulling the
# musl build and is a good way to lose an evening to a linker error.
FROM node:22-slim AS build

WORKDIR /app

# npm ci resolves against the root lockfile and needs every workspace's
# package.json present, even though only rpgbot is built here.
COPY package.json package-lock.json ./
COPY rpgbot/package.json ./rpgbot/
COPY web/package.json ./web/

# Dev dependencies are needed here -- tsc does the build.
RUN npm ci

COPY tsconfig.json ./
COPY rpgbot ./rpgbot

RUN npm --workspace rpgbot run build


# ── runtime ───────────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
COPY rpgbot/package.json ./rpgbot/
COPY web/package.json ./web/

# Production dependencies only. The bot runs compiled JS; tsx and typescript
# stay in the build stage.
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/rpgbot/dist ./rpgbot/dist

# Profile-card fonts are vendored, not installed from apt: this image has no
# system fonts at all, and src/ui/canvas/fonts.ts throws at startup if these are
# missing rather than rendering every card in a fallback face.
COPY rpgbot/assets ./rpgbot/assets

# Drop privileges. The node image ships an unprivileged `node` user.
USER node

WORKDIR /app/rpgbot

# Exec form, so node is PID 1 and receives SIGTERM directly -- that signal is
# what triggers the write-back cache flush. A shell-form CMD would swallow it
# and every deploy would drop up to 30s of XP and gold.
CMD ["node", "dist/index.js"]
