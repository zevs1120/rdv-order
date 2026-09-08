import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";

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
    const auth = await requirePermission(req, "report.orders");

    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const tableNo = (url.searchParams.get("tableNo") || "").trim();

    const defaultRange = getTodayRange();
    const rangeFrom = from ? new Date(from) : defaultRange.start;
    const rangeTo = to ? new Date(to) : defaultRange.end;

    if (Number.isNaN(rangeFrom.getTime()) || Number.isNaN(rangeTo.getTime())) {
      return NextResponse.json({ error: "时间格式错误" }, { status: 400 });
    }
    if (rangeFrom.getTime() > rangeTo.getTime()) {
      return NextResponse.json({ error: "时间范围无效" }, { status: 400 });
    }
    const maxRangeDays = 370;
    if (rangeTo.getTime() - rangeFrom.getTime() > maxRangeDays * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: "时间范围无效" }, { status: 400 });
    }

    const params: string[] = [rangeFrom.toISOString(), rangeTo.toISOString()];
    let tableSql = "";
    if (tableNo) {
      params.push(tableNo);
      tableSql = ` AND o.table_no = $${params.length}`;
    }

    const { rows } = await pool.query(
      `WITH filtered_orders AS (
         SELECT o.id, o.table_no, o.status, o.cancelled_at, o.created_at
         FROM orders o
         WHERE o.created_at >= $1
           AND o.created_at <= $2
           ${tableSql}
       ),
       item_data AS (
         SELECT oi.order_id,
                COALESCE(SUM(oi.qty), 0)::int AS item_qty,
                COALESCE(SUM(oi.qty * COALESCE(oi.unit_price, mi.price)), 0)::int AS item_amount,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'menu_item_id', mi.id,
                      'order_item_id', oi.id,
                      'name', mi.name,
                      'qty', oi.qty,
                      'note', oi.note,
                      'unit_price', COALESCE(oi.unit_price, mi.price),
                      'amount', oi.qty * COALESCE(oi.unit_price, mi.price)
                    )
                    ORDER BY mi.name ASC
                  ) FILTER (WHERE oi.id IS NOT NULL),
                  '[]'::json
                ) AS items
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         JOIN filtered_orders fo ON fo.id = oi.order_id
         GROUP BY oi.order_id
       ),
       charge_data AS (
         SELECT oc.order_id,
                COALESCE(SUM(oc.amount), 0)::int AS charge_amount
         FROM order_charges oc
         JOIN filtered_orders fo ON fo.id = oc.order_id
         GROUP BY oc.order_id
       )
       SELECT fo.id,
              fo.table_no,
              fo.status,
              fo.cancelled_at,
              fo.created_at,
              COALESCE(id.item_qty, 0)::int AS item_qty,
              CASE
                WHEN fo.cancelled_at IS NOT NULL THEN 0
                ELSE COALESCE(cd.charge_amount, 0)
              END::int AS charge_amount,
              CASE
                WHEN fo.cancelled_at IS NOT NULL THEN 0
                ELSE COALESCE(id.item_amount, 0) + COALESCE(cd.charge_amount, 0)
              END::int AS amount,
              COALESCE(id.items, '[]'::json) AS items
       FROM filtered_orders fo
       LEFT JOIN item_data id ON id.order_id = fo.id
       LEFT JOIN charge_data cd ON cd.order_id = fo.id
       ORDER BY fo.created_at DESC`,
      params
    );

    return NextResponse.json({ orders: rows, viewerRole: auth.role });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "订单查询失败" }, { status: 500 });
  }
}
