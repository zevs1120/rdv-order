import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";

function defaultRange() {
  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

export async function GET(req: Request) {
  try {
    await requirePermission(req, "report.ops");
    const url = new URL(req.url);
    const fromRaw = url.searchParams.get("from");
    const toRaw = url.searchParams.get("to");
    const defaulted = defaultRange();
    const from = fromRaw ? new Date(fromRaw) : defaulted.from;
    const to = toRaw ? new Date(toRaw) : defaulted.to;

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      return NextResponse.json({ error: "时间范围无效" }, { status: 400 });
    }

    const summary = await pool.query<{
      order_count: number;
      gross_revenue: number;
    }>(
      `WITH order_items_total AS (
         SELECT o.id AS order_id,
                COALESCE(SUM(oi.qty * mi.price), 0)::int AS item_amount
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
         WHERE o.status IN ('paid', 'closed')
           AND o.cancelled_at IS NULL
           AND o.merged_into_order_id IS NULL
           AND o.created_at >= $1
           AND o.created_at <= $2
         GROUP BY o.id
       ),
       order_charge_total AS (
         SELECT oc.order_id, COALESCE(SUM(oc.amount), 0)::int AS charge_amount
         FROM order_charges oc
         GROUP BY oc.order_id
       )
       SELECT COUNT(*)::int AS order_count,
              COALESCE(SUM(oit.item_amount + COALESCE(oct.charge_amount, 0)), 0)::int AS gross_revenue
       FROM order_items_total oit
       LEFT JOIN order_charge_total oct ON oct.order_id = oit.order_id`,
      [from.toISOString(), to.toISOString()]
    );

    const cash = await pool.query<{ actual_received: number }>(
      `SELECT COALESCE(SUM(actual_amount), 0)::int AS actual_received
       FROM cashier_closings
       WHERE from_time >= $1
         AND to_time <= $2`,
      [from.toISOString(), to.toISOString()]
    );

    const hot = await pool.query<{ name: string; qty: number }>(
      `SELECT mi.name,
              COALESCE(SUM(oi.qty), 0)::int AS qty
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE o.status IN ('paid', 'closed')
         AND o.cancelled_at IS NULL
         AND o.merged_into_order_id IS NULL
         AND o.created_at >= $1
         AND o.created_at <= $2
       GROUP BY mi.id, mi.name
       ORDER BY qty DESC, mi.name ASC
       LIMIT 8`,
      [from.toISOString(), to.toISOString()]
    );

    return NextResponse.json({
      from: from.toISOString(),
      to: to.toISOString(),
      orderCount: summary.rows[0]?.order_count || 0,
      grossRevenue: summary.rows[0]?.gross_revenue || 0,
      actualReceived: cash.rows[0]?.actual_received || 0,
      hotItems: hot.rows
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "运营指标查询失败" }, { status: 500 });
  }
}
