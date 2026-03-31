import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";
import { writeAuditLogSafe } from "../../../../lib/audit";
import { lockSessionName } from "../../../../lib/table-lock";
import { replaceAutoChargesForOrder } from "../../../../lib/auto-charges";

type SessionRow = {
  id: string;
  table_no: string;
  opened_at: string;
  closed_at: string | null;
};

export async function POST(req: Request) {
  try {
    const auth = await requirePermission(req, "cashier.reverse_checkout");
    const body = await req.json().catch(() => null) as {
      tableNo?: unknown;
      reason?: unknown;
    } | null;

    const tableNo = String(body?.tableNo || "").trim();
    const reason = String(body?.reason || "").trim();
    if (!tableNo) {
      return NextResponse.json({ error: "缺少桌号" }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: "请填写反结账原因" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await lockSessionName(client, tableNo);

      const openSession = await client.query<{ id: string }>(
        `SELECT id
         FROM table_sessions
         WHERE table_no = $1
           AND closed_at IS NULL
         LIMIT 1`,
        [tableNo]
      );
      if (openSession.rows.length > 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "该桌当前是开台状态，无需反结账" }, { status: 409 });
      }

      const latestClosed = await client.query<SessionRow>(
        `SELECT id, table_no, opened_at, closed_at
         FROM table_sessions
         WHERE table_no = $1
           AND closed_at IS NOT NULL
         ORDER BY closed_at DESC
         LIMIT 1
         FOR UPDATE`,
        [tableNo]
      );
      if (latestClosed.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "未找到可反结账会话" }, { status: 404 });
      }

      const session = latestClosed.rows[0];
      await client.query(
        `UPDATE table_sessions
         SET closed_at = NULL
         WHERE id = $1`,
        [session.id]
      );

      const revertedOrders = await client.query<{ id: string }>(
        `UPDATE orders
         SET status = 'submitted',
             reversed_at = now()
         WHERE table_no = $1
           AND created_at >= $2
           AND created_at <= $3
           AND status = 'closed'
           AND cancelled_at IS NULL
         RETURNING id`,
        [session.table_no, session.opened_at, session.closed_at]
      );

      for (const row of revertedOrders.rows) {
        await replaceAutoChargesForOrder(client, row.id, auth.userId);
      }

      for (const row of revertedOrders.rows) {
        await client.query(
          `INSERT INTO order_events (order_id, event_type, payload, created_by)
           VALUES ($1, 'reverse_checkout', jsonb_build_object('reason', $2), $3)`,
          [row.id, reason, auth.userId]
        );
      }

      await client.query("COMMIT");
      await writeAuditLogSafe({
        actorUserId: auth.userId,
        action: "cashier.reverse_checkout",
        entityType: "table_session",
        entityId: session.id,
        detail: { tableNo, reason, revertedOrderCount: revertedOrders.rows.length },
        req
      });

      return NextResponse.json({
        ok: true,
        tableNo,
        reopened: true,
        revertedOrderCount: revertedOrders.rows.length
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
    return NextResponse.json({ error: "反结账失败" }, { status: 500 });
  }
}
