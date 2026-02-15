import { pool } from "./db";
import { PrintDispatchError, dispatchPrintJob } from "./print";

type PrintJobRow = {
  id: string;
  order_id: string;
  retry_count: number;
};

export type PrintWorkerResult = {
  picked: number;
  printed: number;
  failed: number;
};

async function pickJobs(limit: number): Promise<PrintJobRow[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<PrintJobRow>(
      `WITH picked AS (
         SELECT id
         FROM print_jobs
         WHERE status IN ('pending', 'failed')
           AND retry_count < 8
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE print_jobs pj
       SET status = 'printing',
           updated_at = now()
       FROM picked
       WHERE pj.id = picked.id
       RETURNING pj.id, pj.order_id, pj.retry_count`,
      [limit]
    );
    await client.query("COMMIT");
    return rows;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
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

async function markFailed(id: string, message: string, bumpRetry: boolean) {
  await pool.query(
    `UPDATE print_jobs
     SET status = 'failed',
         retry_count = retry_count + CASE WHEN $2 THEN 1 ELSE 0 END,
         last_error = $3,
         updated_at = now()
     WHERE id = $1`,
    [id, bumpRetry, message.slice(0, 500)]
  );
}

export async function runPrintWorker(limit = 6): Promise<PrintWorkerResult> {
  const jobs = await pickJobs(limit);
  if (jobs.length === 0) {
    return { picked: 0, printed: 0, failed: 0 };
  }

  let printed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      await dispatchPrintJob(job.order_id);
      await markPrinted(job.id);
      printed += 1;
    } catch (err: any) {
      const retryable = err instanceof PrintDispatchError ? err.retryable : true;
      const message = err instanceof Error ? err.message : "打印失败";
      await markFailed(job.id, message, retryable);
      failed += 1;
    }
  }

  return { picked: jobs.length, printed, failed };
}

