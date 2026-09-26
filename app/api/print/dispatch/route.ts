import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";
import { enqueueDelivery, type Delivery } from "../../../../lib/printing/queue";
import { startPrintDelivery } from "../../../../lib/printing/start";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    // Retry is an explicit manager action. There is no global old-queue worker.
    await requirePermission(req, "device.manage");
    const tx = await pool.connect();
    let retryId: string | undefined;
    try {
      await tx.query("BEGIN");
      const { rows: [old] } = await tx.query<Delivery>(
        `SELECT d.* FROM print_deliveries d WHERE d.status IN ('failed', 'expired') AND d.remote_id IS NULL
         AND EXISTS (SELECT 1 FROM table_sessions s WHERE s.closed_at IS NULL
           AND s.table_no = d.snapshot->>'tableNo' AND s.opened_at <= d.created_at)
         ORDER BY d.created_at LIMIT 1 FOR UPDATE SKIP LOCKED`
      );
      if (old) {
        const job = await enqueueDelivery(tx, { kind: "reprint", intentKey: randomUUID(),
          orderId: old.order_id || undefined, printerSn: old.printer_sn, content: old.content,
          snapshot: { ...(old.snapshot as object), reprintOf: old.id } });
        await startPrintDelivery(job.id);
        await tx.query(`UPDATE print_deliveries SET status = 'cancelled', updated_at = now() WHERE id = $1`, [old.id]);
        retryId = job.id;
      }
      await tx.query("COMMIT");
    } catch (error) { await tx.query("ROLLBACK").catch(() => {}); throw error; }
    finally { tx.release(); }
    return NextResponse.json({ picked: retryId ? 1 : 0, accepted: 0, printed: 0, failed: 0, queued: Boolean(retryId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: "暂时无法重试打印" }, { status: message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 503 });
  }
}
