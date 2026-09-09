import type { PoolClient } from "pg";

export function checkoutTaxAmount(baseAmount: number, rule: { mode: string; value: number }) {
  return rule.mode === "percent" ? Math.round((baseAmount * rule.value) / 100) : rule.value;
}

/** Projects the existing checkout tax rules without writing charges or changing order status. */
export async function getCheckoutQuote(client: PoolClient, session: { id: string; table_no: string; opened_at: string }) {
  const orders = await client.query<{
    id: string; status: string; base_amount: number; auto_rule_ids: string[];
  }>(
    `SELECT o.id, o.status,
       (COALESCE((SELECT SUM(oi.qty * COALESCE(oi.unit_price, mi.price))
         FROM order_items oi JOIN menu_items mi ON mi.id = oi.menu_item_id WHERE oi.order_id = o.id), 0)
         + COALESCE((SELECT SUM(oc.amount) FROM order_charges oc WHERE oc.order_id = o.id), 0))::int AS base_amount,
       ARRAY(SELECT oc.rule_id::text FROM order_charges oc
         WHERE oc.order_id = o.id AND oc.source = 'rule_auto' AND oc.rule_id IS NOT NULL) AS auto_rule_ids
     FROM orders o
     WHERE o.table_no = $1 AND o.created_at >= $2
       AND o.status IN ('submitted', 'preparing', 'served', 'paid', 'closed')
       AND o.cancelled_at IS NULL AND o.merged_into_order_id IS NULL`,
    [session.table_no, session.opened_at]
  );
  const rules = await client.query<{ id: string; mode: string; value: number }>(
    `SELECT id, mode, value FROM pricing_rules
     WHERE is_active = true AND charge_type = 'tax' ORDER BY sort_order ASC, created_at ASC`
  );
  let totalAmount = 0;
  for (const order of orders.rows) {
    totalAmount += order.base_amount;
    if (order.status === "closed" || order.base_amount <= 0) continue;
    for (const rule of rules.rows) {
      if (!order.auto_rule_ids.includes(rule.id)) totalAmount += checkoutTaxAmount(order.base_amount, rule);
    }
  }
  return {
    tableNo: session.table_no, sessionId: session.id, openedAt: session.opened_at,
    totalAmount, orderCount: orders.rows.length
  };
}
