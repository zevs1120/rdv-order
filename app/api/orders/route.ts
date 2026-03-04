import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
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
const ORDER_DEDUPE_WINDOW_DEFAULT_SECONDS = 8;
type ChargeType = "discount" | "service_fee" | "tax";
type ChargeMode = "amount" | "percent";

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

function normalizeNote(value: string | null) {
  return String(value || "").trim().toLowerCase();
}

function buildItemSignature(items: OrderItemInput[]) {
  return items
    .map((item) => `${item.menuItemId}:${item.qty}:${normalizeNote(item.note)}`)
    .sort()
    .join("|");
}

function getOrderDedupeWindowSeconds() {
  const raw = Number(process.env.ORDER_DEDUPE_WINDOW_SECONDS || ORDER_DEDUPE_WINDOW_DEFAULT_SECONDS);
  if (!Number.isFinite(raw)) return ORDER_DEDUPE_WINDOW_DEFAULT_SECONDS;
  return Math.min(20, Math.max(3, Math.round(raw)));
}

async function findRecentDuplicateOrder(
  client: PoolClient,
  waiterId: string,
  tableNo: string,
  items: OrderItemInput[],
  windowSeconds: number
) {
  const incomingSignature = buildItemSignature(items);
  if (!incomingSignature) return null;
  const { rows } = await client.query<{ id: string; signature: string }>(
    `SELECT o.id,
            string_agg(
              oi.menu_item_id::text || ':' || oi.qty::text || ':' || lower(btrim(COALESCE(oi.note, ''))),
              '|' ORDER BY oi.menu_item_id::text, lower(btrim(COALESCE(oi.note, ''))), oi.qty
            ) AS signature
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.waiter_id = $1
       AND o.table_no = $2
       AND o.cancelled_at IS NULL
       AND o.merged_into_order_id IS NULL
       AND o.created_at >= now() - ($3::int * INTERVAL '1 second')
     GROUP BY o.id, o.created_at
     ORDER BY o.created_at DESC
     LIMIT 12`,
    [waiterId, tableNo, windowSeconds]
  );

  const hit = rows.find((row) => row.signature === incomingSignature);
  return hit?.id || null;
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

async function applyActivePricingRulesToOrder(
  client: PoolClient,
  orderId: string,
  actorUserId: string
) {
  try {
    const rulesRes = await client.query<{
      id: string;
      charge_type: ChargeType;
      mode: ChargeMode;
      value: number;
    }>(
      `SELECT id, charge_type, mode, value
       FROM pricing_rules
       WHERE is_active = true
       ORDER BY sort_order ASC, created_at ASC`
    );

    if (rulesRes.rows.length === 0) return;

    const finance = await client.query<{ item_amount: number }>(
      `SELECT COALESCE(SUM(oi.qty * mi.price), 0)::int AS item_amount
       FROM order_items oi
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE oi.order_id = $1`,
      [orderId]
    );
    const itemAmount = Number(finance.rows[0]?.item_amount || 0);
    if (itemAmount <= 0) return;

    for (const rule of rulesRes.rows) {
      const amountRaw = rule.mode === "percent"
        ? Math.round((itemAmount * rule.value) / 100)
        : rule.value;
      const amount = rule.charge_type === "discount"
        ? -Math.min(amountRaw, itemAmount)
        : amountRaw;
      const note = rule.charge_type === "discount"
        ? "auto discount"
        : rule.charge_type === "service_fee"
          ? "auto service fee"
          : "auto tax";

      await client.query(
        `INSERT INTO order_charges (order_id, charge_type, mode, value, amount, note, created_by, rule_id, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'rule_auto')
         ON CONFLICT (order_id, rule_id, source)
         WHERE rule_id IS NOT NULL
         DO UPDATE SET charge_type = EXCLUDED.charge_type,
                       mode = EXCLUDED.mode,
                       value = EXCLUDED.value,
                       amount = EXCLUDED.amount,
                       note = EXCLUDED.note`,
        [orderId, rule.charge_type, rule.mode, rule.value, amount, note, actorUserId, rule.id]
      );
    }
  } catch (err: any) {
    if (err?.code === "42P01") {
      // Backward compatibility for old schemas missing pricing tables.
      return;
    }
    throw err;
  }
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
    let dedupeReason: "none" | "idempotency" | "recent_duplicate" = "none";
    let shouldKickPrintWorker = false;

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
        const existingByRequest = await client.query<{ id: string }>(
          `SELECT id
           FROM orders
           WHERE waiter_id = $1
             AND client_request_id = $2
           LIMIT 1
           FOR UPDATE`,
          [auth.userId, requestId]
        );
        if (existingByRequest.rows[0]?.id) {
          createdOrderId = existingByRequest.rows[0].id;
          createdNewOrder = false;
          deduped = true;
          dedupeReason = "idempotency";
        }
      }

      if (!createdOrderId) {
        const recentDuplicateOrderId = await findRecentDuplicateOrder(
          client,
          auth.userId,
          tableNo,
          items,
          getOrderDedupeWindowSeconds()
        );
        if (recentDuplicateOrderId) {
          createdOrderId = recentDuplicateOrderId;
          createdNewOrder = false;
          deduped = true;
          dedupeReason = "recent_duplicate";
        }
      }

      if (!createdOrderId && requestId) {
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
        dedupeReason = deduped ? "idempotency" : "none";
      } else if (!createdOrderId) {
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

        await applyActivePricingRulesToOrder(client, createdOrderId, auth.userId);

        await client.query(
          `INSERT INTO order_events (order_id, event_type, payload, created_by)
           VALUES ($1, 'created', jsonb_build_object('itemCount', $2::int), $3)`,
          [createdOrderId, items.length, auth.userId]
        );

        await client.query(
          `INSERT INTO print_jobs (order_id, status, retry_count)
           VALUES ($1, 'pending', 0)
           ON CONFLICT (order_id) DO UPDATE
           SET status = CASE
                          WHEN print_jobs.status IN ('printed', 'printing') THEN print_jobs.status
                          ELSE 'pending'
                        END,
               updated_at = now()`,
          [createdOrderId]
        );
        shouldKickPrintWorker = true;
      }
      if (deduped && dedupeReason === "idempotency") {
        const ensurePrintJob = await client.query<{ id: string }>(
          `INSERT INTO print_jobs (order_id, status, retry_count)
           VALUES ($1, 'pending', 0)
           ON CONFLICT (order_id) DO NOTHING
           RETURNING id`,
          [createdOrderId]
        );
        shouldKickPrintWorker = ensurePrintJob.rows.length > 0;
      }

      await client.query("COMMIT");
      // In serverless environments, fire-and-forget is unreliable.
      // Await one quick worker pass so current order has deterministic print attempt.
      if (shouldKickPrintWorker) {
        await runPrintWorker(1).catch(() => undefined);
      }
      await writeAuditLogSafe({
        actorUserId: auth.userId,
        action: deduped ? "order.submit_deduped" : "order.submit",
        entityType: "order",
        entityId: createdOrderId,
        detail: { tableNo, itemCount: items.length, deduped, dedupeReason },
        req
      });
      return NextResponse.json({ orderId: createdOrderId, deduped, dedupeReason });
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
