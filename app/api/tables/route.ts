import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { requirePermission } from "../../../lib/permissions";
import { writeAuditLogSafe } from "../../../lib/audit";
import { lockBaseTables } from "../../../lib/table-lock";
import { TABLE_LAYOUT, buildTables, splitTableNo, type OpenSessionRow } from "../../../lib/tables-utils";

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
                  COALESCE(SUM(oi.qty * mi.price), 0)::int AS item_amount
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
                  COALESCE(SUM(oi.qty * mi.price), 0)::int AS item_amount
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

async function getUsedBaseTables(client: Awaited<ReturnType<typeof pool.connect>>) {
  try {
    const { rows } = await client.query<{ table_no: string }>(
      `SELECT DISTINCT tst.table_no
       FROM table_sessions ts
       JOIN table_session_tables tst ON tst.session_id = ts.id
       WHERE ts.closed_at IS NULL`
    );
    return new Set(rows.map((r) => r.table_no));
  } catch (err: any) {
    if (!isMissingTableSessionTablesError(err)) {
      throw err;
    }

    const fallback = await client.query<{ table_no: string }>(
      `SELECT table_no
       FROM table_sessions
       WHERE closed_at IS NULL`
    );
    const used = new Set<string>();
    for (const row of fallback.rows) {
      for (const part of splitTableNo(row.table_no)) {
        if (TABLE_SET.has(part)) {
          used.add(part);
        }
      }
    }
    return used;
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
    const auth = await requirePermission(req, "order.create");
    const body = await req.json().catch(() => null);
    const tableNo = String(body?.tableNo || "").trim();
    const guestCount = Number(body?.guestCount);

    if (!TABLE_SET.has(tableNo) || !Number.isInteger(guestCount) || guestCount <= 0) {
      return NextResponse.json({ error: "桌号或人数无效" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await lockBaseTables(client, [tableNo]);

      const used = await getUsedBaseTables(client);
      if (used.has(tableNo)) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "该桌已开台" }, { status: 409 });
      }

      const created = await client.query(
        `INSERT INTO table_sessions (table_no, guest_count, opened_by)
         VALUES ($1, $2, $3)
         RETURNING id, table_no, guest_count, opened_at`,
        [tableNo, guestCount, auth.userId]
      );

      try {
        await client.query(
          `INSERT INTO table_session_tables (session_id, table_no)
           VALUES ($1, $2)`,
          [created.rows[0].id, tableNo]
        );
      } catch (err: any) {
        if (!isMissingTableSessionTablesError(err)) {
          throw err;
        }
      }

      await client.query("COMMIT");
      await writeAuditLogSafe({
        actorUserId: auth.userId,
        action: "table.open",
        entityType: "table_session",
        entityId: created.rows[0].id,
        detail: { tableNo: created.rows[0].table_no, guestCount: created.rows[0].guest_count },
        req
      });
      return NextResponse.json({
        session: {
          id: created.rows[0].id,
          tableNo: created.rows[0].table_no,
          guestCount: created.rows[0].guest_count,
          openedAt: created.rows[0].opened_at
        }
      }, { status: 201 });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "开台失败" }, { status: 500 });
  }
}
