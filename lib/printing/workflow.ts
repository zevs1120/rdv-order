import { sleep } from "workflow";
import { pool } from "../db";
import { drainDeliveryQueue } from "./queue";
import { XpyunTransport } from "./transport";

async function advanceDelivery(id: string) {
  "use step";
  const { rows: [job] } = await pool.query<{ status: string }>(`SELECT status FROM print_deliveries WHERE id = $1`, [id]);
  // The workflow is durably started before the enqueue transaction commits.
  // Missing rows are harmless, including a transaction that was rolled back.
  if (!job) return "waiting_commit";
  await drainDeliveryQueue({ jobId: id, transportForSn: sn => XpyunTransport.fromEnvironment(sn), maxJobs: 1, maxMs: 25_000 });
  const { rows: [updated] } = await pool.query<{ status: string }>(`SELECT status FROM print_deliveries WHERE id = $1`, [id]);
  return updated?.status || "cancelled";
}

async function endUnconfirmedTracking(id: string) {
  "use step";
  // A bounded workflow may end during provider/database trouble. The retained
  // remote ID makes that outcome explicit and prevents another send.
  await pool.query(
    `UPDATE print_deliveries SET status = 'unknown', updated_at = now(),
       last_error = COALESCE(last_error, '云端订单跟踪已结束；保留远端编号，不自动重发')
     WHERE id = $1 AND status = 'accepted' AND remote_id IS NOT NULL`, [id]
  );
}

export async function printDelivery(id: string) {
  "use workflow";
  for (let pass = 0; pass < 72; pass++) {
    let status: string;
    try { status = await advanceDelivery(id); }
    catch {
      if (pass < 71) await sleep("10s");
      continue;
    }
    if (["completed", "failed", "expired", "cancelled", "unknown"].includes(status)) return;
    if (status === "waiting_commit" && pass >= 5) return;
    if (pass < 71) await sleep(status === "accepted" ? "15s" : "5s");
  }
  await endUnconfirmedTracking(id);
}
