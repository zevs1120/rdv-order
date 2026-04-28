import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";
import { writeAuditLogSafe } from "../../../../lib/audit";

type ClearedJobRow = {
  id: string;
};

export async function DELETE(req: Request) {
  try {
    const auth = await requirePermission(req, "device.manage");
    const { rows } = await pool.query<ClearedJobRow>(
      `DELETE FROM print_jobs
       WHERE status IN ('pending', 'printing', 'failed')
       RETURNING id`
    );

    await writeAuditLogSafe({
      actorUserId: auth.userId,
      action: "print.queue.clear",
      entityType: "print_queue",
      entityId: "active",
      detail: {
        clearedCount: rows.length,
        clearedStatuses: ["pending", "printing", "failed"]
      },
      req
    });

    return NextResponse.json({ ok: true, cleared: rows.length });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "清空打印队列失败" }, { status: 500 });
  }
}
