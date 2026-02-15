import { NextResponse } from "next/server";
import { pool } from "../../../../../lib/db";
import { requirePermission } from "../../../../../lib/permissions";
import { writeAuditLogSafe } from "../../../../../lib/audit";

type Params = { params: Promise<{ id: string }> };
const UUID_V4_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: Params) {
  try {
    const auth = await requirePermission(req, "order.cancel");
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reason = String((body as { reason?: unknown }).reason || "").trim();

    if (!id || !UUID_V4_LIKE.test(id)) {
      return NextResponse.json({ error: "缺少订单 ID" }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: "请填写取消原因" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{ id: string; status: string; cancelled_at: string | null }>(
        `SELECT id, status, cancelled_at
         FROM orders
         WHERE id = $1
         FOR UPDATE`,
        [id]
      );

      if (current.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "订单不存在" }, { status: 404 });
      }
      if (current.rows[0].status === "paid" || current.rows[0].status === "closed") {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "已结账或已关闭订单不能取消" }, { status: 409 });
      }
      if (current.rows[0].cancelled_at) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "订单已取消" }, { status: 409 });
      }

      await client.query(
        `UPDATE orders
         SET status = 'closed',
             cancelled_at = now(),
             cancelled_by = $2,
             cancelled_reason = $3
         WHERE id = $1`,
        [id, auth.userId, reason]
      );

      await client.query(
        `INSERT INTO order_events (order_id, event_type, payload, created_by)
         VALUES ($1, 'cancel', jsonb_build_object('reason', $2), $3)`,
        [id, reason, auth.userId]
      );

      await client.query("COMMIT");
      await writeAuditLogSafe({
        actorUserId: auth.userId,
        action: "order.cancel",
        entityType: "order",
        entityId: id,
        detail: { reason },
        req
      });

      return NextResponse.json({ ok: true, orderId: id, status: "closed", cancelled: true });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "取消订单失败" }, { status: 500 });
  }
}
