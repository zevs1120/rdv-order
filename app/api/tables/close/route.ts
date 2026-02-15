import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requireAuth } from "../../../../lib/api-auth";

type SessionRow = {
  id: string;
  table_no: string;
  opened_at: string;
};

export async function POST(req: Request) {
  try {
    await requireAuth(req, ["waiter", "manager"]);
    const body = await req.json().catch(() => null);
    const tableNo = String(body?.tableNo || "").trim();

    if (!tableNo) {
      return NextResponse.json({ error: "缺少桌号" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const session = await client.query<SessionRow>(
        `SELECT id, table_no, opened_at
         FROM table_sessions
         WHERE table_no = $1 AND closed_at IS NULL
         LIMIT 1`,
        [tableNo]
      );

      if (session.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "桌台未开台" }, { status: 404 });
      }

      const s = session.rows[0];

      const unpaid = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM orders
         WHERE table_no = $1
           AND created_at >= $2
           AND status = 'submitted'`,
        [s.table_no, s.opened_at]
      );

      if (Number(unpaid.rows[0]?.count || 0) > 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "当前桌台有未结订单，请先结账" }, { status: 409 });
      }

      await client.query(
        `UPDATE table_sessions
         SET closed_at = now()
         WHERE id = $1`,
        [s.id]
      );

      await client.query("COMMIT");
      return NextResponse.json({ closed: true, tableNo: s.table_no });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "关台失败" }, { status: 500 });
  }
}
