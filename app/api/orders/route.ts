import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { getBearerToken, verifyToken } from "../../../lib/auth";

async function requireAuth(req: Request, roles: Array<"waiter" | "manager">) {
  const token = getBearerToken(req);
  if (!token) throw new Error("UNAUTHORIZED");
  const payload = await verifyToken(token);
  if (!roles.includes(payload.role)) throw new Error("FORBIDDEN");
  return payload;
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req, ["waiter", "manager"]);
    const body = await req.json().catch(() => null);
    if (!body?.tableNo || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: "缺少桌号或菜品" }, { status: 400 });
    }

    const session = await pool.query(
      `SELECT id FROM table_sessions WHERE table_no = $1 AND closed_at IS NULL LIMIT 1`,
      [body.tableNo]
    );
    if (session.rows.length === 0) {
      return NextResponse.json({ error: "该桌未开台，请先开台" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const orderRes = await client.query(
        "INSERT INTO orders (table_no, waiter_id, status) VALUES ($1, $2, 'submitted') RETURNING id",
        [body.tableNo, auth.userId]
      );
      const orderId = orderRes.rows[0].id;

      for (const item of body.items) {
        await client.query(
          "INSERT INTO order_items (order_id, menu_item_id, qty) VALUES ($1, $2, $3)",
          [orderId, item.menuItemId, item.qty]
        );
      }

      await client.query(
        "INSERT INTO print_jobs (order_id, status, retry_count) VALUES ($1, 'pending', 0)",
        [orderId]
      );

      await client.query("COMMIT");
      return NextResponse.json({ orderId });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    return NextResponse.json({ error: "提交失败" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req, ["waiter", "manager"]);
    const url = new URL(req.url);
    const mine = url.searchParams.get("mine") === "1";

    const { rows } = await pool.query(
      `SELECT o.id, o.table_no, o.status, o.created_at
       FROM orders o
       ${mine ? "WHERE o.waiter_id = $1" : ""}
       ORDER BY o.created_at DESC
       LIMIT 50`,
      mine ? [auth.userId] : []
    );

    return NextResponse.json({ orders: rows });
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
