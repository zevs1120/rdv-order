import { createHash } from "node:crypto";
import type { QueryResultRow } from "pg";
import { pool } from "../db";
import { PrintError, Xpyun } from "./xpyun";

export type PrintDb = { query<T extends QueryResultRow = any>(sql: string, params?: any[]): Promise<{ rows: T[] }> };
export type Delivery = { id: string; kind: string; order_id: string | null; printer_sn: string; content: string;
  snapshot: unknown; provider_key: string; status: string; remote_id: string | null; created_at: Date };
type PrintInput = { kind: "order" | "receipt" | "self_test" | "reprint"; intentKey: string; orderId?: string;
  printerSn: string; content: string; snapshot: object; implementation?: string };
export const PRINT_IMPLEMENTATION = "official-direct-20261013";

// Retain the existing immutable history table, not the old scheduling code.
export async function savePrint(tx: PrintDb, input: PrintInput): Promise<Delivery> {
  const { rows } = await tx.query<Delivery>(
    `INSERT INTO print_deliveries (kind, intent_key, order_id, printer_sn, content, snapshot, content_sha256, provider_key)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
     ON CONFLICT (kind, intent_key) DO UPDATE SET intent_key = EXCLUDED.intent_key
       WHERE print_deliveries.content_sha256 = EXCLUDED.content_sha256
         AND print_deliveries.printer_sn = EXCLUDED.printer_sn
         AND print_deliveries.order_id IS NOT DISTINCT FROM EXCLUDED.order_id
         AND print_deliveries.snapshot = EXCLUDED.snapshot
     RETURNING *`, [input.kind, input.intentKey, input.orderId || null, input.printerSn, input.content,
      JSON.stringify({ ...input.snapshot, implementation: input.implementation || PRINT_IMPLEMENTATION }),
      createHash("sha256").update(input.content).digest("hex"),
      createHash("sha256").update(`${input.kind}:${input.intentKey}`).digest("hex").slice(0, 48)]);
  if (!rows[0]) throw new Error("打印请求编号与原内容不匹配");
  return rows[0];
}

// Called after the business transaction commits, and awaited before responding.
// The conditional UPDATE allows exactly one invocation to submit this record.
export async function sendPrint(id: string, db: PrintDb = pool, provider: (sn: string) => Pick<Xpyun, "print"> = sn => Xpyun.configured(sn)): Promise<string> {
  try {
    const { rows: [job] } = await db.query<Delivery>(
      `UPDATE print_deliveries SET status = 'sending', attempt_count = attempt_count + 1,
         first_attempt_at = now(), sending_started_at = now(), updated_at = now()
       WHERE id = $1 AND status = 'queued' AND attempt_count = 0 AND remote_id IS NULL
         AND snapshot->>'implementation' = $2 RETURNING *`, [id, PRINT_IMPLEMENTATION]);
    if (!job) {
      const { rows } = await db.query<{ status: string }>(`SELECT status FROM print_deliveries WHERE id = $1`, [id]);
      return rows[0]?.status || "unknown";
    }
    let remoteId: string;
    try { remoteId = await provider(job.printer_sn).print(job.content, job.provider_key); }
    catch (error) {
      const status = error instanceof PrintError && error.definite ? "failed" : "unknown";
      await db.query(`UPDATE print_deliveries SET status = $2, last_error = $3, updated_at = now()
        WHERE id = $1 AND status = 'sending'`, [id, status, error instanceof PrintError ? error.message : "打印请求未确认"]);
      console.error("print.direct", JSON.stringify({ id, status, code: error instanceof PrintError ? error.code : undefined }));
      return status;
    }
    // Persisting the response is never allowed to trigger a second provider call.
    await db.query(`UPDATE print_deliveries SET status = 'accepted', remote_id = $2,
      last_error = NULL, updated_at = now() WHERE id = $1 AND status = 'sending'`, [id, remoteId]);
    console.info("print.direct", JSON.stringify({ id, status: "accepted", remoteId }));
    return "accepted";
  } catch {
    console.error("print.direct", JSON.stringify({ id, status: "unknown", error: "record unavailable" }));
    return "unknown";
  }
}

// Read-only provider queries cannot send paper. No timer, worker or resend loop.
export async function refreshPrints(id?: string, db: PrintDb = pool) {
  await db.query(`UPDATE print_deliveries SET status = 'unknown', updated_at = now(),
    last_error = '打印请求未确认，请核对纸张'
    WHERE status = 'sending' AND sending_started_at < now() - INTERVAL '60 seconds'
      AND snapshot->>'implementation' = $1 AND ($2::uuid IS NULL OR id = $2::uuid)`, [PRINT_IMPLEMENTATION, id || null]);
  const { rows } = await db.query<Delivery>(`SELECT * FROM print_deliveries
    WHERE status = 'accepted' AND remote_id IS NOT NULL AND snapshot->>'implementation' = $1
      AND ($2::uuid IS NULL OR id = $2::uuid) ORDER BY created_at DESC LIMIT 10`, [PRINT_IMPLEMENTATION, id || null]);
  await Promise.all(rows.map(async job => {
    if (await Xpyun.configured(job.printer_sn).completed(job.remote_id!)) {
      await db.query(`UPDATE print_deliveries SET status = 'completed', updated_at = now()
        WHERE id = $1 AND status = 'accepted' AND remote_id = $2`, [job.id, job.remote_id]);
    }
  }));
}
