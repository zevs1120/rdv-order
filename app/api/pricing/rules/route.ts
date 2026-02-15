import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";
import { writeAuditLogSafe } from "../../../../lib/audit";

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
      rules?: Array<{
        id?: unknown;
        name?: unknown;
        charge_type?: unknown;
        mode?: unknown;
        value?: unknown;
        is_active?: unknown;
        sort_order?: unknown;
      }>;
    } | null;

    const rules = Array.isArray(body?.rules) ? body.rules : [];
    if (rules.length === 0) {
      return NextResponse.json({ error: "缺少规则数据" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const rule of rules) {
        const id = String(rule.id || "").trim();
        const name = String(rule.name || "").trim();
        const chargeType = String(rule.charge_type || "").trim();
        const mode = String(rule.mode || "").trim();
        const value = Number(rule.value);
        const isActive = Boolean(rule.is_active);
        const sortOrder = Number(rule.sort_order || 0);

        if (!id || !name || !["discount", "service_fee", "tax"].includes(chargeType) || !["amount", "percent"].includes(mode)) {
          continue;
        }
        if (!Number.isInteger(value) || value <= 0) {
          continue;
        }

        await client.query(
          `UPDATE pricing_rules
           SET name = $2,
               charge_type = $3,
               mode = $4,
               value = $5,
               is_active = $6,
               sort_order = $7,
               updated_at = now()
           WHERE id = $1`,
          [id, name, chargeType, mode, value, isActive, sortOrder]
        );
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

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "规则保存失败" }, { status: 500 });
  }
}
