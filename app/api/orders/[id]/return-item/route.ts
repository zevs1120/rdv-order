import { NextResponse } from "next/server";
import { pool } from "../../../../../lib/db";
import { requirePermission } from "../../../../../lib/permissions";
import { writeAuditLogSafe } from "../../../../../lib/audit";
import { replaceAutoChargesForOrder } from "../../../../../lib/auto-charges";

type Params = { params: Promise<{ id: string }> };
const UUID_V4_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ItemRow = {
  id: string;
  qty: number;
};

export async function POST(req: Request, { params }: Params) {
  try {
    const auth = await requirePermission(req, "order.return_item");
    const { id } = await params;
    const body = await req.json().catch(() => null) as {
      menuItemId?: unknown;
      qty?: unknown;
      reason?: unknown;
    } | null;

    const menuItemId = String(body?.menuItemId || "").trim();
    const qty = Number(body?.qty);
    const reason = String(body?.reason || "").trim();

    if (!id || !menuItemId || !UUID_V4_LIKE.test(id) || !UUID_V4_LIKE.test(menuItemId)) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      return NextResponse.json({ error: "退菜数量无效" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const orderRes = await client.query<{ status: "submitted" | "preparing" | "served" | "paid" | "closed" }>(
        `SELECT status
         FROM orders
         WHERE id = $1
         FOR UPDATE`,
        [id]
      );
      if (orderRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "订单不存在" }, { status: 404 });
      }
      if (orderRes.rows[0].status === "paid" || orderRes.rows[0].status === "closed") {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "当前状态不可退菜" }, { status: 409 });
      }

      const items = await client.query<ItemRow>(
        `SELECT id, qty
         FROM order_items
         WHERE order_id = $1
           AND menu_item_id = $2
         ORDER BY qty DESC
         FOR UPDATE`,
        [id, menuItemId]
      );
      if (items.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "该订单无此菜品" }, { status: 404 });
      }

      let left = qty;
      for (const row of items.rows) {
        if (left <= 0) break;
        const take = Math.min(row.qty, left);
        const nextQty = row.qty - take;
        if (nextQty <= 0) {
          await client.query(`DELETE FROM order_items WHERE id = $1`, [row.id]);
        } else {
          await client.query(`UPDATE order_items SET qty = $2 WHERE id = $1`, [row.id, nextQty]);
        }
        left -= take;
      }

      if (left > 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "退菜数量超过已点数量" }, { status: 409 });
      }

      await replaceAutoChargesForOrder(client, id, auth.userId);

      await client.query(
        `INSERT INTO order_events (order_id, event_type, payload, created_by)
         VALUES ($1, 'return_item', jsonb_build_object('menuItemId', $2::text, 'qty', $3::int, 'reason', $4::text), $5)`,
        [id, menuItemId, qty, reason || null, auth.userId]
      );

      await client.query("COMMIT");
      await writeAuditLogSafe({
        actorUserId: auth.userId,
        action: "order.return_item",
        entityType: "order",
        entityId: id,
        detail: { menuItemId, qty, reason },
        req
      });

      return NextResponse.json({ ok: true, orderId: id, menuItemId, returnedQty: qty });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "退菜失败" }, { status: 500 });
  }
}
