import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requireAuth } from "../../../../lib/api-auth";

export async function GET(req: Request) {
  try {
    await requireAuth(req, ["manager"]);

    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json({ error: "缺少时间范围" }, { status: 400 });
    }

    const rangeFrom = new Date(from);
    const rangeTo = new Date(to);

    if (Number.isNaN(rangeFrom.getTime()) || Number.isNaN(rangeTo.getTime())) {
      return NextResponse.json({ error: "时间格式错误" }, { status: 400 });
    }

    const total = await pool.query(
      `SELECT COUNT(DISTINCT o.id)::int AS order_count,
              COALESCE(SUM(oi.qty * mi.price), 0)::int AS total_amount
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE o.created_at >= $1
         AND o.created_at <= $2
         AND o.status = 'paid'`,
      [rangeFrom.toISOString(), rangeTo.toISOString()]
    );

    const byDay = await pool.query(
      `SELECT DATE_TRUNC('day', o.created_at) AS day,
              COUNT(DISTINCT o.id)::int AS order_count,
              COALESCE(SUM(oi.qty * mi.price), 0)::int AS amount
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE o.created_at >= $1
         AND o.created_at <= $2
         AND o.status = 'paid'
       GROUP BY DATE_TRUNC('day', o.created_at)
       ORDER BY day DESC`,
      [rangeFrom.toISOString(), rangeTo.toISOString()]
    );

    return NextResponse.json({
      orderCount: total.rows[0]?.order_count || 0,
      totalAmount: total.rows[0]?.total_amount || 0,
      byDay: byDay.rows
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "收入查询失败" }, { status: 500 });
  }
}
