/**
 * Preflight check for a database the bot is about to run against.
 *
 *   npm --workspace rpgbot run doctor
 *
 * Run it before a deploy, after a migration, and first thing when something is
 * wrong in production. It answers, in order, the questions that actually go
 * wrong here:
 *
 *   - is the process configured at all?
 *   - can it reach the database?
 *   - does the schema have the columns this build of the code writes?
 *   - did every migration get applied?
 *   - did any CONCURRENTLY index build fail and leave an INVALID index behind?
 *
 * Exits non-zero if any check fails, so it can gate a deploy script.
 *
 * Read-only. It creates nothing and changes nothing.
 */
import "dotenv/config";
import { readdirSync } from "node:fs";
import { Pool } from "pg";
import { REQUIRED_ENV, missingEnv } from "../src/env.js";

const MIGRATIONS_DIR = new URL("../db/migrations/", import.meta.url);

/**
 * Columns a migration added, which the code writes unconditionally. A deploy
 * that ships ahead of its migration does not degrade -- `guilds.removed_at` is
 * in every upsertGuild() call, so a missing column fails *every guild write*,
 * not just the removal path. That is the failure this list exists to catch.
 *
 * Add a row here whenever a migration adds a column the code depends on.
 */
const REQUIRED_COLUMNS: ReadonlyArray<[table: string, column: string, since: string]> = [
    ["guilds", "removed_at", "002"],
];

// Colour only on a terminal; in a CI log escape codes are noise.
const TTY = process.stdout.isTTY;
const GREEN = TTY ? "\x1b[32m" : "", RED = TTY ? "\x1b[31m" : "",
      YELLOW = TTY ? "\x1b[33m" : "", DIM = TTY ? "\x1b[2m" : "",
      OFF = TTY ? "\x1b[0m" : "";

/** host/database from a connection string, with the credentials removed. */
function describeTarget(url: string): string {
    try {
        const u = new URL(url);
        return `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
    } catch {
        return "(unparseable DATABASE_URL)";
    }
}

let failed = 0;
let warned = 0;

function pass(label: string, detail = "") {
    console.log(`  ${GREEN}ok${OFF}    ${label}${detail ? ` ${DIM}${detail}${OFF}` : ""}`);
}
function warn(label: string, detail = "") {
    warned++;
    console.log(`  ${YELLOW}warn${OFF}  ${label}${detail ? ` ${DIM}${detail}${OFF}` : ""}`);
}
function fail(label: string, detail = "") {
    failed++;
    console.log(`  ${RED}FAIL${OFF}  ${label}${detail ? `\n        ${detail}` : ""}`);
}

async function main() {
    console.log("\nrpgbot doctor\n");

    // ─── Configuration ────────────────────────────────────────────────────────
    console.log("Configuration");
    const missing = missingEnv(REQUIRED_ENV);
    if (missing.length) {
        fail(`missing environment: ${missing.join(", ")}`, "See README.md -> Fill in the env files.");
        // Nothing below can run without a connection string.
        console.log(`\n${RED}${failed} check(s) failed.${OFF}\n`);
        process.exit(1);
    }
    pass("required environment variables set", REQUIRED_ENV.join(", "));

    const url = process.env.DATABASE_URL!;

    // Say out loud which database this is about to open. `import "dotenv/config"`
    // above means an unset DATABASE_URL falls back to rpgbot/.env -- which on a
    // developer machine is production. Every query below is a read, but the
    // operator should still never have to guess what they just pointed this at.
    pass("target", describeTarget(url));

    if (url.includes("-pooler")) {
        pass("DATABASE_URL points at a pooled endpoint", "correct for the bot; migrate.sh strips it");
    }

    // ─── Connectivity ─────────────────────────────────────────────────────────
    console.log("\nDatabase");
    const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 });

    try {
        const who = await pool.query<{ db: string; schema: string; version: string }>(
            `SELECT current_database() AS db,
                    current_schema()   AS schema,
                    current_setting('server_version') AS version`
        );
        const row = who.rows[0]!;
        pass("connected", `${row.db} (schema ${row.schema}, Postgres ${row.version})`);
    } catch (err) {
        fail("cannot connect", err instanceof Error ? err.message : String(err));
        await pool.end().catch(() => null);
        console.log(`\n${RED}${failed} check(s) failed.${OFF}\n`);
        process.exit(1);
    }

    // ─── Tables ───────────────────────────────────────────────────────────────
    const EXPECTED_TABLES = ["users", "guilds", "user_guild_profiles", "trades", "events"];
    const tables = await pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`
    );
    const present = new Set(tables.rows.map((r) => r.table_name));
    const absent = EXPECTED_TABLES.filter((t) => !present.has(t));

    if (absent.length) {
        fail(`missing tables: ${absent.join(", ")}`, "Apply db/schema.sql to this database.");
    } else {
        pass("all five tables present", EXPECTED_TABLES.join(", "));
    }

    // ─── Columns a migration added ────────────────────────────────────────────
    for (const [table, column, since] of REQUIRED_COLUMNS) {
        const res = await pool.query(
            `SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
            [table, column]
        );
        if (res.rowCount) {
            pass(`${table}.${column} exists`, `added by migration ${since}`);
        } else {
            fail(
                `${table}.${column} is MISSING (migration ${since} not applied)`,
                "The code writes this column unconditionally. Do not deploy until it exists:\n" +
                "        cd rpgbot && ./scripts/migrate.sh --all"
            );
        }
    }

    // ─── Migration ledger ─────────────────────────────────────────────────────
    console.log("\nMigrations");
    const onDisk = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .map((f) => f.replace(/\.sql$/, ""))
        .sort();

    const hasLedger = present.has("schema_migrations");
    if (!hasLedger) {
        warn(
            "no schema_migrations table",
            "this database predates the ledger -- see OPERATIONS.md, Adopting the ledger"
        );
    } else {
        const applied = await pool.query<{ version: string }>(
            `SELECT version FROM schema_migrations`
        );
        const appliedSet = new Set(applied.rows.map((r) => r.version));
        const pending = onDisk.filter((v) => !appliedSet.has(v));
        const unknown = [...appliedSet].filter((v) => !onDisk.includes(v));

        if (pending.length) {
            fail(`${pending.length} migration(s) pending: ${pending.join(", ")}`,
                 "cd rpgbot && ./scripts/migrate.sh --all");
        } else {
            pass(`all ${onDisk.length} migration(s) applied`, onDisk.join(", "));
        }

        if (unknown.length) {
            // The database is ahead of the checkout: someone applied a
            // migration from a branch this working copy does not have.
            warn(`applied but not in db/migrations/: ${unknown.join(", ")}`,
                 "this checkout may be behind the deployed branch");
        }
    }

    // ─── Invalid indexes ──────────────────────────────────────────────────────
    console.log("\nIndexes");
    const invalid = await pool.query<{ relname: string }>(
        `SELECT c.relname
         FROM pg_index i
         JOIN pg_class c ON c.oid = i.indexrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE NOT i.indisvalid AND n.nspname = current_schema()`
    );

    if (invalid.rowCount) {
        const names = invalid.rows.map((r) => r.relname).join(", ");
        fail(
            `INVALID index: ${names}`,
            "A CREATE INDEX CONCURRENTLY failed partway. The planner ignores these, so\n" +
            "        the query is silently unindexed. Drop and rebuild:\n" +
            `        DROP INDEX CONCURRENTLY ${invalid.rows[0]!.relname};`
        );
    } else {
        pass("no invalid indexes");
    }

    await pool.end();

    // ─── Verdict ──────────────────────────────────────────────────────────────
    console.log();
    if (failed) {
        console.log(`${RED}${failed} check(s) failed${OFF}${warned ? `, ${warned} warning(s)` : ""}. Do not deploy.\n`);
        process.exit(1);
    }
    console.log(`${GREEN}All checks passed${OFF}${warned ? `, ${warned} warning(s)` : ""}.\n`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
