import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { getBearerToken, verifyToken } from "../../../lib/auth";

async function requireManager(req: Request) {
  const token = getBearerToken(req);
  if (!token) throw new Error("UNAUTHORIZED");
  const payload = await verifyToken(token);
  if (payload.role !== "manager") throw new Error("FORBIDDEN");
  return payload;
}

export async function GET(req: Request) {
  try {
    await requireManager(req);
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const rangeFrom = from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rangeTo = to ? new Date(to) : new Date();

    if (Number.isNaN(rangeFrom.getTime()) || Number.isNaN(rangeTo.getTime())) {
      return NextResponse.json({ error: "时间格式错误" }, { status: 400 });
    }

    const totalRes = await pool.query(
      `SELECT COUNT(*)::int AS order_count,
              COALESCE(SUM(oi.qty * mi.price), 0)::int AS total_amount
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE o.created_at >= $1 AND o.created_at <= $2`,
      [rangeFrom.toISOString(), rangeTo.toISOString()]
    );

    const itemsRes = await pool.query(
      `SELECT mi.id AS menu_item_id, mi.name, SUM(oi.qty)::int AS qty
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE o.created_at >= $1 AND o.created_at <= $2
       GROUP BY mi.id, mi.name
       ORDER BY qty DESC`,
      [rangeFrom.toISOString(), rangeTo.toISOString()]
    );

    return NextResponse.json({
      orderCount: totalRes.rows[0]?.order_count ?? 0,
      totalAmount: totalRes.rows[0]?.total_amount ?? 0,
      items: itemsRes.rows
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}
