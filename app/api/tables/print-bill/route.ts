import { after, NextResponse } from "next/server";
import { dispatchTableBillPrint, PrintDispatchError } from "../../../../lib/print";
import { requireOrderCreate } from "../../../../lib/permissions";
import { writePrintAuditLogSafe } from "../../../../lib/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  waitForResult?: unknown;
  tableNo?: unknown;
};

export async function POST(req: Request) {
  try {
    const auth = await requireOrderCreate(req);
    const body = (await req.json().catch(() => null)) as Body | null;
    const tableNo = String(body?.tableNo || "").trim();
    if (!tableNo) {
      return NextResponse.json({ error: "缺少桌号" }, { status: 400 });
    }

    const print = async () => {
      try {
        const result = await dispatchTableBillPrint(tableNo);
        await writePrintAuditLogSafe({
          actorUserId: auth.userId, action: "table.print_receipt", entityType: "table", entityId: tableNo,
          detail: { provider: result.provider, slot: result.slot, remoteJobId: result.remoteJobId || null }, req
        });
        return result;
      } catch (err) {
        await writePrintAuditLogSafe({
          actorUserId: auth.userId, action: "table.print_receipt_failed", entityType: "table", entityId: tableNo,
          detail: { error: err instanceof PrintDispatchError ? err.message : "账单打印失败" }, req
        });
        throw err;
      }
    };
    // Updated clients wait for cloud acceptance; preserve short-request clients
    // during the mandatory APK rollout instead of making them time out at 1.8s.
    if (body?.waitForResult === true) {
      const result = await print();
      return NextResponse.json({ ok: true, accepted: true, remoteJobId: result.remoteJobId || null });
    }
    after(async () => {
      try { await print(); } catch { console.error("[print-bill] failed; inspect receipt audit and device error"); }
    });

    return NextResponse.json({
      ok: true,
      queued: true
    }, { status: 202 });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    if (err instanceof PrintDispatchError) return NextResponse.json({ error: err.message }, { status: err.outcome === "unknown" ? 504 : 503 });
    return NextResponse.json({ error: "账单打印失败" }, { status: 500 });
  }
}
