import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";
import { writeAuditLogSafe } from "../../../../lib/audit";

const UUID_V4_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  try {
    const auth = await requirePermission(req, "order.split_merge");
    const body = await req.json().catch(() => null) as {
      targetOrderId?: unknown;
      sourceOrderIds?: unknown;
    } | null;

    const targetOrderId = String(body?.targetOrderId || "").trim();
    const sourceOrderIds = Array.isArray(body?.sourceOrderIds)
      ? Array.from(new Set((body?.sourceOrderIds as unknown[]).map((v) => String(v || "").trim()).filter(Boolean)))
      : [];

    if (!targetOrderId || sourceOrderIds.length === 0) {
      return NextResponse.json({ error: "并单参数错误" }, { status: 400 });
    }
    if (!UUID_V4_LIKE.test(targetOrderId) || sourceOrderIds.some((id) => !UUID_V4_LIKE.test(id))) {
      return NextResponse.json({ error: "订单 ID 格式错误" }, { status: 400 });
    }
    if (sourceOrderIds.includes(targetOrderId)) {
      return NextResponse.json({ error: "目标单不能包含在来源单中" }, { status: 400 });
    }

    const allOrderIds = [targetOrderId, ...sourceOrderIds];
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const orders = await client.query<{
        id: string;
        table_no: string;
        status: string;
      }>(
        `SELECT id, table_no, status
         FROM orders
         WHERE id = ANY($1::uuid[])
         ORDER BY id
         FOR UPDATE`,
        [allOrderIds]
      );
      if (orders.rows.length !== allOrderIds.length) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "存在无效订单 ID" }, { status: 404 });
      }

      const tableNo = orders.rows[0].table_no;
      for (const order of orders.rows) {
        if (order.table_no !== tableNo) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "仅支持同一桌号并单" }, { status: 409 });
        }
        if (order.status !== "submitted") {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "仅未结账订单可并单" }, { status: 409 });
        }
      }

      await client.query(
        `UPDATE order_items
         SET order_id = $1
         WHERE order_id = ANY($2::uuid[])`,
        [targetOrderId, sourceOrderIds]
      );

      const groupedItems = await client.query<{ menu_item_id: string; note: string | null; qty: number; unit_price: number; choices: unknown }>(
        `SELECT menu_item_id, note, unit_price, choices, SUM(qty)::int AS qty
         FROM order_items
         WHERE order_id = $1
         GROUP BY menu_item_id, note, unit_price, choices`,
        [targetOrderId]
      );

      await client.query(
        `DELETE FROM order_items
         WHERE order_id = $1`,
        [targetOrderId]
      );

      for (const row of groupedItems.rows) {
        await client.query(
          `INSERT INTO order_items (order_id, menu_item_id, qty, note, unit_price, choices)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
          [targetOrderId, row.menu_item_id, row.qty, row.note, row.unit_price, JSON.stringify(row.choices || {})]
        );
      }

      await client.query(
        `UPDATE order_charges
         SET order_id = $1
         WHERE order_id = ANY($2::uuid[])`,
        [targetOrderId, sourceOrderIds]
      );

      await client.query(
        `UPDATE orders
         SET status = 'closed',
             merged_into_order_id = $2,
             cancelled_at = now(),
             cancelled_by = $3,
             cancelled_reason = 'merged'
         WHERE id = ANY($1::uuid[])`,
        [sourceOrderIds, targetOrderId, auth.userId]
      );

      await client.query(
        `INSERT INTO order_events (order_id, event_type, payload, created_by)
         VALUES
         ($1, 'merge_in', jsonb_build_object('fromOrderIds', $2::jsonb), $3)`,
        [targetOrderId, JSON.stringify(sourceOrderIds), auth.userId]
      );
      for (const sourceId of sourceOrderIds) {
        await client.query(
          `INSERT INTO order_events (order_id, event_type, payload, created_by)
           VALUES ($1, 'merge_out', jsonb_build_object('toOrderId', $2::uuid), $3)`,
          [sourceId, targetOrderId, auth.userId]
        );
      }

      await client.query("COMMIT");
      await writeAuditLogSafe({
        actorUserId: auth.userId,
        action: "order.merge",
        entityType: "order",
        entityId: targetOrderId,
        detail: { sourceOrderIds },
        req
      });

      return NextResponse.json({ ok: true, targetOrderId, mergedOrderIds: sourceOrderIds });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "并单失败" }, { status: 500 });
  }
}
