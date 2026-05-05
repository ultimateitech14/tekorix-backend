import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

import { env } from "./env.js";

let pool: Pool | null = null;

function buildPool() {
  return new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });
}

export function getPool() {
  if (!pool) {
    pool = buildPool();
  }

  return pool;
}

export async function getClient() {
  return getPool().connect();
}

export async function query<TResult extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
) {
  return getPool().query<TResult>(text, params as unknown[]);
}

export async function withDatabaseClient<TResult>(callback: (client: PoolClient) => Promise<TResult>) {
  const client = await getClient();

  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

export async function testDatabaseConnection(): Promise<QueryResult<{ current_database: string }>> {
  const result = await query<{ current_database: string }>("SELECT current_database()");
  console.log("Database connected successfully");
  return result;
}

export async function closePool() {
  if (!pool) {
    return;
  }

  await pool.end();
  pool = null;
}
