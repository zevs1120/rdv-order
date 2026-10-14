import { localTicket } from "../../../../lib/printing/lan";
import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";
import { prepareTestDelivery } from "../../../../lib/printing/service";
import { sendPrint } from "../../../../lib/printing/records";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    const auth = await requirePermission(req, "device.manage");
    const body = await req.json().catch(() => null);
    const tx = await pool.connect();
    let job;
    try {
      await tx.query("BEGIN");
      job = await prepareTestDelivery(tx, undefined, body?.printTransport === "lan-v1" ? auth.userId : undefined);
      await tx.query("COMMIT");
    } catch (error) { await tx.query("ROLLBACK").catch(() => {}); throw error; }
    finally { tx.release(); }
    const jobId = job.id;
    const localPrint = localTicket(job);
    const status = localPrint ? job.status : await sendPrint(jobId);
    return NextResponse.json({ ok: true, queued: true, status, jobId, localPrint, provider: "xpyun", slot: "primary" }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: "打印暂时不可用，请重试" }, { status: message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 503 });
  }
}
