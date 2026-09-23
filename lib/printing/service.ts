import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../db";
import { enqueueDelivery, type Delivery, type QueueDb } from "./queue";
import { renderOrderTicket, renderBillTicket, renderTestTicket, type BillTicketPayload } from "./tickets";
import { XpyunTransport } from "./transport";

export function printerConfigured() {
  try { XpyunTransport.fromEnvironment(); return true; } catch { return false; }
}

export async function queryPrimaryPrinterStatus() {
  const started = Date.now();
  let status: "online" | "offline" | "degraded" | "unknown" = "unknown";
  try { status = await XpyunTransport.fromEnvironment().printerStatus(); } catch { /* Configuration shown separately. */ }
  return { status, checkedAt: new Date().toISOString(), latencyMs: Date.now() - started };
}

export async function prepareOrderDelivery(tx: QueueDb, orderId: string) {
  const { rows } = await tx.query<{
    table_no: string; created_at: string; waiter: string | null; name: string;
    price: number; qty: number; note: string | null;
  }>(
    `SELECT o.table_no, o.created_at, u.username AS waiter, m.name,
            COALESCE(i.unit_price, m.price) AS price, i.qty, i.note
     FROM orders o JOIN order_items i ON i.order_id = o.id
     JOIN menu_items m ON m.id = i.menu_item_id LEFT JOIN users u ON u.id = o.waiter_id
     WHERE o.id = $1 ORDER BY m.category ASC NULLS FIRST, m.name, i.id`, [orderId]
  );
  if (!rows.length) throw new Error("打印订单不存在");
  const snapshot = { tableNo: rows[0].table_no, createdAt: rows[0].created_at, waiter: rows[0].waiter,
    items: rows.map(row => ({ name: row.name, unitPrice: Number(row.price), qty: Number(row.qty), note: row.note })) };
  return enqueueDelivery(tx, { kind: "order", intentKey: orderId, orderId,
    printerSn: XpyunTransport.fromEnvironment().sn, content: renderOrderTicket(snapshot), snapshot });
}

export async function findReceiptDelivery(tx: QueueDb, actor: string, requestId: string) {
  const { rows } = await tx.query<Delivery>(
    `SELECT * FROM print_deliveries WHERE kind = 'receipt' AND intent_key = $1`, [`${actor}:${requestId}`]
  );
  return rows[0] || null;
}

export async function prepareReceiptDelivery(tx: PoolClient, actor: string, requestId: string, tableNo: string, sessionId?: string) {
  // Serialize duplicate requests before taking a new bill snapshot. Later menu
  // changes, new orders and the receipt's timestamp must not alter an old intent.
  await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`receipt:${actor}:${requestId}`]);
  const existing = await findReceiptDelivery(tx, actor, requestId);
  if (existing) {
    const snapshot = existing.snapshot as { tableNo?: string; sessionId?: string };
    if (snapshot.tableNo !== tableNo || sessionId && snapshot.sessionId !== sessionId) throw new Error("打印请求与桌台不匹配");
    return existing;
  }
  const { rows: [session] } = await tx.query<{ id: string; opened_at: string }>(
    `SELECT id, opened_at FROM table_sessions WHERE table_no = $1 AND closed_at IS NULL FOR SHARE`, [tableNo]
  );
  if (!session || sessionId && session.id !== sessionId) throw new Error("桌台已变更，请刷新后重试");
  const { rows: [bill] } = await tx.query<{
    items: Array<{ name: string; qty: number; price: number; amount: number; note: string | null }>;
    charges: Array<{ charge_type: string; amount: number }>;
  }>(
    `WITH active_orders AS (
       SELECT id FROM orders WHERE table_no = $1 AND created_at >= $2
       AND status IN ('submitted', 'paid') AND cancelled_at IS NULL AND merged_into_order_id IS NULL
     ) SELECT
       (SELECT COALESCE(json_agg(x), '[]'::json) FROM (
         SELECT m.name, i.note, SUM(i.qty)::int AS qty,
           COALESCE(i.unit_price, m.price)::int AS price,
           SUM(i.qty * COALESCE(i.unit_price, m.price))::int AS amount
         FROM active_orders o JOIN order_items i ON i.order_id = o.id JOIN menu_items m ON m.id = i.menu_item_id
         GROUP BY m.name, i.note, COALESCE(i.unit_price, m.price) ORDER BY m.name, i.note NULLS FIRST
       ) x) AS items,
       (SELECT COALESCE(json_agg(x), '[]'::json) FROM (
         SELECT c.charge_type, SUM(c.amount)::int AS amount FROM order_charges c
         JOIN active_orders o ON o.id = c.order_id GROUP BY c.charge_type ORDER BY c.charge_type
       ) x) AS charges`, [tableNo, session.opened_at]
  );
  if (!bill?.items.length) throw new Error("暂无可打印账单");
  const items = bill.items.map(item => ({ name: item.name, note: item.note, qty: Number(item.qty),
    unitPrice: Number(item.price), amount: Number(item.amount) }));
  const labels: Record<string, string> = { discount: "DISCOUNT", service_fee: "SERVICE FEE", tax: "TAX" };
  const charges = bill.charges.map(charge => ({ label: labels[charge.charge_type] || "ADJUSTMENT", amount: Number(charge.amount) }));
  const itemAmount = items.reduce((sum, item) => sum + item.amount, 0);
  const chargeAmount = charges.reduce((sum, charge) => sum + charge.amount, 0);
  const snapshot: BillTicketPayload & { sessionId: string } = { tableNo, sessionId: session.id,
    openedAt: session.opened_at, printedAt: new Date().toISOString(), items,
    totalQty: items.reduce((sum, item) => sum + item.qty, 0), itemAmount, chargeAmount,
    totalAmount: itemAmount + chargeAmount, charges };
  return enqueueDelivery(tx, { kind: "receipt", intentKey: `${actor}:${requestId}`,
    printerSn: XpyunTransport.fromEnvironment().sn, content: renderBillTicket(snapshot), snapshot });
}

export async function prepareTestDelivery(tx: QueueDb, intentKey = randomUUID()) {
  const snapshot = { tableNo: "TEST", generatedAt: new Date().toISOString(),
    tickets: [{ target: "kitchen" as const, items: [{ name: "PRINTER TEST - DO NOT PREPARE FOOD", qty: 1, note: "RESORT DEJA VU" }] }] };
  return enqueueDelivery(tx, { kind: "self_test", intentKey, printerSn: XpyunTransport.fromEnvironment().sn,
    content: renderTestTicket(snapshot), snapshot });
}

export async function deliveryState(id: string) {
  const { rows } = await pool.query<{ status: string }>(`SELECT status FROM print_deliveries WHERE id = $1`, [id]);
  return rows[0]?.status || null;
}
