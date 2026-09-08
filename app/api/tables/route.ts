import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { requireOrderCreate, requirePermission } from "../../../lib/permissions";
import { TABLE_LAYOUT, buildTables, type OpenSessionRow } from "../../../lib/tables-utils";

const TABLE_SET = new Set<string>(TABLE_LAYOUT.map((t) => t.tableNo));

function isMissingTableSessionTablesError(err: any) {
  return err?.code === "42P01" && String(err?.message || "").includes("table_session_tables");
}

async function getOpenSessionRows() {
  try {
    const { rows } = await pool.query<OpenSessionRow>(
      `SELECT ts.id AS session_id,
              ts.table_no AS session_table_no,
              ts.guest_count,
              ts.opened_at,
              tst.table_no,
              COALESCE(bill.total_amount, 0)::int AS current_amount
       FROM table_sessions ts
       LEFT JOIN table_session_tables tst ON tst.session_id = ts.id
       LEFT JOIN LATERAL (
         WITH filtered_orders AS (
           SELECT o.id
           FROM orders o
           WHERE o.table_no = ts.table_no
             AND o.created_at >= ts.opened_at
             AND o.status IN ('submitted', 'preparing', 'served', 'paid')
             AND o.cancelled_at IS NULL
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
           SELECT fo.id,
                  (COALESCE(it.item_amount, 0) + COALESCE(ct.charge_amount, 0))::int AS total_amount
           FROM filtered_orders fo
           LEFT JOIN item_total it ON it.order_id = fo.id
           LEFT JOIN charge_total ct ON ct.order_id = fo.id
         )
         SELECT COALESCE(SUM(total_amount), 0)::int AS total_amount
         FROM order_total
       ) bill ON true
       WHERE ts.closed_at IS NULL
       ORDER BY ts.opened_at ASC`
    );
    return rows;
  } catch (err: any) {
    if (!isMissingTableSessionTablesError(err)) {
      throw err;
    }

    const fallback = await pool.query<OpenSessionRow>(
      `SELECT ts.id AS session_id,
              ts.table_no AS session_table_no,
              ts.guest_count,
              ts.opened_at,
              NULL::text AS table_no,
              COALESCE(bill.total_amount, 0)::int AS current_amount
       FROM table_sessions ts
       LEFT JOIN LATERAL (
         WITH filtered_orders AS (
           SELECT o.id
           FROM orders o
           WHERE o.table_no = ts.table_no
             AND o.created_at >= ts.opened_at
             AND o.status IN ('submitted', 'preparing', 'served', 'paid')
             AND o.cancelled_at IS NULL
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
           SELECT fo.id,
                  (COALESCE(it.item_amount, 0) + COALESCE(ct.charge_amount, 0))::int AS total_amount
           FROM filtered_orders fo
           LEFT JOIN item_total it ON it.order_id = fo.id
           LEFT JOIN charge_total ct ON ct.order_id = fo.id
         )
         SELECT COALESCE(SUM(total_amount), 0)::int AS total_amount
         FROM order_total
       ) bill ON true
       WHERE ts.closed_at IS NULL
       ORDER BY ts.opened_at ASC`
    );
    return fallback.rows;
  }
}

export async function GET(req: Request) {
  try {
    await requirePermission(req, "order.create");
    const rows = await getOpenSessionRows();
    const tables = buildTables(rows);

    return NextResponse.json({
      barLabel: "吧台（BAR）",
      tables
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "查询桌台失败" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireOrderCreate(req);
    const body = await req.json().catch(() => null);
    const tableNo = String(body?.tableNo || "").trim();
    const guestCount = Number(body?.guestCount);

    if (!TABLE_SET.has(tableNo) || !Number.isInteger(guestCount) || guestCount <= 0) {
      return NextResponse.json({ error: "桌号或人数无效" }, { status: 400 });
    }

    const { rows } = await pool.query<{
      id: string;
      table_no: string;
      guest_count: number;
      opened_at: string;
    }>(
      `INSERT INTO table_sessions (table_no, guest_count, opened_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (table_no) WHERE closed_at IS NULL DO NOTHING
       RETURNING id, table_no, guest_count, opened_at`,
      [tableNo, guestCount, auth.userId]
    );

    const created = rows[0];
    if (!created) {
      return NextResponse.json({ error: "该桌已开台" }, { status: 409 });
    }

    return NextResponse.json({
      session: {
        id: created.id,
        tableNo: created.table_no,
        guestCount: created.guest_count,
        openedAt: created.opened_at
      }
    }, { status: 201 });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "开台失败" }, { status: 500 });
  }
}
