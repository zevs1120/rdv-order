import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";
import { writeAuditLogSafe } from "../../../../lib/audit";

type ChargeType = "discount" | "service_fee" | "tax";
type ChargeMode = "amount" | "percent";

type RuleInput = {
  id?: unknown;
  name?: unknown;
  charge_type?: unknown;
  mode?: unknown;
  value?: unknown;
  is_active?: unknown;
  sort_order?: unknown;
};

type NormalizedRule = {
  id: string;
  name: string;
  chargeType: ChargeType;
  mode: ChargeMode;
  value: number;
  isActive: boolean;
  sortOrder: number;
};

const UUID_V4_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (text === "true" || text === "1") return true;
    if (text === "false" || text === "0" || text === "") return false;
  }
  return Boolean(value);
}

function normalizeRuleInput(rule: RuleInput): NormalizedRule | null {
  const id = String(rule.id || "").trim();
  const name = String(rule.name || "").trim();
  const chargeType = String(rule.charge_type || "").trim() as ChargeType;
  const mode = String(rule.mode || "").trim() as ChargeMode;
  const value = Number(rule.value);
  const isActive = normalizeBoolean(rule.is_active);
  const sortOrder = Number(rule.sort_order || 0);

  if (!name) return null;
  if (!["discount", "service_fee", "tax"].includes(chargeType)) return null;
  if (!["amount", "percent"].includes(mode)) return null;
  if (!Number.isInteger(value) || value <= 0) return null;

  return {
    id,
    name,
    chargeType,
    mode,
    value,
    isActive,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0
  };
}

async function applyRuleToOpenOrders(
  client: Awaited<ReturnType<typeof pool.connect>>,
  actorUserId: string,
  rule: {
    id: string;
    chargeType: ChargeType;
    mode: ChargeMode;
    value: number;
  }
) {
  const note = rule.chargeType === "discount"
    ? "auto discount"
    : rule.chargeType === "service_fee"
      ? "auto service fee"
      : "auto tax";

  await client.query(
    `WITH order_base AS (
       SELECT o.id AS order_id,
              COALESCE(SUM(oi.qty * mi.price), 0)::int AS item_amount
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE o.status IN ('submitted', 'paid')
         AND o.cancelled_at IS NULL
         AND o.merged_into_order_id IS NULL
       GROUP BY o.id
     )
     INSERT INTO order_charges (
       order_id,
       charge_type,
       mode,
       value,
       amount,
       note,
       created_by,
       rule_id,
       source
     )
     SELECT ob.order_id,
            $2,
            $3,
            $4,
            CASE
              WHEN $2 = 'discount' THEN -LEAST(
                CASE
                  WHEN $3 = 'percent' THEN ROUND((ob.item_amount::numeric * $4::numeric) / 100.0)::int
                  ELSE $4::int
                END,
                ob.item_amount
              )
              ELSE CASE
                WHEN $3 = 'percent' THEN ROUND((ob.item_amount::numeric * $4::numeric) / 100.0)::int
                ELSE $4::int
              END
            END,
            $5,
            $6,
            $1,
            'rule_auto'
     FROM order_base ob
     WHERE ob.item_amount > 0
     ON CONFLICT (order_id, rule_id, source)
     WHERE rule_id IS NOT NULL
     DO UPDATE
     SET charge_type = EXCLUDED.charge_type,
         mode = EXCLUDED.mode,
         value = EXCLUDED.value,
         amount = EXCLUDED.amount,
         note = EXCLUDED.note`,
    [rule.id, rule.chargeType, rule.mode, rule.value, note, actorUserId]
  );
}

async function removeRuleFromOpenOrders(
  client: Awaited<ReturnType<typeof pool.connect>>,
  ruleId: string
) {
  await client.query(
    `DELETE FROM order_charges oc
     USING orders o
     WHERE oc.order_id = o.id
       AND oc.rule_id = $1
       AND oc.source = 'rule_auto'
       AND o.status IN ('submitted', 'paid')
       AND o.cancelled_at IS NULL
       AND o.merged_into_order_id IS NULL`,
    [ruleId]
  );
}

export async function GET(req: Request) {
  try {
    await requirePermission(req, "cashier.close_shift");
    const { rows } = await pool.query(
      `SELECT id, name, charge_type, mode, value, is_active, sort_order, updated_at
       FROM pricing_rules
       ORDER BY sort_order ASC, created_at ASC`
    );
    return NextResponse.json({ rules: rows });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "规则查询失败" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requirePermission(req, "cashier.close_shift");
    const body = await req.json().catch(() => null) as {
      rules?: RuleInput[];
    } | null;

    const rawRules = Array.isArray(body?.rules) ? body.rules : [];
    if (rawRules.length === 0) {
      return NextResponse.json({ error: "缺少规则数据" }, { status: 400 });
    }
    const rules = rawRules
      .map(normalizeRuleInput)
      .filter((item): item is NormalizedRule => Boolean(item));
    if (rules.length === 0) {
      return NextResponse.json({ error: "规则参数无效" }, { status: 400 });
    }
    let affectedRuleIds: string[] = [];

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const rule of rules) {
        let savedRuleId = rule.id;
        if (savedRuleId && UUID_V4_LIKE.test(savedRuleId)) {
          const updated = await client.query<{ id: string }>(
            `UPDATE pricing_rules
             SET name = $2,
                 charge_type = $3,
                 mode = $4,
                 value = $5,
                 is_active = $6,
                 sort_order = $7,
                 updated_at = now()
             WHERE id = $1
             RETURNING id`,
            [savedRuleId, rule.name, rule.chargeType, rule.mode, rule.value, rule.isActive, rule.sortOrder]
          );
          if (updated.rows[0]?.id) {
            savedRuleId = updated.rows[0].id;
          } else {
            savedRuleId = "";
          }
        }
        if (!savedRuleId) {
          const inserted = await client.query<{ id: string }>(
            `INSERT INTO pricing_rules (name, charge_type, mode, value, is_active, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [rule.name, rule.chargeType, rule.mode, rule.value, rule.isActive, rule.sortOrder]
          );
          savedRuleId = inserted.rows[0]?.id || "";
        }
        if (!savedRuleId) continue;

        affectedRuleIds.push(savedRuleId);
        if (rule.isActive) {
          await applyRuleToOpenOrders(client, auth.userId, {
            id: savedRuleId,
            chargeType: rule.chargeType,
            mode: rule.mode,
            value: rule.value
          });
        } else {
          await removeRuleFromOpenOrders(client, savedRuleId);
        }
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    await writeAuditLogSafe({
      actorUserId: auth.userId,
      action: "pricing.rules_update",
      entityType: "pricing_rules",
      entityId: "batch",
      detail: { count: rules.length },
      req
    });

    const refreshed = await pool.query(
      `SELECT id, name, charge_type, mode, value, is_active, sort_order, updated_at
       FROM pricing_rules
       ORDER BY sort_order ASC, created_at ASC`
    );

    return NextResponse.json({ ok: true, rules: refreshed.rows, affectedRuleIds });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "规则保存失败" }, { status: 500 });
  }
}
