import type { PoolClient } from "pg";

type ChargeType = "discount" | "service_fee" | "tax";
type ChargeMode = "amount" | "percent";

export async function replaceAutoChargesForOrder(
  client: PoolClient,
  orderId: string,
  actorUserId: string
) {
  try {
    await client.query(
      `DELETE FROM order_charges
       WHERE order_id = $1
         AND source = 'rule_auto'`,
      [orderId]
    );

    const finance = await client.query<{ item_amount: number }>(
      `SELECT COALESCE(SUM(oi.qty * COALESCE(oi.unit_price, mi.price)), 0)::int AS item_amount
       FROM order_items oi
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE oi.order_id = $1`,
      [orderId]
    );
    const itemAmount = Number(finance.rows[0]?.item_amount || 0);
    if (itemAmount <= 0) return;

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
      // Backward compatibility for schemas missing pricing tables.
      return;
    }
    throw err;
  }
}
