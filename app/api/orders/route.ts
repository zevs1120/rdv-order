import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { runPrintWorker } from "../../../lib/print-worker";
import { requirePermission } from "../../../lib/permissions";
import { writeAuditLogSafe } from "../../../lib/audit";

type OrderItemInput = {
  menuItemId: string;
  qty: number;
  note: string | null;
};

type OrderBody = {
  tableNo?: unknown;
  items?: unknown;
};

const UUID_V4_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY = /^[a-zA-Z0-9_-]{8,80}$/;

function parseItems(raw: unknown): OrderItemInput[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("INVALID_ITEMS");
  }

  const merged = new Map<string, OrderItemInput>();
  for (const item of raw) {
    const menuItemId = String((item as { menuItemId?: unknown })?.menuItemId || "").trim();
    const qty = Number((item as { qty?: unknown })?.qty);
    const noteRaw = String((item as { note?: unknown })?.note || "").trim();
    const note = noteRaw || null;

    if (!UUID_V4_LIKE.test(menuItemId)) {
      throw new Error("INVALID_ITEMS");
    }
    if (!Number.isInteger(qty) || qty <= 0 || qty > 30) {
      throw new Error("INVALID_ITEMS");
    }
    if (noteRaw.length > 120) {
      throw new Error("INVALID_ITEMS");
    }

    const key = `${menuItemId}::${noteRaw}`;
    const existing = merged.get(key);
    if (existing) {
      merged.set(key, { ...existing, qty: existing.qty + qty });
    } else {
      merged.set(key, { menuItemId, qty, note });
    }
  }

  if (merged.size === 0 || merged.size > 40) {
    throw new Error("INVALID_ITEMS");
  }

  return Array.from(merged.values());
}

async function validateMenuItems(itemIds: string[]) {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id
     FROM menu_items
     WHERE id = ANY($1::uuid[])
       AND (is_active = true OR is_temporary = true)`,
    [itemIds]
  );
  return rows.length === itemIds.length;
}

export async function POST(req: Request) {
  try {
    const auth = await requirePermission(req, "order.create");
    const body = (await req.json().catch(() => null)) as OrderBody | null;
    const tableNo = String(body?.tableNo || "").trim();
    if (!tableNo) {
      return NextResponse.json({ error: "缺少桌号" }, { status: 400 });
    }

    const items = parseItems(body?.items);
    const itemIds = items.map((item) => item.menuItemId);
    const uniqueItemIds = Array.from(new Set(itemIds));
    const qtyList = items.map((item) => item.qty);
    const noteList = items.map((item) => item.note);
    const validItems = await validateMenuItems(uniqueItemIds);
    if (!validItems) {
      return NextResponse.json({ error: "存在无效或已下架菜品" }, { status: 400 });
    }

    const requestIdRaw = req.headers.get("x-idempotency-key") || "";
    const requestId = requestIdRaw.trim();
    if (requestId && !IDEMPOTENCY_KEY.test(requestId)) {
      return NextResponse.json({ error: "请求幂等键格式错误" }, { status: 400 });
    }

    let createdOrderId = "";
    let deduped = false;
    let createdNewOrder = false;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const session = await client.query<{ id: string }>(
        `SELECT id
         FROM table_sessions
         WHERE table_no = $1
           AND closed_at IS NULL
         FOR UPDATE`,
        [tableNo]
      );
      if (session.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "该桌未开台，请先开台" }, { status: 400 });
      }

      if (requestId) {
        const orderRes = await client.query<{ id: string; inserted: boolean }>(
          `INSERT INTO orders (table_no, waiter_id, status, client_request_id)
           VALUES ($1, $2, 'submitted', $3)
           ON CONFLICT (waiter_id, client_request_id)
           WHERE client_request_id IS NOT NULL
           DO UPDATE SET client_request_id = EXCLUDED.client_request_id
           RETURNING id, (xmax = 0) AS inserted`,
          [tableNo, auth.userId, requestId]
        );
        createdOrderId = orderRes.rows[0].id;
        createdNewOrder = Boolean(orderRes.rows[0].inserted);
        deduped = !createdNewOrder;
      } else {
        const orderRes = await client.query<{ id: string }>(
          `INSERT INTO orders (table_no, waiter_id, status, client_request_id)
           VALUES ($1, $2, 'submitted', NULL)
           RETURNING id`,
          [tableNo, auth.userId]
        );
        createdOrderId = orderRes.rows[0].id;
        createdNewOrder = true;
      }

      if (createdNewOrder) {
        await client.query(
          `INSERT INTO order_items (order_id, menu_item_id, qty, note)
           SELECT $1, x.menu_item_id::uuid, x.qty::int, NULLIF(x.note, '')
           FROM UNNEST($2::text[], $3::int[], $4::text[]) AS x(menu_item_id, qty, note)`,
          [createdOrderId, itemIds, qtyList, noteList.map((note) => note || "")]
        );

        await client.query(
          `INSERT INTO order_events (order_id, event_type, payload, created_by)
           VALUES ($1, 'created', jsonb_build_object('itemCount', $2::int), $3)`,
          [createdOrderId, items.length, auth.userId]
        );

        await client.query(
          `INSERT INTO print_jobs (order_id, status, retry_count)
           VALUES ($1, 'pending', 0)
           ON CONFLICT (order_id) DO UPDATE
           SET status = CASE WHEN print_jobs.status = 'printed' THEN print_jobs.status ELSE 'pending' END,
               updated_at = now()`,
          [createdOrderId]
        );
      }
      if (deduped) {
        await client.query(
          `INSERT INTO print_jobs (order_id, status, retry_count)
           VALUES ($1, 'pending', 0)
           ON CONFLICT (order_id) DO UPDATE
           SET status = CASE WHEN print_jobs.status = 'printed' THEN print_jobs.status ELSE 'pending' END,
               updated_at = now()`,
          [createdOrderId]
        );
      }

      await client.query("COMMIT");
      // In serverless environments, fire-and-forget is unreliable.
      // Await one quick worker pass so current order has deterministic print attempt.
      await runPrintWorker(1).catch(() => undefined);
      await writeAuditLogSafe({
        actorUserId: auth.userId,
        action: deduped ? "order.submit_deduped" : "order.submit",
        entityType: "order",
        entityId: createdOrderId,
        detail: { tableNo, itemCount: items.length, deduped },
        req
      });
      return NextResponse.json({ orderId: createdOrderId, deduped });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    if (err.message === "INVALID_ITEMS") {
      return NextResponse.json({ error: "菜品参数无效" }, { status: 400 });
    }
    return NextResponse.json({ error: "提交失败" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const auth = await requirePermission(req, "report.orders");
    const url = new URL(req.url);
    const mine = url.searchParams.get("mine") === "1";

    const { rows } = await pool.query(
      `SELECT o.id, o.table_no, o.status, o.created_at
       FROM orders o
       ${mine ? "WHERE o.waiter_id = $1" : ""}
       ORDER BY o.created_at DESC
       LIMIT 50`,
      mine ? [auth.userId] : []
    );

    return NextResponse.json({ orders: rows });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}
