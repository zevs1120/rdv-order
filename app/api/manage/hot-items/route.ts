import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";

export async function GET(req: Request) {
  try {
    await requirePermission(req, "report.finance");

    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json({ error: "缺少时间范围" }, { status: 400 });
    }

    const rangeFrom = new Date(from);
    const rangeTo = new Date(to);
    if (Number.isNaN(rangeFrom.getTime()) || Number.isNaN(rangeTo.getTime())) {
      return NextResponse.json({ error: "时间格式错误" }, { status: 400 });
    }

    const { rows } = await pool.query<{ id: string; name: string; qty: number }>(
      `SELECT mi.id,
              mi.name,
              COALESCE(SUM(oi.qty), 0)::int AS qty
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE o.created_at >= $1
         AND o.created_at <= $2
         AND o.status IN ('paid', 'closed')
         AND o.cancelled_at IS NULL
       GROUP BY mi.id, mi.name
       ORDER BY qty DESC, mi.name ASC`,
      [rangeFrom.toISOString(), rangeTo.toISOString()]
    );

    return NextResponse.json({ hotItems: rows });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "热销查询失败" }, { status: 500 });
  }
}
