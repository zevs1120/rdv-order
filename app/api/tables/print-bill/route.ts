import { NextResponse } from "next/server";
import { dispatchTableBillPrint, PrintDispatchError } from "../../../../lib/print";
import { requirePermission } from "../../../../lib/permissions";
import { writeAuditLogSafe } from "../../../../lib/audit";

type Body = {
  tableNo?: unknown;
};

export async function POST(req: Request) {
  try {
    const auth = await requirePermission(req, "order.create");
    const body = (await req.json().catch(() => null)) as Body | null;
    const tableNo = String(body?.tableNo || "").trim();
    if (!tableNo) {
      return NextResponse.json({ error: "缺少桌号" }, { status: 400 });
    }

    const result = await dispatchTableBillPrint(tableNo);
    await writeAuditLogSafe({
      actorUserId: auth.userId,
      action: "table.print_receipt",
      entityType: "table",
      entityId: tableNo,
      detail: { provider: result.provider, slot: result.slot, remoteJobId: result.remoteJobId || null },
      req
    });

    return NextResponse.json({
      ok: true,
      provider: result.provider,
      slot: result.slot,
      remoteJobId: result.remoteJobId || null
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    if (err instanceof PrintDispatchError) {
      const status = err.retryable ? 503 : 400;
      return NextResponse.json({ error: err.message || "账单打印失败" }, { status });
    }
    return NextResponse.json({ error: "账单打印失败" }, { status: 500 });
  }
}
