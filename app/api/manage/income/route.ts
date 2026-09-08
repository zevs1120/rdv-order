import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";

export async function GET(req: Request) {
  try {
    await requirePermission(req, "report.finance");

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
    if (rangeFrom.getTime() > rangeTo.getTime()) {
      return NextResponse.json({ error: "时间范围无效" }, { status: 400 });
    }

    // One aggregation/snapshot supplies both the daily rows and the totals.
    const byDay = await pool.query(
      `WITH filtered_orders AS (
         SELECT o.id, o.created_at
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
       ),
       order_total AS (
         SELECT DATE_TRUNC('day', fo.created_at) AS day,
                COALESCE(it.item_amount, 0)::int AS item_amount,
                COALESCE(ct.charge_amount, 0)::int AS charge_amount
         FROM filtered_orders fo
         LEFT JOIN item_total it ON it.order_id = fo.id
         LEFT JOIN charge_total ct ON ct.order_id = fo.id
       )
       SELECT day,
              COUNT(*)::int AS order_count,
              COALESCE(SUM(item_amount + charge_amount), 0)::int AS amount,
              SUM(COUNT(*)) OVER ()::int AS total_order_count,
              SUM(SUM(item_amount + charge_amount)) OVER ()::int AS total_amount
       FROM order_total
       GROUP BY day
       ORDER BY day DESC`,
      [rangeFrom.toISOString(), rangeTo.toISOString()]
    );

    return NextResponse.json({
      orderCount: byDay.rows[0]?.total_order_count || 0,
      totalAmount: byDay.rows[0]?.total_amount || 0,
      byDay: byDay.rows.map(({ day, order_count, amount }) => ({ day, order_count, amount }))
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "收入查询失败" }, { status: 500 });
  }
}
