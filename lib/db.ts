import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

let cachedPool: Pool | null = null;
let cachedPrintMetadataPool: Pool | null = null;

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

function getPool(printMetadata = false) {
  const existing = printMetadata ? cachedPrintMetadataPool : cachedPool;
  if (existing) return existing;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const max = Math.max(1, Number(process.env.DB_POOL_MAX || 6) || 6);
  const connectionTimeoutMillis = Math.max(500, Number(process.env.DB_CONNECT_TIMEOUT_MS || 4000) || 4000);
  // Reuse connections across short pauses between hotel operations; keep the
  // same maximum pool size and honor explicit deployment configuration.
  const idleTimeoutMillis = Math.max(1000, Number(process.env.DB_IDLE_TIMEOUT_MS || 30000) || 30000);
  const statementTimeout = Math.max(1000, Number(process.env.DB_STATEMENT_TIMEOUT_MS || 12000) || 12000);

  const created = new Pool({
    connectionString: normalizeConnectionString(connectionString),
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    // Auxiliary print status/audit writes cannot occupy the business pool or
    // spend its 12-second statement budget after cloud acceptance.
    max: printMetadata ? 1 : max,
    connectionTimeoutMillis: printMetadata ? Math.min(connectionTimeoutMillis, 1000) : connectionTimeoutMillis,
    idleTimeoutMillis,
    statement_timeout: printMetadata ? Math.min(statementTimeout, 1500) : statementTimeout,
    ...(printMetadata ? { query_timeout: 2000 } : {}),
    keepAlive: true
  });
  // pg emits this for idle connections; without a listener EventEmitter can
  // terminate the process. The pool removes the broken client itself.
  created.on("error", () => {
    console.error("Database idle connection lost; pool will replace it.");
  });

  if (printMetadata) cachedPrintMetadataPool = created;
  else cachedPool = created;
  return created;
}

export const pool = {
  query: <T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> =>
    getPool().query<T>(text, params),
  connect: (): Promise<PoolClient> => getPool().connect()
};

// Only best-effort metadata uses this bounded lane. Orders and delivery state
// always use the normal pool and retain their existing transaction guarantees.
export const printMetadataPool = {
  query: (text: string, params?: any[]) => getPool(true).query(text, params)
};
