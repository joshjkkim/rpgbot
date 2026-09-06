#!/usr/bin/env bash
# Creates (or recreates) an isolated scratch schema for the smoke tests and
# prints the DATABASE_URL to use with it.
#
#   ./scripts/setup-test-db.sh
#
# The scratch schema lives in the same database but is completely separate from
# `public`. Dropping it cannot touch real data.
set -euo pipefail

SCHEMA="${TEST_SCHEMA:-rpgbot_test}"

if [ -z "${DATABASE_URL:-}" ]; then
    echo "DATABASE_URL is not set. Export it, or run: set -a; . .env; set +a" >&2
    exit 1
fi

if [ "$SCHEMA" = "public" ]; then
    echo "Refusing to use the public schema." >&2
    exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Recreating schema '$SCHEMA'..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q \
    -c "DROP SCHEMA IF EXISTS $SCHEMA CASCADE; CREATE SCHEMA $SCHEMA;"

echo "Applying schema.sql into '$SCHEMA'..."
sed -e "s/public\./$SCHEMA./g" -e "s/trade_status/${SCHEMA}_trade_status/g" \
    "$HERE/../db/schema.sql" \
  | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q

# Append the search_path option so the bot's unqualified table names resolve
# to the scratch schema instead of public. Written to a gitignored file rather
# than echoed, so the password never lands in terminal scrollback or CI logs.
SEP="?"; case "$DATABASE_URL" in *\?*) SEP="&";; esac

# Neon's pooled endpoint (-pooler) rejects search_path as a startup parameter,
# so the tests talk to the direct endpoint. Harmless on non-Neon hosts.
DIRECT_URL="${DATABASE_URL/-pooler/}"

TEST_URL="${DIRECT_URL}${SEP}options=-c%20search_path%3D${SCHEMA}"

ENV_FILE="$HERE/../.env.test"
umask 077
printf 'DATABASE_URL=%s\n' "$TEST_URL" > "$ENV_FILE"

echo
echo "Ready. Scratch connection string written to rpgbot/.env.test"
echo "Run the smoke tests with:"
echo
echo "  npm --workspace rpgbot run smoke"
echo
