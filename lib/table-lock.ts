import type { PoolClient } from "pg";

function normalizeTableNames(tableNos: string[]) {
  return Array.from(new Set(tableNos.map((name) => name.trim()).filter(Boolean))).sort();
}

export async function lockBaseTables(client: PoolClient, tableNos: string[]) {
  const names = normalizeTableNames(tableNos);
  for (const tableNo of names) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [`rdv:table:${tableNo}`]);
  }
}

export async function lockSessionName(client: PoolClient, sessionTableNo: string) {
  const key = sessionTableNo.trim();
  if (!key) return;
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [`rdv:session:${key}`]);
}

