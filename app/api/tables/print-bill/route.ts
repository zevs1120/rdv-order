import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { pool } from "../../../../lib/db";
import { requireOrderCreate } from "../../../../lib/permissions";
import { prepareReceiptDelivery } from "../../../../lib/printing/service";
import { startPrintDelivery } from "../../../../lib/printing/start";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const auth = await requireOrderCreate(req);
    const body = await req.json().catch(() => null) as { tableNo?: unknown; sessionId?: unknown } | null;
    const tableNo = String(body?.tableNo || "").trim();
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : undefined;
    const requestId = req.headers.get("x-idempotency-key") || randomUUID();
    if (!tableNo || !/^[a-zA-Z0-9_-]{8,80}$/.test(requestId)) return NextResponse.json({ error: "打印参数无效" }, { status: 400 });
    const tx = await pool.connect();
    let job;
    try {
      await tx.query("BEGIN");
      job = await prepareReceiptDelivery(tx, auth.userId, requestId, tableNo, sessionId);
      if (job.status === "queued") await startPrintDelivery(job.id);
      await tx.query("COMMIT");
    } catch (error) {
      await tx.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { tx.release(); }
    const jobId = job.id;
    return NextResponse.json({ ok: true, queued: true, jobId, requestId, status: job.status }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "打印暂时不可用，请重试";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: /桌台|账单|不匹配/.test(message) ? message : "打印暂时不可用，请重试" }, { status: 503 });
  }
}
