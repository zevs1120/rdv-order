import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";
import { writeAuditLogSafe } from "../../../../lib/audit";
import { lockSessionName } from "../../../../lib/table-lock";

export async function PATCH(req: Request) {
  try {
    const auth = await requirePermission(req, "order.create");
    const body = await req.json().catch(() => null);
    const tableNo = String(body?.tableNo || "").trim();
    const guestCount = body?.guestCount;
    if (!tableNo || !Number.isInteger(guestCount) || guestCount < 1 || guestCount > 20) {
      return NextResponse.json({ error: "桌号或人数无效" }, { status: 400 });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await lockSessionName(client, tableNo);
      const session = await client.query<{ id: string; guest_count: number; opened_at: string }>(
        `SELECT id, guest_count, opened_at FROM table_sessions
         WHERE table_no = $1 AND closed_at IS NULL LIMIT 1 FOR UPDATE`, [tableNo]
      );
      const row = session.rows[0];
      if (!row || (body.expectedSessionId !== undefined && body.expectedSessionId !== row.id)) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "开台记录已变更，请刷新后重试" }, { status: 409 });
      }
      await client.query("UPDATE table_sessions SET guest_count = $1 WHERE id = $2", [guestCount, row.id]);
      await client.query("COMMIT");
      await writeAuditLogSafe({
        actorUserId: auth.userId, action: "table.update_guests", entityType: "table_session", entityId: row.id,
        detail: { tableNo, previousGuestCount: row.guest_count, guestCount }, req
      });
      return NextResponse.json({ tableNo, guestCount, sessionId: row.id, openedAt: row.opened_at });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "修改人数失败" }, { status: 500 });
  }
}
