import { NextResponse } from "next/server";
import { pool } from "../../../../../lib/db";
import { requirePermission } from "../../../../../lib/permissions";
import { writeAuditLogSafe } from "../../../../../lib/audit";

type Params = { params: Promise<{ id: string }> };
const UUID_V4_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(req: Request, { params }: Params) {
  try {
    const auth = await requirePermission(req, "cashier.close_shift");
    const { id } = await params;
    const ruleId = String(id || "").trim();
    if (!UUID_V4_LIKE.test(ruleId)) {
      return NextResponse.json({ error: "规则不存在" }, { status: 404 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const exists = await client.query<{ id: string }>(
        `SELECT id
         FROM pricing_rules
         WHERE id = $1
         FOR UPDATE`,
        [ruleId]
      );
      if (exists.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "规则不存在" }, { status: 404 });
      }

      await client.query(
        `DELETE FROM order_charges oc
         USING orders o
         WHERE oc.order_id = o.id
           AND oc.rule_id = $1
           AND oc.source = 'rule_auto'
           AND o.status IN ('submitted', 'preparing', 'served', 'paid')
           AND o.cancelled_at IS NULL
           AND o.merged_into_order_id IS NULL`,
        [ruleId]
      );

      await client.query(
        `UPDATE order_charges
         SET rule_id = NULL
         WHERE rule_id = $1`,
        [ruleId]
      );

      await client.query(
        `DELETE FROM pricing_rules
         WHERE id = $1`,
        [ruleId]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    await writeAuditLogSafe({
      actorUserId: auth.userId,
      action: "pricing.rule_delete",
      entityType: "pricing_rules",
      entityId: ruleId,
      detail: { ruleId },
      req
    });

    return NextResponse.json({ ok: true, ruleId });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "规则删除失败" }, { status: 500 });
  }
}
