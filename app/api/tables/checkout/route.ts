import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requireAuth } from "../../../../lib/api-auth";
import { lockSessionName } from "../../../../lib/table-lock";

type SessionRow = {
  id: string;
  table_no: string;
  opened_at: string;
};

export async function POST(req: Request) {
  try {
    await requireAuth(req, ["waiter", "manager"]);
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

      await client.query(
        `UPDATE orders
         SET status = 'paid'
         WHERE table_no = $1
           AND created_at >= $2
           AND status = 'submitted'`,
        [s.table_no, s.opened_at]
      );

      const summary = await client.query<{ order_count: number; total_amount: number }>(
        `SELECT COUNT(DISTINCT o.id)::int AS order_count,
                COALESCE(SUM(oi.qty * mi.price), 0)::int AS total_amount
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         WHERE o.table_no = $1
           AND o.created_at >= $2
           AND o.status = 'paid'`,
        [s.table_no, s.opened_at]
      );

      await client.query(
        `UPDATE table_sessions
         SET closed_at = now()
         WHERE id = $1`,
        [s.id]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        tableNo: s.table_no,
        orderCount: summary.rows[0]?.order_count || 0,
        totalAmount: summary.rows[0]?.total_amount || 0,
        closed: true
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "结账失败" }, { status: 500 });
  }
}
