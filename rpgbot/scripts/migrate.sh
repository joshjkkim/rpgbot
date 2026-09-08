#!/usr/bin/env bash
# Applies a migration file to the database in $DATABASE_URL.
#
#   ./scripts/migrate.sh db/migrations/001_performance_indexes.sql
#
# Exists because of one Neon-specific trap. DATABASE_URL points at the *pooled*
# endpoint (-pooler), which is PgBouncer in transaction pooling mode, and
# CREATE INDEX CONCURRENTLY cannot run inside a transaction block. Run a
# migration through the pooler and it fails -- or worse, leaves an INVALID index
# behind that silently does not get used. Every migration here is applied to the
# direct endpoint instead, the same substitution setup-test-db.sh already makes.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ $# -lt 1 ]; then
    echo "usage: $0 <path-to-migration.sql>" >&2
    echo >&2
    echo "available:" >&2
    ls -1 "$HERE/../db/migrations/"*.sql 2>/dev/null | sed 's/^/  /' >&2
    exit 64
fi

FILE="$1"
[ -f "$FILE" ] || { echo "no such migration: $FILE" >&2; exit 66; }

# Fall back to reading rpgbot/.env directly rather than telling the caller to
# `set -a; . .env; set +a`. A Neon connection string contains `&`, so an
# unquoted value makes that idiom set DATABASE_URL to the empty string in bash
# and abort with a parse error in zsh -- a failure that looks like a database
# problem, not a quoting one. Parsing the file avoids the shell entirely.
if [ -z "${DATABASE_URL:-}" ] && [ -f "$HERE/../.env" ]; then
    DATABASE_URL="$(
        sed -n 's/^[[:space:]]*DATABASE_URL[[:space:]]*=[[:space:]]*//p' "$HERE/../.env" \
        | tail -n 1 \
        | sed -e 's/^"//' -e "s/^'//" -e 's/"[[:space:]]*$//' -e "s/'[[:space:]]*\$//"
    )"
    [ -n "$DATABASE_URL" ] && echo "Using DATABASE_URL from rpgbot/.env"
fi

if [ -z "${DATABASE_URL:-}" ]; then
    echo "DATABASE_URL is not set, and rpgbot/.env has no usable value." >&2
    exit 78
fi

# Strip Neon's pooler from the host. Harmless on any other Postgres host.
DIRECT_URL="${DATABASE_URL/-pooler/}"

if [ "$DIRECT_URL" != "$DATABASE_URL" ]; then
    echo "Neon pooled endpoint detected; applying to the direct endpoint instead."
fi

# ON_ERROR_STOP so a failure partway through is an error, not a warning buried
# in output. No -1/--single-transaction: CONCURRENTLY forbids it.
echo "Applying $(basename "$FILE")..."
psql "$DIRECT_URL" -X -v ON_ERROR_STOP=1 -f "$FILE"

echo
echo "Done. Verify nothing landed INVALID (a failed CONCURRENTLY build does):"
echo
echo "  psql \"\$DATABASE_URL\" -c \"SELECT c.relname, i.indisvalid FROM pg_index i \\"
echo "    JOIN pg_class c ON c.oid = i.indexrelid WHERE NOT i.indisvalid;\""
