import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";

type SessionRow = {
  id: string;
  table_no: string;
  guest_count: number;
  opened_at: string;
};

export async function GET(req: Request) {
  try {
    await requirePermission(req, "report.orders");
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
      note: string | null;
    }>(
      `SELECT mi.id AS menu_item_id,
              mi.name,
              oi.note,
              SUM(oi.qty)::int AS qty,
              SUM(oi.qty * mi.price)::int AS amount
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE o.table_no = $1
         AND o.created_at >= $2
         AND o.status IN ('submitted', 'paid')
       GROUP BY mi.id, mi.name, oi.note
       ORDER BY mi.name ASC, oi.note ASC NULLS FIRST`,
      [s.table_no, s.opened_at]
    );

    const orders = await pool.query<{
      id: string;
      status: string;
      cancelled_at: string | null;
      created_at: string;
      item_amount: number;
      charge_amount: number;
      total_amount: number;
      items: Array<{ menu_item_id: string; name: string; qty: number; amount: number }>;
      charges: Array<{ id: string; charge_type: string; amount: number; mode: string; value: number; note: string | null }>;
    }>(
      `WITH order_base AS (
         SELECT o.id,
                o.status,
                o.cancelled_at,
                o.created_at,
                COALESCE(SUM(oi.qty * mi.price), 0)::int AS item_amount
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
         WHERE o.table_no = $1
           AND o.created_at >= $2
         GROUP BY o.id, o.status, o.cancelled_at, o.created_at
       ),
       order_charge AS (
         SELECT oc.order_id,
                COALESCE(SUM(oc.amount), 0)::int AS charge_amount,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'id', oc.id,
                      'charge_type', oc.charge_type,
                      'amount', oc.amount,
                      'mode', oc.mode,
                      'value', oc.value,
                      'note', oc.note
                    )
                    ORDER BY oc.created_at ASC
                  ),
                  '[]'::json
                ) AS charges
         FROM order_charges oc
         GROUP BY oc.order_id
       ),
       order_item_detail AS (
         SELECT oi.order_id,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'menu_item_id', mi.id,
                      'name', mi.name,
                      'qty', oi.qty,
                      'amount', oi.qty * mi.price,
                      'note', oi.note
                    )
                    ORDER BY mi.name ASC
                  ),
                  '[]'::json
                ) AS items
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         GROUP BY oi.order_id
       )
       SELECT ob.id,
              ob.status,
              ob.cancelled_at,
              ob.created_at,
              CASE WHEN ob.cancelled_at IS NOT NULL THEN 0 ELSE ob.item_amount END::int AS item_amount,
              CASE WHEN ob.cancelled_at IS NOT NULL THEN 0 ELSE COALESCE(oc.charge_amount, 0) END::int AS charge_amount,
              CASE WHEN ob.cancelled_at IS NOT NULL THEN 0 ELSE (ob.item_amount + COALESCE(oc.charge_amount, 0)) END::int AS total_amount,
              COALESCE(oid.items, '[]'::json) AS items,
              COALESCE(oc.charges, '[]'::json) AS charges
       FROM order_base ob
       LEFT JOIN order_charge oc ON oc.order_id = ob.id
       LEFT JOIN order_item_detail oid ON oid.order_id = ob.id
       ORDER BY ob.created_at DESC`,
      [s.table_no, s.opened_at]
    );

    const summary = await pool.query<{ total_qty: number; total_amount: number }>(
      `WITH order_total AS (
         SELECT o.id,
                COALESCE(SUM(oi.qty), 0)::int AS total_qty,
                COALESCE(SUM(oi.qty * mi.price), 0)::int
                + COALESCE((
                    SELECT SUM(amount)::int
                    FROM order_charges oc
                    WHERE oc.order_id = o.id
                  ), 0)::int AS total_amount
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE o.table_no = $1
         AND o.created_at >= $2
         AND o.status IN ('submitted', 'paid')
         GROUP BY o.id
       )
       SELECT COALESCE(SUM(total_qty), 0)::int AS total_qty,
              COALESCE(SUM(total_amount), 0)::int AS total_amount
       FROM order_total`,
      [s.table_no, s.opened_at]
    );

    return NextResponse.json({
      tableNo: s.table_no,
      guestCount: s.guest_count,
      items: items.rows,
      orders: orders.rows,
      totalQty: summary.rows[0]?.total_qty || 0,
      totalAmount: summary.rows[0]?.total_amount || 0
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "账单查询失败" }, { status: 500 });
  }
}
