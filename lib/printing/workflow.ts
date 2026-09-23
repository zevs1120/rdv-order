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
  await drainDeliveryQueue({ jobId: id, transportForSn: sn => XpyunTransport.fromEnvironment(sn), maxJobs: 2, maxMs: 25_000 });
  const { rows: [updated] } = await pool.query<{ status: string }>(`SELECT status FROM print_deliveries WHERE id = $1`, [id]);
  return updated?.status || "cancelled";
}

export async function printDelivery(id: string) {
  "use workflow";
  for (let pass = 0; pass < 36; pass++) {
    let status: string;
    try { status = await advanceDelivery(id); }
    catch { await sleep("5s"); continue; }
    if (["completed", "failed", "expired", "cancelled", "unknown"].includes(status)) return;
    if (status === "waiting_commit" && pass >= 5) return;
    await sleep("5s");
  }
}
