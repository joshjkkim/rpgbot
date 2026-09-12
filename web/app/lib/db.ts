import { Pool } from "pg";
import type { QueryResult,QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var pgPool: Pool | undefined;
}

// `max` is deliberately small. On a serverless host every warm instance holds
// its own Pool, so the connection count is (instances x max), not max -- the
// pg default of 10 turns a modest traffic spike into "too many connections"
// against a database the bot also needs. Two is enough for a dashboard whose
// queries are a handful of milliseconds each.
//
// idleTimeoutMillis is short for the same reason: an instance that handled one
// request an hour ago should not still be holding sockets open.
export const pool =
    global.pgPool ||
    new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });

// Without this listener an idle client dying -- the host recycling it, a Neon
// branch suspending -- throws out of the EventEmitter and takes the instance
// down. pg has already discarded the client; the next query gets a fresh one.
pool.on("error", (err) => {
  console.error("Idle Postgres client errored (pool recovered):", err.message);
});

if (process.env.NODE_ENV !== "production") global.pgPool = pool;

export async function dbQuery<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const res = await pool.query<T>(text, params);
    return res;
}