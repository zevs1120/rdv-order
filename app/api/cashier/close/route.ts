import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";
import { writeAuditLogSafe } from "../../../../lib/audit";

async function calculateExpected(fromIso: string, toIso: string) {
  const { rows } = await pool.query<{ expected_amount: number }>(
    `WITH order_items_total AS (
       SELECT o.id AS order_id,
              COALESCE(SUM(oi.qty * COALESCE(oi.unit_price, mi.price)), 0)::int AS item_amount
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE o.status IN ('paid', 'closed')
         AND o.cancelled_at IS NULL
         AND o.merged_into_order_id IS NULL
         AND o.created_at >= $1
         AND o.created_at <= $2
       GROUP BY o.id
     ),
     order_charge_total AS (
       SELECT order_id, COALESCE(SUM(amount), 0)::int AS charge_amount
       FROM order_charges
       GROUP BY order_id
     )
     SELECT COALESCE(SUM(oit.item_amount + COALESCE(oct.charge_amount, 0)), 0)::int AS expected_amount
     FROM order_items_total oit
     LEFT JOIN order_charge_total oct ON oct.order_id = oit.order_id`,
    [fromIso, toIso]
  );
  return rows[0]?.expected_amount || 0;
}

export async function POST(req: Request) {
  try {
    const auth = await requirePermission(req, "cashier.close_shift");
    const body = await req.json().catch(() => null) as {
      from?: unknown;
      to?: unknown;
      actualAmount?: unknown;
      shiftLabel?: unknown;
      note?: unknown;
    } | null;

    const from = new Date(String(body?.from || ""));
    const to = new Date(String(body?.to || ""));
    const actualAmount = Number(body?.actualAmount);
    const shiftLabel = String(body?.shiftLabel || "").trim();
    const note = String(body?.note || "").trim();

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      return NextResponse.json({ error: "时间范围无效" }, { status: 400 });
    }
    if (!Number.isInteger(actualAmount) || actualAmount < 0) {
      return NextResponse.json({ error: "实收金额无效" }, { status: 400 });
    }

    const fromIso = from.toISOString();
    const toIso = to.toISOString();
    const expectedAmount = await calculateExpected(fromIso, toIso);
    const varianceAmount = actualAmount - expectedAmount;

    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO cashier_closings
       (shift_label, from_time, to_time, expected_amount, actual_amount, variance_amount, note, closed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        shiftLabel || null,
        fromIso,
        toIso,
        expectedAmount,
        actualAmount,
        varianceAmount,
        note || null,
        auth.userId
      ]
    );

    await writeAuditLogSafe({
      actorUserId: auth.userId,
      action: "cashier.close_shift",
      entityType: "cashier_closing",
      entityId: inserted.rows[0].id,
      detail: { from: fromIso, to: toIso, expectedAmount, actualAmount, varianceAmount, shiftLabel, note },
      req
    });

    return NextResponse.json({
      ok: true,
      id: inserted.rows[0].id,
      expectedAmount,
      actualAmount,
      varianceAmount
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "日结失败" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    await requirePermission(req, "cashier.close_shift");
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const where: string[] = [];
    const params: string[] = [];
    if (from) {
      const fromDate = new Date(from);
      if (Number.isNaN(fromDate.getTime())) {
        return NextResponse.json({ error: "开始时间无效" }, { status: 400 });
      }
      params.push(fromDate.toISOString());
      where.push(`from_time >= $${params.length}`);
    }
    if (to) {
      const toDate = new Date(to);
      if (Number.isNaN(toDate.getTime())) {
        return NextResponse.json({ error: "结束时间无效" }, { status: 400 });
      }
      params.push(toDate.toISOString());
      where.push(`to_time <= $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT id, shift_label, from_time, to_time, expected_amount, actual_amount, variance_amount, note, created_at
       FROM cashier_closings
       ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY created_at DESC
       LIMIT 100`,
      params
    );

    return NextResponse.json({ rows });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "日结记录查询失败" }, { status: 500 });
  }
}
