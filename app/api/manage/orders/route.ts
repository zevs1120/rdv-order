import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requireAuth } from "../../../../lib/api-auth";

function getTodayRange() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req, ["waiter", "manager"]);

    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const defaultRange = getTodayRange();
    const rangeFrom = from ? new Date(from) : defaultRange.start;
    const rangeTo = to ? new Date(to) : defaultRange.end;

    if (Number.isNaN(rangeFrom.getTime()) || Number.isNaN(rangeTo.getTime())) {
      return NextResponse.json({ error: "时间格式错误" }, { status: 400 });
    }

    const { rows } = await pool.query(
      `SELECT o.id,
              o.table_no,
              o.status,
              o.created_at,
              COALESCE(SUM(oi.qty), 0)::int AS item_qty,
              COALESCE(SUM(oi.qty * mi.price), 0)::int AS amount,
              COALESCE(
                json_agg(
                  json_build_object(
                    'menu_item_id', mi.id,
                    'name', mi.name,
                    'qty', oi.qty,
                    'unit_price', mi.price,
                    'amount', oi.qty * mi.price
                  )
                  ORDER BY mi.name ASC
                ) FILTER (WHERE oi.id IS NOT NULL),
                '[]'::json
              ) AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE o.created_at >= $1
         AND o.created_at <= $2
       GROUP BY o.id, o.table_no, o.status, o.created_at
       ORDER BY o.created_at DESC`,
      [rangeFrom.toISOString(), rangeTo.toISOString()]
    );

    return NextResponse.json({ orders: rows, viewerRole: auth.role });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "订单查询失败" }, { status: 500 });
  }
}
