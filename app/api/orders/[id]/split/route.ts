import { NextResponse } from "next/server";
import { pool } from "../../../../../lib/db";
import { requirePermission } from "../../../../../lib/permissions";
import { writeAuditLogSafe } from "../../../../../lib/audit";

type Params = { params: Promise<{ id: string }> };
type SplitItem = { menuItemId: string; qty: number };
const UUID_V4_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseItems(raw: unknown): SplitItem[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }

  const merged = new Map<string, number>();
  for (const item of raw) {
    const menuItemId = String((item as { menuItemId?: unknown })?.menuItemId || "").trim();
    const qty = Number((item as { qty?: unknown })?.qty);
    if (!menuItemId || !Number.isInteger(qty) || qty <= 0) {
      return [];
    }
    merged.set(menuItemId, (merged.get(menuItemId) || 0) + qty);
  }
  return Array.from(merged.entries()).map(([menuItemId, qty]) => ({ menuItemId, qty }));
}

type ItemRow = { id: string; menu_item_id: string; qty: number };

export async function POST(req: Request, { params }: Params) {
  try {
    const auth = await requirePermission(req, "order.split_merge");
    const { id } = await params;
    const body = await req.json().catch(() => null) as { items?: unknown } | null;
    const items = parseItems(body?.items);
    if (!id || !UUID_V4_LIKE.test(id) || items.length === 0) {
      return NextResponse.json({ error: "分单菜品参数错误" }, { status: 400 });
    }
    if (items.some((item) => !UUID_V4_LIKE.test(item.menuItemId))) {
      return NextResponse.json({ error: "菜品 ID 格式错误" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const orderRes = await client.query<{
        id: string;
        table_no: string;
        waiter_id: string | null;
        status: string;
      }>(
        `SELECT id, table_no, waiter_id, status
         FROM orders
         WHERE id = $1
         FOR UPDATE`,
        [id]
      );
      if (orderRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "订单不存在" }, { status: 404 });
      }
      const source = orderRes.rows[0];
      if (source.status !== "submitted") {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "仅未结账订单可分单" }, { status: 409 });
      }

      const itemRows = await client.query<ItemRow>(
        `SELECT id, menu_item_id, qty
         FROM order_items
         WHERE order_id = $1
         ORDER BY qty DESC
         FOR UPDATE`,
        [id]
      );
      if (itemRows.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "订单没有可分单菜品" }, { status: 409 });
      }

      const available = new Map<string, number>();
      for (const row of itemRows.rows) {
        available.set(row.menu_item_id, (available.get(row.menu_item_id) || 0) + row.qty);
      }
      for (const reqItem of items) {
        if ((available.get(reqItem.menuItemId) || 0) < reqItem.qty) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "分单数量超过原订单菜品数量" }, { status: 409 });
        }
      }

      const created = await client.query<{ id: string }>(
        `INSERT INTO orders (table_no, waiter_id, status, split_from_order_id)
         VALUES ($1, $2, 'submitted', $3)
         RETURNING id`,
        [source.table_no, source.waiter_id, id]
      );
      const targetOrderId = created.rows[0].id;

      for (const reqItem of items) {
        let left = reqItem.qty;
        const rowsForItem = itemRows.rows.filter((r) => r.menu_item_id === reqItem.menuItemId);
        for (const row of rowsForItem) {
          if (left <= 0) break;
          const moveQty = Math.min(left, row.qty);
          const nextQty = row.qty - moveQty;
          if (nextQty <= 0) {
            await client.query(`DELETE FROM order_items WHERE id = $1`, [row.id]);
          } else {
            await client.query(`UPDATE order_items SET qty = $2 WHERE id = $1`, [row.id, nextQty]);
          }
          left -= moveQty;
        }

        await client.query(
          `INSERT INTO order_items (order_id, menu_item_id, qty)
           VALUES ($1, $2, $3)`,
          [targetOrderId, reqItem.menuItemId, reqItem.qty]
        );
      }

      await client.query(
        `INSERT INTO order_events (order_id, event_type, payload, created_by)
         VALUES
         ($1, 'split_out', jsonb_build_object('toOrderId', $2, 'items', $3::jsonb), $4),
         ($2, 'split_in', jsonb_build_object('fromOrderId', $1, 'items', $3::jsonb), $4)`,
        [id, targetOrderId, JSON.stringify(items), auth.userId]
      );

      await client.query("COMMIT");
      await writeAuditLogSafe({
        actorUserId: auth.userId,
        action: "order.split",
        entityType: "order",
        entityId: id,
        detail: { targetOrderId, items },
        req
      });

      return NextResponse.json({
        ok: true,
        sourceOrderId: id,
        targetOrderId
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
    return NextResponse.json({ error: "分单失败" }, { status: 500 });
  }
}
