import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { requireOrderCreate, requirePermission } from "../../../lib/permissions";
import { parseItems } from "../../../lib/orders-utils";

type OrderBody = {
  tableNo?: unknown;
  items?: unknown;
};

const IDEMPOTENCY_KEY = /^[a-zA-Z0-9_-]{8,80}$/;

export async function POST(req: Request) {
  try {
    const auth = await requireOrderCreate(req);
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

    const requestIdRaw = req.headers.get("x-idempotency-key") || "";
    const requestId = requestIdRaw.trim() || null;
    if (requestId && !IDEMPOTENCY_KEY.test(requestId)) {
      return NextResponse.json({ error: "请求幂等键格式错误" }, { status: 400 });
    }

    const { rows } = await pool.query<{
      session_open: boolean;
      valid_items: boolean;
      order_id: string | null;
      inserted: boolean | null;
    }>(
      `WITH input_items AS (
         SELECT *
         FROM UNNEST($4::uuid[], $5::int[], $6::text[]) AS x(menu_item_id, qty, note)
       ),
       session_ok AS (
         SELECT 1
         FROM table_sessions
         WHERE table_no = $1
           AND closed_at IS NULL
         LIMIT 1
       ),
       valid_menu AS (
         SELECT COUNT(DISTINCT id)::int AS count
         FROM menu_items
         WHERE id = ANY($4::uuid[])
           AND (is_active = true OR is_temporary = true)
       ),
       created_order AS (
         INSERT INTO orders (table_no, waiter_id, status, client_request_id)
         SELECT $1, $2, 'submitted', $3
         WHERE EXISTS (SELECT 1 FROM session_ok)
           AND (SELECT count FROM valid_menu) = $7
         ON CONFLICT (waiter_id, client_request_id)
         WHERE client_request_id IS NOT NULL
         DO UPDATE SET client_request_id = EXCLUDED.client_request_id
         RETURNING id, (xmax = 0) AS inserted
       ),
       inserted_items AS (
         INSERT INTO order_items (order_id, menu_item_id, qty, note)
         SELECT co.id, ii.menu_item_id, ii.qty, NULLIF(ii.note, '')
         FROM created_order co
         JOIN input_items ii ON co.inserted = true
         RETURNING 1
       ),
       queued_print AS (
         INSERT INTO print_jobs (order_id, status, retry_count)
         SELECT id, 'pending', 0
         FROM created_order
         WHERE inserted = true
         ON CONFLICT (order_id) DO NOTHING
         RETURNING 1
       )
       SELECT
         EXISTS (SELECT 1 FROM session_ok) AS session_open,
         ((SELECT count FROM valid_menu) = $7) AS valid_items,
         (SELECT id FROM created_order) AS order_id,
         (SELECT inserted FROM created_order) AS inserted`,
      [
        tableNo,
        auth.userId,
        requestId,
        itemIds,
        qtyList,
        noteList.map((note) => note || ""),
        uniqueItemIds.length
      ]
    );

    const result = rows[0];
    if (!result?.session_open) {
      return NextResponse.json({ error: "该桌未开台，请先开台" }, { status: 400 });
    }
    if (!result.valid_items) {
      return NextResponse.json({ error: "存在无效或已下架菜品" }, { status: 400 });
    }
    if (!result.order_id) {
      return NextResponse.json({ error: "提交失败" }, { status: 500 });
    }

    const deduped = result.inserted === false;
    return NextResponse.json({
      orderId: result.order_id,
      deduped,
      dedupeReason: deduped ? "idempotency" : "none"
    });
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
