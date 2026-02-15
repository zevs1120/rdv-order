import { NextResponse } from "next/server";
import { pool } from "../../../../../lib/db";
import { requirePermission } from "../../../../../lib/permissions";
import { getOrderFinance } from "../../../../../lib/order-finance";
import { writeAuditLogSafe } from "../../../../../lib/audit";

type Params = { params: Promise<{ id: string }> };
type ChargeType = "discount" | "service_fee" | "tax";
type ChargeMode = "amount" | "percent";
const UUID_V4_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: Params) {
  try {
    const auth = await requirePermission(req, "order.adjust_charge");
    const { id } = await params;
    const body = await req.json().catch(() => null) as {
      ruleId?: unknown;
      type?: unknown;
      mode?: unknown;
      value?: unknown;
      note?: unknown;
    } | null;

    const ruleId = String(body?.ruleId || "").trim();
    let selectedRuleId: string | null = null;
    let source: "manual" | "rule_auto" = "manual";
    let type = String(body?.type || "").trim() as ChargeType;
    let mode = String(body?.mode || "amount").trim() as ChargeMode;
    let value = Number(body?.value);
    const note = String(body?.note || "").trim();

    if (!id || !UUID_V4_LIKE.test(id)) {
      return NextResponse.json({ error: "缺少订单 ID" }, { status: 400 });
    }
    if (ruleId) {
      const rule = await pool.query<{
        id: string;
        charge_type: ChargeType;
        mode: ChargeMode;
        value: number;
        is_active: boolean;
      }>(
        `SELECT id, charge_type, mode, value, is_active
         FROM pricing_rules
         WHERE id = $1`,
        [ruleId]
      );
      if (rule.rows.length === 0) {
        return NextResponse.json({ error: "规则不存在" }, { status: 404 });
      }
      if (!rule.rows[0].is_active) {
        return NextResponse.json({ error: "规则未启用" }, { status: 409 });
      }
      selectedRuleId = rule.rows[0].id;
      source = "rule_auto";
      type = rule.rows[0].charge_type;
      mode = rule.rows[0].mode;
      value = rule.rows[0].value;
    } else {
      if (!["discount", "service_fee", "tax"].includes(type)) {
        return NextResponse.json({ error: "费用类型无效" }, { status: 400 });
      }
      if (!["amount", "percent"].includes(mode)) {
        return NextResponse.json({ error: "费用模式无效" }, { status: 400 });
      }
      if (!Number.isInteger(value) || value <= 0) {
        const activeRule = await pool.query<{
          id: string;
          mode: ChargeMode;
          value: number;
        }>(
          `SELECT id, mode, value
           FROM pricing_rules
           WHERE charge_type = $1
             AND is_active = true
           ORDER BY sort_order ASC, created_at ASC
           LIMIT 1`,
          [type]
        );
        if (activeRule.rows.length === 0) {
          return NextResponse.json({ error: "数值无效，且无启用规则可用" }, { status: 400 });
        }
        selectedRuleId = activeRule.rows[0].id;
        source = "rule_auto";
        mode = activeRule.rows[0].mode;
        value = activeRule.rows[0].value;
      }
    }

    const orderRes = await pool.query<{ id: string; status: string }>(
      `SELECT id, status
       FROM orders
       WHERE id = $1`,
      [id]
    );
    if (orderRes.rows.length === 0) {
      return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    }
    if (orderRes.rows[0].status !== "submitted") {
      return NextResponse.json({ error: "仅未结账订单可调整费用" }, { status: 409 });
    }

    const finance = await getOrderFinance(id);
    if (!finance) {
      return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    }

    const amountRaw = mode === "percent"
      ? Math.round((finance.itemAmount * value) / 100)
      : value;
    const amount = type === "discount" ? -amountRaw : amountRaw;

    if (type === "discount" && Math.abs(amount) > finance.itemAmount) {
      return NextResponse.json({ error: "折扣不能超过菜品金额" }, { status: 400 });
    }

    await pool.query(
      `INSERT INTO order_charges (order_id, charge_type, mode, value, amount, note, created_by, rule_id, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (order_id, rule_id, source)
       WHERE rule_id IS NOT NULL
       DO UPDATE SET amount = EXCLUDED.amount,
                     note = EXCLUDED.note,
                     mode = EXCLUDED.mode,
                     value = EXCLUDED.value`,
      [id, type, mode, value, amount, note || null, auth.userId, selectedRuleId, source]
    );

    await pool.query(
      `INSERT INTO order_events (order_id, event_type, payload, created_by)
       VALUES ($1, $2, jsonb_build_object('mode', $3, 'value', $4, 'amount', $5, 'note', $6), $7)`,
      [id, type === "discount" ? "discount" : type === "tax" ? "tax" : "service_fee", mode, value, amount, note || null, auth.userId]
    );

    const after = await getOrderFinance(id);
    await writeAuditLogSafe({
      actorUserId: auth.userId,
      action: type === "discount" ? "order.discount" : type === "service_fee" ? "order.service_fee" : "order.tax",
      entityType: "order",
      entityId: id,
      detail: { mode, value, amount, note, ruleId: selectedRuleId, source },
      req
    });

    return NextResponse.json({
      ok: true,
      orderId: id,
      itemAmount: after?.itemAmount ?? finance.itemAmount,
      chargeAmount: after?.chargeAmount ?? finance.chargeAmount,
      totalAmount: after?.totalAmount ?? finance.totalAmount
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "调整费用失败" }, { status: 500 });
  }
}
