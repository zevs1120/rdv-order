import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { requirePermission } from "../../../lib/permissions";

export async function GET(req: Request) {
  try {
    await requirePermission(req, "report.finance");
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const rangeFrom = from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rangeTo = to ? new Date(to) : new Date();

    if (Number.isNaN(rangeFrom.getTime()) || Number.isNaN(rangeTo.getTime())) {
      return NextResponse.json({ error: "时间格式错误" }, { status: 400 });
    }

    const totalRes = await pool.query(
      `WITH filtered_orders AS (
         SELECT o.id
         FROM orders o
         WHERE o.created_at >= $1
           AND o.created_at <= $2
           AND o.status IN ('paid', 'closed')
           AND o.cancelled_at IS NULL
           AND o.merged_into_order_id IS NULL
       ),
       item_total AS (
         SELECT oi.order_id,
                COALESCE(SUM(oi.qty * COALESCE(oi.unit_price, mi.price)), 0)::int AS item_amount
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         JOIN filtered_orders fo ON fo.id = oi.order_id
         GROUP BY oi.order_id
       ),
       charge_total AS (
         SELECT oc.order_id,
                COALESCE(SUM(oc.amount), 0)::int AS charge_amount
         FROM order_charges oc
         JOIN filtered_orders fo ON fo.id = oc.order_id
         GROUP BY oc.order_id
       )
       SELECT COUNT(*)::int AS order_count,
              COALESCE(SUM(COALESCE(it.item_amount, 0) + COALESCE(ct.charge_amount, 0)), 0)::int AS total_amount
       FROM filtered_orders fo
       LEFT JOIN item_total it ON it.order_id = fo.id
       LEFT JOIN charge_total ct ON ct.order_id = fo.id`,
      [rangeFrom.toISOString(), rangeTo.toISOString()]
    );

    const itemsRes = await pool.query(
      `SELECT mi.id AS menu_item_id, mi.name, SUM(oi.qty)::int AS qty
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE o.created_at >= $1 AND o.created_at <= $2
         AND o.status IN ('paid', 'closed')
         AND o.cancelled_at IS NULL
         AND o.merged_into_order_id IS NULL
       GROUP BY mi.id, mi.name
       ORDER BY qty DESC`,
      [rangeFrom.toISOString(), rangeTo.toISOString()]
    );

    return NextResponse.json({
      orderCount: totalRes.rows[0]?.order_count ?? 0,
      totalAmount: totalRes.rows[0]?.total_amount ?? 0,
      items: itemsRes.rows
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}
