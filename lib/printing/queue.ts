import { createHash } from "node:crypto";
import type { QueryResultRow } from "pg";
import { pool } from "../db";

// This module never reads or modifies the historical print_jobs table.
export type DeliveryKind = "order" | "receipt" | "self_test" | "reprint";
export type DeliveryStatus = "queued" | "sending" | "accepted" | "unknown" | "failed" | "expired" | "completed" | "cancelled";
export type QueueDb = {
  query<T extends QueryResultRow = any>(sql: string, params?: any[]): Promise<{ rows: T[] }>;
};

export type Delivery = {
  id: string;
  kind: DeliveryKind;
  intent_key: string;
  order_id: string | null;
  printer_sn: string;
  content: string;
  snapshot: unknown;
  content_sha256: string;
  provider_key: string;
  status: DeliveryStatus;
  attempt_count: number;
  unknown_retry_count: number;
  remote_id: string | null;
  first_attempt_at: Date | null;
  created_at: Date;
  sending_started_at: Date | null;
  lease_token: string | null;
};

export type DeliveryInput = {
  kind: DeliveryKind;
  intentKey: string;
  orderId?: string;
  printerSn: string;
  content: string;
  snapshot: unknown;
};

export type XpyunDeliveryTransport = {
  send(content: string, key: string, expiresIn: number): Promise<
    { kind: "accepted"; remoteId: string } | { kind: "duplicate" }
  >;
  orderState(remoteId: string): Promise<"completed" | "pending" | "unknown">;
};

export type XpyunDeliveryError = Error & { kind?: "offline" | "rejected" | "unknown"; code?: number };

const CLOUD_BUFFER_SECONDS = 120;
const DEDUPE_SECONDS = 300;

function assertInput(input: DeliveryInput) {
  if (!input.intentKey.trim() || !input.printerSn.trim() || !input.content.trim()) {
    throw new Error("Print delivery requires intent, printer and content");
  }
  if (input.kind === "order" && !input.orderId) {
    throw new Error("Order delivery requires an order ID");
  }
  if ((input.kind === "receipt" || input.kind === "self_test") && input.orderId) {
    throw new Error("Receipt and self-test delivery cannot reference an order");
  }
}

// Call with the same transaction/client that saves the business intent.
export async function enqueueDelivery(tx: QueueDb, input: DeliveryInput): Promise<Delivery> {
  assertInput(input);
  const hash = createHash("sha256").update(input.content).digest("hex");
  const providerKey = createHash("sha256").update(`${input.kind}:${input.intentKey}`).digest("hex").slice(0, 48);
  const { rows } = await tx.query<Delivery>(
    `INSERT INTO print_deliveries
       (kind, intent_key, order_id, printer_sn, content, snapshot, content_sha256, provider_key)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
     ON CONFLICT (kind, intent_key) DO UPDATE SET intent_key = EXCLUDED.intent_key
       WHERE print_deliveries.order_id IS NOT DISTINCT FROM EXCLUDED.order_id
         AND print_deliveries.printer_sn = EXCLUDED.printer_sn
         AND print_deliveries.content_sha256 = EXCLUDED.content_sha256
         AND print_deliveries.snapshot = EXCLUDED.snapshot
     RETURNING *`,
    [input.kind, input.intentKey, input.orderId || null, input.printerSn, input.content,
      JSON.stringify(input.snapshot), hash, providerKey]
  );
  if (!rows[0]) throw new Error("Print intent key was reused with different content");
  return rows[0];
}

export async function expireUnfinishedDeliveries(db: QueueDb = pool): Promise<void> {
  // A killed invocation may already have sent paper. Only one persisted same-key
  // resend is allowed while XPYUN's dedupe and cloud-buffer windows overlap.
  await db.query(
    `UPDATE print_deliveries SET
       status = CASE WHEN created_at > now() - INTERVAL '120 seconds'
         AND unknown_retry_count = 0 AND attempt_count < 2 THEN 'queued' ELSE 'unknown' END,
       unknown_retry_count = CASE WHEN created_at > now() - INTERVAL '120 seconds'
         AND unknown_retry_count = 0 AND attempt_count < 2 THEN 1 ELSE unknown_retry_count END,
       next_attempt_at = now(), lease_token = NULL, sending_started_at = NULL,
       last_error = '发送进程中断，结果不明；仅允许原键受控恢复', updated_at = now()
     WHERE status = 'sending' AND sending_started_at < now() - INTERVAL '60 seconds'`
  );
  await db.query(
    `UPDATE print_deliveries SET
       status = CASE WHEN unknown_retry_count > 0 THEN 'unknown' ELSE 'expired' END,
       updated_at = now(),
       last_error = COALESCE(last_error, '云端离线缓冲窗口已过，请人工核对')
     WHERE status = 'queued'
       AND created_at < now() - INTERVAL '120 seconds'`
  );
}

export async function claimDelivery(db: QueueDb = pool, jobId?: string): Promise<Delivery | null> {
  try {
    const { rows } = await db.query<Delivery>(
      `WITH candidate AS (
         SELECT d.id FROM print_deliveries d
         WHERE d.status = 'queued' AND d.next_attempt_at <= now()
           AND d.remote_id IS NULL
           AND d.created_at > now() - INTERVAL '120 seconds'
           AND ($1::uuid IS NULL OR d.id = $1::uuid)
           AND NOT EXISTS (SELECT 1 FROM print_deliveries active
             WHERE active.printer_sn = d.printer_sn AND active.status = 'sending')
         ORDER BY d.created_at, d.id LIMIT 1 FOR UPDATE SKIP LOCKED
       )
       UPDATE print_deliveries d SET status = 'sending',
         attempt_count = d.attempt_count + 1,
         first_attempt_at = COALESCE(d.first_attempt_at, now()),
         sending_started_at = now(), lease_token = gen_random_uuid(), updated_at = now()
       FROM candidate WHERE d.id = candidate.id RETURNING d.*`, [jobId || null]
    );
    return rows[0] || null;
  } catch (error) {
    // The partial unique index is the cross-invocation backstop for one sender/SN.
    if ((error as { code?: string }).code === "23505") return null;
    throw error;
  }
}

async function finishSending(
  db: QueueDb, job: Delivery, status: DeliveryStatus, fields: { remoteId?: string | null; error?: string | null; delaySeconds?: number } = {}
): Promise<boolean> {
  const { rows } = await db.query<{ id: string }>(
    `UPDATE print_deliveries SET status = $3, remote_id = COALESCE($4, remote_id),
       last_error = $5, next_attempt_at = now() + ($6::int * INTERVAL '1 second'),
       lease_token = NULL, sending_started_at = NULL, updated_at = now()
     WHERE id = $1 AND lease_token = $2::uuid AND status = 'sending'
     RETURNING id`,
    [job.id, job.lease_token, status, fields.remoteId || null, fields.error?.slice(0, 500) || null,
      fields.delaySeconds || 0]
  );
  return Boolean(rows[0]);
}

export async function recordAccepted(job: Delivery, remoteId: string, db: QueueDb = pool): Promise<boolean> {
  if (!remoteId.trim()) throw new Error("XPYUN acceptance requires a remote ID");
  return finishSending(db, job, "accepted", { remoteId });
}

export async function recordUnknown(job: Delivery, reason: string, db: QueueDb = pool): Promise<boolean> {
  return finishSending(db, job, "unknown", { error: reason });
}

export async function recordRejected(job: Delivery, reason: string, db: QueueDb = pool): Promise<boolean> {
  return finishSending(db, job, job.unknown_retry_count > 0 && !job.remote_id ? "unknown" : "failed", { error: reason });
}

export async function recordOffline(job: Delivery, reason: string, db: QueueDb = pool): Promise<boolean> {
  if (job.unknown_retry_count > 0 && !job.remote_id) return recordUnknown(job, reason, db);
  const { rows } = await db.query<{ id: string }>(
    `UPDATE print_deliveries SET
       status = CASE WHEN created_at > now() - INTERVAL '120 seconds' THEN 'queued' ELSE 'expired' END,
       next_attempt_at = now() + INTERVAL '5 seconds', last_error = $3,
       lease_token = NULL, sending_started_at = NULL, updated_at = now()
     WHERE id = $1 AND lease_token = $2::uuid AND status = 'sending' RETURNING id`,
    [job.id, job.lease_token, reason.slice(0, 500)]
  );
  return Boolean(rows[0]);
}

// Persist the one permitted same-key resend before another sending lease exists.
async function scheduleSameKeyRetry(id: string, from: "unknown" | "failed", db: QueueDb): Promise<boolean> {
  const { rows } = await db.query<{ id: string }>(
    `UPDATE print_deliveries SET status = 'queued',
       unknown_retry_count = CASE WHEN $2 = 'unknown' THEN 1 ELSE unknown_retry_count END,
       next_attempt_at = now(), updated_at = now()
     WHERE id = $1 AND status = $2 AND remote_id IS NULL
       AND unknown_retry_count = 0
       AND first_attempt_at > now() - ($3::int * INTERVAL '1 second')
       AND attempt_count < 2
       AND created_at > now() - INTERVAL '120 seconds'
     RETURNING id`, [id, from, DEDUPE_SECONDS]
  );
  return Boolean(rows[0]);
}

export async function scheduleUnknownSameKeyRetry(id: string, db: QueueDb = pool): Promise<boolean> {
  return scheduleSameKeyRetry(id, "unknown", db);
}

export async function recordCloudCompletion(id: string, remoteId: string, db: QueueDb = pool): Promise<boolean> {
  const { rows } = await db.query<{ id: string }>(
    `UPDATE print_deliveries SET status = 'completed', updated_at = now()
     WHERE id = $1 AND remote_id = $2 AND status = 'accepted' RETURNING id`, [id, remoteId]
  );
  return Boolean(rows[0]);
}

export async function drainDeliveryQueue(options: {
  transportForSn: (sn: string) => XpyunDeliveryTransport;
  db?: QueueDb;
  jobId?: string;
  maxJobs?: number;
  maxMs?: number;
}): Promise<{ picked: number; accepted: number; unknown: number; failed: number }> {
  const db = options.db || pool;
  const maxJobs = Math.max(1, Math.min(6, options.maxJobs || 1));
  const deadline = Date.now() + Math.max(1000, Math.min(60_000, options.maxMs || 45_000));
  const result = { picked: 0, accepted: 0, unknown: 0, failed: 0 };
  await expireUnfinishedDeliveries(db);

  while (result.picked < maxJobs && Date.now() < deadline) {
    const job = await claimDelivery(db, options.jobId);
    if (!job) break;
    result.picked++;
    const first = new Date(job.created_at).getTime();
    const remainingMs = first + CLOUD_BUFFER_SECONDS * 1000 - Date.now();
    if (remainingMs <= 0) {
      await finishSending(db, job, job.unknown_retry_count > 0 && !job.remote_id ? "unknown" : "expired",
        { error: "打印任务已过期，未发送；此前结果仍未确认" });
      result.failed++;
      continue;
    }
    const expiresIn = Math.min(CLOUD_BUFFER_SECONDS, Math.ceil(remainingMs / 1000));
    let reply: Awaited<ReturnType<XpyunDeliveryTransport["send"]>>;
    try {
      const transport = options.transportForSn(job.printer_sn);
      reply = await transport.send(job.content, job.provider_key, expiresIn);
    } catch (cause) {
      const error = cause as XpyunDeliveryError;
      const message = error.message || "打印请求失败";
      if (error.kind === "offline") {
        await recordOffline(job, message, db);
        result.failed++;
      } else if (error.kind === "rejected") {
        const saved = await recordRejected(job, message, db);
        if (saved && error.code === 1004) await scheduleSameKeyRetry(job.id, "failed", db);
        result.failed++;
      } else {
        const saved = await recordUnknown(job, message, db);
        if (saved && error.kind === "unknown") await scheduleUnknownSameKeyRetry(job.id, db);
        result.unknown++;
      }
      continue;
    }
    // Provider acceptance and the following database write are separate fault
    // domains. A failed write must never enter the provider-error retry branch.
    if (reply.kind === "duplicate") {
      await recordUnknown(job, "XPYUN 已识别同键请求，但未返回可查询的订单号", db);
      result.unknown++;
    } else {
      let saved: boolean;
      try { saved = await recordAccepted(job, reply.remoteId, db); }
      catch { saved = await recordAccepted(job, reply.remoteId, db); }
      if (!saved) throw new Error("Cloud accepted print but its database state was not saved");
      result.accepted++;
    }
  }

  // Query existing remote orders without ever resubmitting their content.
  if (Date.now() < deadline) {
    const { rows } = await db.query<Pick<Delivery, "id" | "remote_id" | "printer_sn">>(
      `SELECT id, remote_id, printer_sn FROM print_deliveries
       WHERE status = 'accepted' AND remote_id IS NOT NULL
         AND ($1::uuid IS NULL OR id = $1::uuid)
       ORDER BY updated_at ASC LIMIT 3`, [options.jobId || null]
    );
    for (const job of rows) {
      if (Date.now() >= deadline) break;
      let cloudState: "completed" | "pending" | "unknown" = "unknown";
      try { cloudState = await options.transportForSn(job.printer_sn).orderState(job.remote_id!); }
      catch { /* A failed status read is never permission to print again. */ }
      if (cloudState === "completed") await recordCloudCompletion(job.id, job.remote_id!, db);
    }
  }
  await db.query(
    `UPDATE print_deliveries SET status = 'expired', updated_at = now(),
       last_error = COALESCE(last_error, '云端缓冲期限已过，未证实出纸')
     WHERE status = 'accepted' AND created_at < now() - INTERVAL '120 seconds'
       AND ($1::uuid IS NULL OR id = $1::uuid)`, [options.jobId || null]
  );
  return result;
}
