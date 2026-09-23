import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";
import { writeAuditLogSafe } from "../../../../lib/audit";
export async function DELETE(req: Request) {
  try {
    const auth = await requirePermission(req, "device.manage");
    // Never delete evidence, cancel an in-flight send, or clear the XPYUN queue.
    const { rows } = await pool.query<{ id: string }>(
      `UPDATE print_deliveries SET status = 'cancelled', updated_at = now()
       WHERE status IN ('queued', 'failed', 'expired', 'unknown') RETURNING id`
    );
    await writeAuditLogSafe({ actorUserId: auth.userId, action: "print.queue.clear",
      entityType: "print_queue", entityId: "active", detail: { clearedCount: rows.length }, req });
    return NextResponse.json({ ok: true, cleared: rows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: "暂时无法清理打印任务" }, { status: message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 503 });
  }
}
