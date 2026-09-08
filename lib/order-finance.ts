import { pool } from "./db";

export type OrderFinanceRow = {
  orderId: string;
  itemAmount: number;
  chargeAmount: number;
  totalAmount: number;
};

export async function getOrderFinance(orderId: string) {
  const { rows } = await pool.query<{
    order_id: string;
    item_amount: number;
    charge_amount: number;
    total_amount: number;
  }>(
    `WITH item_amount AS (
       SELECT o.id AS order_id, COALESCE(SUM(oi.qty * COALESCE(oi.unit_price, mi.price)), 0)::int AS item_amount
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE o.id = $1
       GROUP BY o.id
     ),
     charge_amount AS (
       SELECT oc.order_id, COALESCE(SUM(oc.amount), 0)::int AS charge_amount
       FROM order_charges oc
       WHERE oc.order_id = $1
       GROUP BY oc.order_id
     )
     SELECT ia.order_id,
            ia.item_amount,
            COALESCE(ca.charge_amount, 0)::int AS charge_amount,
            (ia.item_amount + COALESCE(ca.charge_amount, 0))::int AS total_amount
     FROM item_amount ia
     LEFT JOIN charge_amount ca ON ca.order_id = ia.order_id`,
    [orderId]
  );

  if (rows.length === 0) {
    return null;
  }

  return {
    orderId: rows[0].order_id,
    itemAmount: rows[0].item_amount,
    chargeAmount: rows[0].charge_amount,
    totalAmount: rows[0].total_amount
  } satisfies OrderFinanceRow;
}
