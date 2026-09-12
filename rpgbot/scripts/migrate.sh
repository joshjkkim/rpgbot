#!/usr/bin/env bash
# Applies migrations to the database in $DATABASE_URL, and records what it has
# applied so the question "is this one live yet?" has an answer other than
# memory.
#
#   ./scripts/migrate.sh --status                  # what is applied, what is pending
#   ./scripts/migrate.sh --all                     # apply every pending migration, in order
#   ./scripts/migrate.sh db/migrations/003_foo.sql # apply one
#   ./scripts/migrate.sh --mark-applied <file>     # record without running (see below)
#
# ─── Why this script exists rather than bare psql ────────────────────────────
#
# 1. Neon. DATABASE_URL points at the *pooled* endpoint (-pooler), which is
#    PgBouncer in transaction pooling mode, and CREATE INDEX CONCURRENTLY
#    cannot run inside a transaction block. Through the pooler a migration
#    fails -- or worse, leaves an INVALID index behind that the planner
#    silently ignores, so the query stays slow and nothing looks broken. Every
#    migration is applied to the direct endpoint instead.
#
# 2. A ledger. `schema_migrations` records every version applied, with a
#    checksum of the file. Re-running is a no-op instead of a gamble, and an
#    already-applied migration that has since been *edited* is caught rather
#    than silently diverging from what is actually in the database.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$HERE/../db/migrations"

# ─── Resolve DATABASE_URL ─────────────────────────────────────────────────────
# Read rpgbot/.env directly rather than telling the caller to
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

# PGOPTIONS, not -v: client_min_messages is a server setting, and -v would
# only define a psql variable -- the "already exists, skipping" NOTICE from
# the ledger's CREATE TABLE IF NOT EXISTS would still print on every run.
psql_q() { PGOPTIONS="-c client_min_messages=warning" psql "$DIRECT_URL" -X -q -t -A -v ON_ERROR_STOP=1 "$@"; }

# Colour only on a terminal. Piped into a file or a CI log, escape codes are
# noise, not emphasis.
if [ -t 1 ]; then
    C_OK=$'\033[32m'; C_PENDING=$'\033[33m'; C_BAD=$'\033[31m'; C_OFF=$'\033[0m'
else
    C_OK=""; C_PENDING=""; C_BAD=""; C_OFF=""
fi

# ─── Helpers ──────────────────────────────────────────────────────────────────

version_of() { basename "$1" .sql; }

checksum_of() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | cut -d' ' -f1
    else
        shasum -a 256 "$1" | cut -d' ' -f1   # macOS
    fi
}

ensure_ledger() {
    # Created here as well as in schema.sql, so the ledger bootstraps itself on
    # a database that predates it -- which is every database that existed
    # before this script grew a ledger.
    psql_q -c "
        CREATE TABLE IF NOT EXISTS public.schema_migrations (
            version    TEXT        PRIMARY KEY,
            checksum   TEXT        NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );" >/dev/null
}

applied_checksum() {
    psql_q -c "SELECT checksum FROM public.schema_migrations WHERE version = '$1';"
}

record() {
    psql_q -c "
        INSERT INTO public.schema_migrations (version, checksum)
        VALUES ('$1', '$2')
        ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum;" >/dev/null
}

migration_files() {
    # Numeric prefixes sort lexically, which is why they are zero-padded.
    ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort
}

usage() {
    echo "usage: $0 [--status | --all | --mark-applied <file> | <file>]" >&2
    echo >&2
    echo "available migrations:" >&2
    migration_files | sed 's|.*/|  |' >&2
}

# ─── Commands ─────────────────────────────────────────────────────────────────

cmd_status() {
    ensure_ledger
    echo
    printf '  %-34s %s\n' "MIGRATION" "STATUS"
    printf '  %-34s %s\n' "$(printf '%.0s-' {1..34})" "------"

    local pending=0
    while IFS= read -r file; do
        local version have want
        version="$(version_of "$file")"
        want="$(checksum_of "$file")"
        have="$(applied_checksum "$version")"

        if [ -z "$have" ]; then
            printf '  %-34s %sPENDING%s\n' "$version" "$C_PENDING" "$C_OFF"
            pending=$((pending + 1))
        elif [ "$have" != "$want" ]; then
            # The file changed after it was applied. The database does not have
            # what this file now says, and applying it again will not fix that
            # -- write a new migration instead.
            printf '  %-34s %sAPPLIED, FILE EDITED SINCE%s\n' "$version" "$C_BAD" "$C_OFF"
        else
            printf '  %-34s %sapplied%s\n' "$version" "$C_OK" "$C_OFF"
        fi
    done < <(migration_files)

    echo
    if [ "$pending" -gt 0 ]; then
        echo "  $pending pending. Apply with: $0 --all"
        echo
    fi
}

apply_one() {
    local file="$1" version want have
    [ -f "$file" ] || { echo "no such migration: $file" >&2; exit 66; }

    version="$(version_of "$file")"
    want="$(checksum_of "$file")"
    have="$(applied_checksum "$version")"

    if [ -n "$have" ]; then
        if [ "$have" != "$want" ]; then
            echo "REFUSING: $version is already applied, but the file has changed since." >&2
            echo "The database does not contain what this file now says, and re-running it" >&2
            echo "will not make it so. Write a new migration for the difference." >&2
            exit 65
        fi
        echo "Already applied, skipping: $version"
        return 0
    fi

    if [ "$DIRECT_URL" != "$DATABASE_URL" ]; then
        echo "Neon pooled endpoint detected; applying to the direct endpoint instead."
    fi

    echo "Applying $version..."
    # ON_ERROR_STOP so a failure partway through is an error, not a warning
    # buried in output. No -1/--single-transaction: CONCURRENTLY forbids it.
    psql "$DIRECT_URL" -X -v ON_ERROR_STOP=1 -f "$file"

    record "$version" "$want"
    echo "Recorded $version in schema_migrations."
}

cmd_all() {
    ensure_ledger
    local any=0
    while IFS= read -r file; do
        local version
        version="$(version_of "$file")"
        if [ -z "$(applied_checksum "$version")" ]; then
            apply_one "$file"
            any=1
        fi
    done < <(migration_files)

    [ "$any" -eq 0 ] && echo "Nothing to do -- every migration is already applied."
    post_apply_note
}

cmd_mark_applied() {
    # For a database that had migrations applied by hand before the ledger
    # existed. Records the version without running the SQL.
    local file="$1" version want
    [ -f "$file" ] || { echo "no such migration: $file" >&2; exit 66; }
    ensure_ledger

    version="$(version_of "$file")"
    want="$(checksum_of "$file")"

    echo "Recording $version as applied WITHOUT running it."
    echo "Only correct if this migration is genuinely already in the database."
    record "$version" "$want"
    echo "Done."
}

post_apply_note() {
    echo
    echo "Verify nothing landed INVALID (a failed CONCURRENTLY index build does):"
    echo
    echo "  npm --workspace rpgbot run doctor"
    echo
}

# ─── Dispatch ─────────────────────────────────────────────────────────────────

case "${1:-}" in
    --status|-s)       cmd_status ;;
    --all|-a)          cmd_all ;;
    --mark-applied)    [ $# -ge 2 ] || { usage; exit 64; }; cmd_mark_applied "$2" ;;
    -h|--help|"")      usage; exit 64 ;;
    -*)                usage; exit 64 ;;
    *)                 ensure_ledger; apply_one "$1"; post_apply_note ;;
esac
