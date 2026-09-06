import { Pool } from "pg";
import type { QueryResult, QueryResultRow, PoolClient } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: any[] = []
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function withClient<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/**
 * Runs `fn` inside a transaction, committing on success and rolling back on
 * any thrown error. Use this for anything that must not half-apply -- trades,
 * or any multi-row balance change.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => null);
      throw err;
    }
  });
}

/** Closes the pool. Called on shutdown, after the final cache flush. */
export async function closePool(): Promise<void> {
  await pool.end();
}
