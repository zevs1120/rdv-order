import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requireOrderCreate } from "../../../../lib/permissions";

const IDEMPOTENCY_KEY = /^[a-zA-Z0-9_-]{8,80}$/;
const headers = { "Cache-Control": "no-store" };

// Additive, read-only recovery API: an installed client can resolve a timed-out
// submission even after the table was checked out. No orders or print jobs change.
export async function GET(req: Request) {
  try {
    const auth = await requireOrderCreate(req);
    const key = new URL(req.url).searchParams.get("key")?.trim() || "";
    if (!IDEMPOTENCY_KEY.test(key)) {
      return NextResponse.json({ error: "请求幂等键格式错误" }, { status: 400, headers });
    }
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM orders
       WHERE waiter_id = $1 AND client_request_id = $2
       LIMIT 1`,
      [auth.userId, key]
    );
    return NextResponse.json(
      rows[0] ? { found: true, orderId: rows[0].id } : { found: false },
      { headers }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401, headers });
    if (message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403, headers });
    return NextResponse.json({ error: "订单查询失败" }, { status: 500, headers });
  }
}
