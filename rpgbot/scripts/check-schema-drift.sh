#!/usr/bin/env bash
# Proves that db/schema.sql and db/migrations/ still agree about the shape of
# the database.
#
#   PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres ./scripts/check-schema-drift.sh
#
# ─── The bug this catches ─────────────────────────────────────────────────────
#
# Two paths build a database here, and they must end up in the same place:
#
#   fresh install   ->  schema.sql
#   live database   ->  schema.sql (once, long ago) + every migration since
#
# Add a column in a migration and forget to add it to schema.sql and nothing
# breaks -- production has the column, and it was applied by hand so no tool
# complains. The breakage arrives much later, for someone setting up a fresh
# database, as a runtime error about a column that does not exist. This builds
# both databases and diffs their columns.
#
# Indexes are deliberately NOT compared. schema.sql carries every *column* the
# code expects; the migrations additionally carry indexes that a fresh install
# does not strictly need to be correct, only fast. That asymmetry is intended
# (see README), so comparing indexes would fail on every run.
#
# ─── Safety ───────────────────────────────────────────────────────────────────
#
# It CREATEs and DROPs databases, so it refuses to talk to anything but
# localhost unless you insist with ALLOW_REMOTE=1. Never point it at Neon.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_SQL="$HERE/../db/schema.sql"
MIGRATIONS_DIR="$HERE/../db/migrations"

BASE_DB="${BASE_DB:-rpgbot_drift_base}"
FULL_DB="${FULL_DB:-rpgbot_drift_full}"

host="${PGHOST:-localhost}"
if [ "$host" != "localhost" ] && [ "$host" != "127.0.0.1" ] && [ "${ALLOW_REMOTE:-0}" != "1" ]; then
    echo "Refusing to create and drop databases on '$host'." >&2
    echo "This is for a throwaway Postgres. Set ALLOW_REMOTE=1 only if you are certain." >&2
    exit 1
fi

# Connect to the maintenance database for CREATE/DROP.
admin() { psql -v ON_ERROR_STOP=1 -q -d postgres "$@"; }
run_in() { local db="$1"; shift; psql -v ON_ERROR_STOP=1 -q -d "$db" "$@"; }

cleanup() {
    admin -c "DROP DATABASE IF EXISTS $BASE_DB;" >/dev/null 2>&1 || true
    admin -c "DROP DATABASE IF EXISTS $FULL_DB;" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Building '$BASE_DB' from schema.sql alone..."
cleanup
admin -c "CREATE DATABASE $BASE_DB;" >/dev/null
run_in "$BASE_DB" -f "$SCHEMA_SQL" >/dev/null

echo "Building '$FULL_DB' from schema.sql + every migration..."
admin -c "CREATE DATABASE $FULL_DB;" >/dev/null
run_in "$FULL_DB" -f "$SCHEMA_SQL" >/dev/null

shopt -s nullglob
migrations=("$MIGRATIONS_DIR"/*.sql)
shopt -u nullglob

for m in "${migrations[@]}"; do
    echo "  applying $(basename "$m")"
    # No --single-transaction: CREATE INDEX CONCURRENTLY forbids it.
    run_in "$FULL_DB" -f "$m" >/dev/null
done

# ─── Idempotency ──────────────────────────────────────────────────────────────
# Every migration is written with IF NOT EXISTS so a re-run is harmless. If one
# is not, a retry after a partial failure -- the situation you are always in
# when a migration goes wrong -- becomes its own outage.
echo "Re-applying every migration to check it is idempotent..."
for m in "${migrations[@]}"; do
    if ! run_in "$FULL_DB" -f "$m" >/dev/null 2>&1; then
        echo >&2
        echo "FAIL: $(basename "$m") is not idempotent -- it errors when applied twice." >&2
        echo "Use IF NOT EXISTS / IF EXISTS so a re-run after a partial failure is safe." >&2
        exit 1
    fi
done

# ─── Compare ──────────────────────────────────────────────────────────────────
columns_sql="
SELECT table_name || '.' || column_name || ' ' || data_type ||
       CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY 1;"

base_cols="$(run_in "$BASE_DB" -t -A -c "$columns_sql")"
full_cols="$(run_in "$FULL_DB" -t -A -c "$columns_sql")"

if [ "$base_cols" = "$full_cols" ]; then
    echo
    echo "OK: schema.sql and db/migrations/ agree on every column."
    exit 0
fi

echo >&2
echo "DRIFT: a database built from schema.sql alone does not match one built" >&2
echo "from schema.sql + migrations." >&2
echo >&2
echo "  '<' only in schema.sql     '>' only after migrations" >&2
echo >&2
diff <(printf '%s\n' "$base_cols") <(printf '%s\n' "$full_cols") | sed 's/^/  /' >&2 || true
echo >&2
echo "Fix: add the column to db/schema.sql so a fresh install gets it too." >&2
exit 1
