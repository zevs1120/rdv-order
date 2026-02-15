import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";
import { writeAuditLogSafe } from "../../../../lib/audit";
import { lockSessionName } from "../../../../lib/table-lock";

type SessionRow = {
  id: string;
  table_no: string;
  opened_at: string;
};

export async function POST(req: Request) {
  try {
    const auth = await requirePermission(req, "order.create");
    const body = await req.json().catch(() => null);
    const tableNo = String(body?.tableNo || "").trim();

    if (!tableNo) {
      return NextResponse.json({ error: "缺少桌号" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await lockSessionName(client, tableNo);

      const session = await client.query<SessionRow>(
        `SELECT id, table_no, opened_at
         FROM table_sessions
         WHERE table_no = $1 AND closed_at IS NULL
         LIMIT 1
         FOR UPDATE`,
        [tableNo]
      );

      if (session.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "桌台未开台" }, { status: 404 });
      }

      const s = session.rows[0];

      const openOrders = await client.query<{ id: string; status: string }>(
        `SELECT id, status
         FROM orders
         WHERE table_no = $1
           AND created_at >= $2
           AND status IN ('submitted', 'paid')
         FOR UPDATE`,
        [s.table_no, s.opened_at]
      );

      if (openOrders.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "当前无可结账订单" }, { status: 409 });
      }

      const taxRules = await client.query<{
        id: string;
        mode: "amount" | "percent";
        value: number;
      }>(
        `SELECT id, mode, value
         FROM pricing_rules
         WHERE is_active = true
           AND charge_type = 'tax'
         ORDER BY sort_order ASC, created_at ASC`
      );

      for (const order of openOrders.rows) {
        const finance = await client.query<{ item_amount: number; charge_amount: number }>(
          `SELECT
             COALESCE(SUM(oi.qty * mi.price), 0)::int AS item_amount,
             COALESCE((
               SELECT SUM(amount)::int
               FROM order_charges oc
               WHERE oc.order_id = $1
             ), 0)::int AS charge_amount
           FROM order_items oi
           JOIN menu_items mi ON mi.id = oi.menu_item_id
           WHERE oi.order_id = $1`,
          [order.id]
        );
        const baseAmount = (finance.rows[0]?.item_amount || 0) + (finance.rows[0]?.charge_amount || 0);

        for (const rule of taxRules.rows) {
          const amount = rule.mode === "percent"
            ? Math.round((baseAmount * rule.value) / 100)
            : rule.value;

          await client.query(
            `INSERT INTO order_charges (order_id, charge_type, mode, value, amount, note, created_by, rule_id, source)
             VALUES ($1, 'tax', $2, $3, $4, 'auto tax', $5, $6, 'rule_auto')
             ON CONFLICT (order_id, rule_id, source) DO NOTHING`,
            [order.id, rule.mode, rule.value, amount, auth.userId, rule.id]
          );
        }
      }

      await client.query(
        `UPDATE orders
         SET status = 'paid',
             paid_at = now()
         WHERE table_no = $1
           AND created_at >= $2
           AND status = 'submitted'`,
        [s.table_no, s.opened_at]
      );

      await client.query(
        `UPDATE orders
         SET status = 'closed'
         WHERE table_no = $1
           AND created_at >= $2
           AND status = 'paid'`,
        [s.table_no, s.opened_at]
      );

      const summary = await client.query<{ order_count: number; total_amount: number }>(
        `WITH order_total AS (
           SELECT o.id,
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
             AND o.status = 'closed'
           GROUP BY o.id
         )
         SELECT COUNT(*)::int AS order_count,
                COALESCE(SUM(total_amount), 0)::int AS total_amount
         FROM order_total`,
        [s.table_no, s.opened_at]
      );

      await client.query(
        `INSERT INTO order_events (order_id, event_type, payload, created_by)
         SELECT o.id, 'checkout', '{}'::jsonb, $1
         FROM orders o
         WHERE o.table_no = $2
           AND o.created_at >= $3
           AND o.status = 'closed'`,
        [auth.userId, s.table_no, s.opened_at]
      );

      await client.query(
        `UPDATE table_sessions
         SET closed_at = now()
         WHERE id = $1`,
        [s.id]
      );

      await client.query("COMMIT");
      await writeAuditLogSafe({
        actorUserId: auth.userId,
        action: "table.checkout",
        entityType: "table_session",
        entityId: s.id,
        detail: {
          tableNo: s.table_no,
          orderCount: summary.rows[0]?.order_count || 0,
          totalAmount: summary.rows[0]?.total_amount || 0
        },
        req
      });

      return NextResponse.json({
        tableNo: s.table_no,
        orderCount: summary.rows[0]?.order_count || 0,
        totalAmount: summary.rows[0]?.total_amount || 0,
        closed: true
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "结账失败" }, { status: 500 });
  }
}
