import { after, NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";
import { prepareTestDelivery } from "../../../../lib/printing/service";
import { startPrintDelivery } from "../../../../lib/printing/start";
import { drainDeliveryQueue } from "../../../../lib/printing/queue";
import { XpyunTransport } from "../../../../lib/printing/transport";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    await requirePermission(req, "device.manage");
    const tx = await pool.connect();
    let job;
    try {
      await tx.query("BEGIN");
      job = await prepareTestDelivery(tx);
      await startPrintDelivery(job.id);
      await tx.query("COMMIT");
    } catch (error) { await tx.query("ROLLBACK").catch(() => {}); throw error; }
    finally { tx.release(); }
    const jobId = job.id;
    try { after(async () => { try { await drainDeliveryQueue({ jobId, transportForSn: sn => XpyunTransport.fromEnvironment(sn) }); } catch {} }); }
    catch { /* Durable run is already saved. */ }
    return NextResponse.json({ ok: true, queued: true, jobId, provider: "xpyun", slot: "primary" }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: "打印暂时不可用，请重试" }, { status: message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 503 });
  }
}
