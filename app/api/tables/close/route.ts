import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";
import { writeAuditLogSafe } from "../../../../lib/audit";
import { lockSessionName } from "../../../../lib/table-lock";

type SessionRow = {
  id: string;
  table_no: string;
  opened_at: string;
};

export async function POST(req: Request) {
  try {
    const auth = await requirePermission(req, "order.create");
    const body = await req.json().catch(() => null);
    const tableNo = String(body?.tableNo || "").trim();

    if (!tableNo) {
      return NextResponse.json({ error: "缺少桌号" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await lockSessionName(client, tableNo);

      const session = await client.query<SessionRow>(
        `SELECT id, table_no, opened_at
         FROM table_sessions
         WHERE table_no = $1 AND closed_at IS NULL
         LIMIT 1
         FOR UPDATE`,
        [tableNo]
      );

      if (session.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "桌台未开台" }, { status: 404 });
      }

      const s = session.rows[0];

      const unclosed = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM orders
         WHERE table_no = $1
           AND created_at >= $2
           AND status <> 'closed'`,
        [s.table_no, s.opened_at]
      );

      if (Number(unclosed.rows[0]?.count || 0) > 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "当前桌台有未结订单，请先结账" }, { status: 409 });
      }

      await client.query(
        `UPDATE table_sessions
         SET closed_at = now()
         WHERE id = $1`,
        [s.id]
      );

      await client.query("COMMIT");
      await writeAuditLogSafe({
        actorUserId: auth.userId,
        action: "table.close",
        entityType: "table_session",
        entityId: s.id,
        detail: { tableNo: s.table_no },
        req
      });
      return NextResponse.json({ closed: true, tableNo: s.table_no });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "关台失败" }, { status: 500 });
  }
}
