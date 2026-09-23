import { NextResponse } from "next/server";
import { requireOrderCreate } from "../../../../lib/permissions";
import { pool } from "../../../../lib/db";
import { findReceiptDelivery } from "../../../../lib/printing/service";

export async function GET(req: Request) {
  try {
    const auth = await requireOrderCreate(req);
    const requestId = new URL(req.url).searchParams.get("requestId") || "";
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(requestId)) return NextResponse.json({ error: "打印编号无效" }, { status: 400 });
    const job = await findReceiptDelivery(pool, auth.userId, requestId);
    return NextResponse.json(job ? { found: true, status: job.status, jobId: job.id } : { found: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: "暂时无法查询打印" }, { status: message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 503 });
  }
}
