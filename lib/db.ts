import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

let cachedPool: Pool | null = null;

function normalizeConnectionString(connectionString: string) {
  try {
    const url = new URL(connectionString);
    const sslmode = (url.searchParams.get("sslmode") || "").toLowerCase();
    if (sslmode === "require" && !url.searchParams.has("uselibpqcompat")) {
      url.searchParams.set("uselibpqcompat", "true");
    }
    return url.toString();
  } catch {
    return connectionString;
  }
}

function getPool() {
  if (cachedPool) return cachedPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const max = Math.max(1, Number(process.env.DB_POOL_MAX || 6) || 6);
  const connectionTimeoutMillis = Math.max(500, Number(process.env.DB_CONNECT_TIMEOUT_MS || 4000) || 4000);
  const idleTimeoutMillis = Math.max(1000, Number(process.env.DB_IDLE_TIMEOUT_MS || 10000) || 10000);
  const statementTimeout = Math.max(1000, Number(process.env.DB_STATEMENT_TIMEOUT_MS || 12000) || 12000);

  cachedPool = new Pool({
    connectionString: normalizeConnectionString(connectionString),
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    max,
    connectionTimeoutMillis,
    idleTimeoutMillis,
    statement_timeout: statementTimeout,
    keepAlive: true
  });

  return cachedPool;
}

export const pool = {
  query: <T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> =>
    getPool().query<T>(text, params),
  connect: (): Promise<PoolClient> => getPool().connect()
};
