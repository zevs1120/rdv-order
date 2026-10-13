import { NextResponse } from "next/server";
import { requireOrderCreate } from "../../../../lib/permissions";
import { pool } from "../../../../lib/db";
import { refreshPrints } from "../../../../lib/printing/records";
import { findReceiptDelivery } from "../../../../lib/printing/service";

export async function GET(req: Request) {
  try {
    const auth = await requireOrderCreate(req);
    const requestId = new URL(req.url).searchParams.get("requestId") || "";
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(requestId)) return NextResponse.json({ error: "打印编号无效" }, { status: 400 });
    let job = await findReceiptDelivery(pool, auth.userId, requestId);
    if (job && ["sending", "accepted"].includes(job.status)) {
      await refreshPrints(job.id);
      job = await findReceiptDelivery(pool, auth.userId, requestId);
    }
    return NextResponse.json(job ? { found: true, status: job.status, jobId: job.id } : { found: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: "暂时无法查询打印" }, { status: message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 503 });
  }
}
