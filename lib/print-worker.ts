import { writePrintAuditLogSafe } from "./audit";
import { pool } from "./db";
import { PrintDispatchError, dispatchPrintJob } from "./print";

type PrintJobRow = {
  id: string;
  order_id: string;
  retry_count: number;
  status: "printing" | "failed";
};

export type PrintWorkerResult = {
  picked: number;
  printed: number;
  failed: number;
};

function getMaxRetry() {
  return Math.max(1, Number(process.env.PRINT_MAX_RETRY || 8) || 8);
}

function getStalePrintingSeconds() {
  // A worker may live for 120 seconds. Never reclaim it while it can still send.
  return Math.max(120, Number(process.env.PRINT_STALE_PRINTING_SECONDS || 120) || 120);
}

function getRetryDelaySeconds() {
  return Math.max(3, Number(process.env.PRINT_RETRY_DELAY_SECONDS || 12) || 12);
}

async function pickJobs(
  limit: number,
  maxRetry: number,
  staleSeconds: number,
  retryDelaySeconds: number,
  visitedIds: string[],
  orderId?: string
): Promise<PrintJobRow[]> {
  // Claim one task atomically. Do not lease a batch while its earlier tasks are printing.
  // An abandoned "printing" task may already have reached the cloud: expose the
  // existing unknown-result failure, never resend it outside cloud deduplication.
  const { rows } = await pool.query<PrintJobRow>(
    `WITH picked AS (
       SELECT id, status
       FROM print_jobs
       WHERE (
         status = 'pending'
         OR (status = 'failed' AND updated_at < (now() - ($4::int * INTERVAL '1 second')))
         OR (status = 'printing' AND updated_at < (now() - ($3::int * INTERVAL '1 second')))
       )
         AND retry_count < $2
         AND NOT (id = ANY($5::uuid[]))
         ${orderId === undefined ? "" : "AND order_id = $6::uuid"}
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE print_jobs pj
     SET status = CASE WHEN picked.status = 'printing' THEN 'failed' ELSE 'printing' END,
         retry_count = CASE WHEN picked.status = 'printing' THEN $2 ELSE pj.retry_count END,
         last_error = CASE WHEN picked.status = 'printing'
           THEN '打印结果未确认，请先核对是否出纸，勿重复打印' ELSE pj.last_error END,
         updated_at = now()
     FROM picked
     WHERE pj.id = picked.id
     RETURNING pj.id, pj.order_id, pj.retry_count, pj.status`,
    orderId === undefined
      ? [limit, maxRetry, staleSeconds, retryDelaySeconds, visitedIds]
      : [limit, maxRetry, staleSeconds, retryDelaySeconds, visitedIds, orderId]
  );
  return rows;
}

async function markPrinted(id: string) {
  await pool.query(
    `UPDATE print_jobs
     SET status = 'printed',
         updated_at = now(),
         last_error = NULL
     WHERE id = $1`,
    [id]
  );
}

async function markFailed(id: string, message: string, retryable: boolean, maxRetry: number) {
  await pool.query(
    `UPDATE print_jobs
     SET status = 'failed',
         retry_count = CASE
           WHEN $2 THEN retry_count + 1
           ELSE GREATEST(retry_count + 1, $3)
         END,
         last_error = $4,
         updated_at = now()
     WHERE id = $1`,
    [id, retryable, maxRetry, message.slice(0, 500)]
  );
}

export async function runPrintWorker(limit = 6): Promise<PrintWorkerResult> {
  return processJobs(limit);
}

// Automatic order wake must not consume an older queued order instead of the submitted one.
export async function runOrderPrintWorker(orderId: string): Promise<PrintWorkerResult> {
  if (!orderId) throw new Error("Order ID is required");
  return processJobs(1, orderId);
}

async function processJobs(limit: number, orderId?: string): Promise<PrintWorkerResult> {
  const maxRetry = getMaxRetry();
  const staleSeconds = getStalePrintingSeconds();
  const retryDelaySeconds = getRetryDelaySeconds();
  const startedAt = Date.now();
  let picked = 0;
  let printed = 0;
  let failed = 0;
  const visitedIds: string[] = [];

  // Leave time for the last task and its state write inside the route's 120s lifetime.
  while (picked < limit && (picked === 0 || Date.now() - startedAt < 60_000)) {
    const [job] = await pickJobs(1, maxRetry, staleSeconds, retryDelaySeconds, visitedIds, orderId);
    if (!job) break;
    picked += 1;
    visitedIds.push(job.id);
    if (job.status === "failed") {
      failed += 1;
      continue;
    }

    let result: Awaited<ReturnType<typeof dispatchPrintJob>>;
    try {
      result = await dispatchPrintJob(job.order_id);
    } catch (err: unknown) {
      const retryable = err instanceof PrintDispatchError ? err.retryable && err.outcome !== "unknown" : true;
      const message = err instanceof Error ? err.message : "打印失败";
      await markFailed(job.id, message, retryable, maxRetry);
      failed += 1;
      continue;
    }

    // Cloud acceptance is irreversible. Retry only its idempotent database write;
    // a database failure must never turn this into another provider submission.
    try {
      await markPrinted(job.id);
    } catch {
      try { await markPrinted(job.id); }
      catch { console.error("[order-print] cloud accepted; state save failed; do not resend"); }
    }
    await writePrintAuditLogSafe({ action: "order.print_accepted", entityType: "order", entityId: job.order_id,
      detail: { provider: result.provider, remoteJobId: result.remoteJobId || null } });
    printed += 1;
  }

  return { picked, printed, failed };
}
