import { Pool } from "pg";
import type { QueryResult,QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var pgPool: Pool | undefined;
}

export const pool = 
    global.pgPool ||
    new Pool({
      connectionString: process.env.DATABASE_URL,
    });

if (process.env.NODE_ENV !== "production") global.pgPool = pool;

export async function dbQuery<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const res = await pool.query<T>(text, params);
    return res;
}