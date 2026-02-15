import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

let cachedPool: Pool | null = null;

function getPool() {
  if (cachedPool) return cachedPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  cachedPool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
  });

  return cachedPool;
}

export const pool = {
  query: <T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> =>
    getPool().query<T>(text, params),
  connect: (): Promise<PoolClient> => getPool().connect()
};
