import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requireAuth } from "../../../../lib/api-auth";

type SessionRow = {
  id: string;
  table_no: string;
  guest_count: number;
  opened_at: string;
};

export async function GET(req: Request) {
  try {
    await requireAuth(req, ["waiter", "manager"]);
    const url = new URL(req.url);
    const tableNo = (url.searchParams.get("tableNo") || "").trim();

    if (!tableNo) {
      return NextResponse.json({ error: "缺少桌号" }, { status: 400 });
    }

    const session = await pool.query<SessionRow>(
      `SELECT id, table_no, guest_count, opened_at
       FROM table_sessions
       WHERE table_no = $1 AND closed_at IS NULL
       LIMIT 1`,
      [tableNo]
    );

    if (session.rows.length === 0) {
      return NextResponse.json({ error: "桌台未开台" }, { status: 404 });
    }

    const s = session.rows[0];

    const items = await pool.query<{
      menu_item_id: string;
      name: string;
      qty: number;
      amount: number;
    }>(
      `SELECT mi.id AS menu_item_id,
              mi.name,
              SUM(oi.qty)::int AS qty,
              SUM(oi.qty * mi.price)::int AS amount
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE o.table_no = $1
         AND o.created_at >= $2
         AND o.status IN ('submitted', 'paid')
       GROUP BY mi.id, mi.name
       ORDER BY mi.name ASC`,
      [s.table_no, s.opened_at]
    );

    const summary = await pool.query<{ total_qty: number; total_amount: number }>(
      `SELECT COALESCE(SUM(oi.qty), 0)::int AS total_qty,
              COALESCE(SUM(oi.qty * mi.price), 0)::int AS total_amount
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE o.table_no = $1
         AND o.created_at >= $2
         AND o.status IN ('submitted', 'paid')`,
      [s.table_no, s.opened_at]
    );

    return NextResponse.json({
      tableNo: s.table_no,
      guestCount: s.guest_count,
      items: items.rows,
      totalQty: summary.rows[0]?.total_qty || 0,
      totalAmount: summary.rows[0]?.total_amount || 0
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "账单查询失败" }, { status: 500 });
  }
}
