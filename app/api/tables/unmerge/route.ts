import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requireAuth } from "../../../../lib/api-auth";
import { lockSessionName } from "../../../../lib/table-lock";

type SessionRow = {
  id: string;
  table_no: string;
  opened_at: string;
  guest_count: number;
};

export async function POST(req: Request) {
  try {
    await requireAuth(req, ["waiter", "manager"]);
    const body = await req.json().catch(() => null);
    const tableNo = String(body?.tableNo || "").trim();

    if (!tableNo || !tableNo.includes("+")) {
      return NextResponse.json({ error: "该桌不是拼桌" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await lockSessionName(client, tableNo);

      const session = await client.query<SessionRow>(
        `SELECT id, table_no, opened_at, guest_count
         FROM table_sessions
         WHERE table_no = $1 AND closed_at IS NULL
         LIMIT 1
         FOR UPDATE`,
        [tableNo]
      );

      if (session.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "拼桌会话不存在" }, { status: 404 });
      }

      const s = session.rows[0];
      const mapping = await client.query<{ table_no: string }>(
        `SELECT table_no
         FROM table_session_tables
         WHERE session_id = $1
         ORDER BY table_no ASC`,
        [s.id]
      );

      if (mapping.rows.length < 2) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "当前不是有效拼桌" }, { status: 400 });
      }

      const orderCount = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM orders
         WHERE table_no = $1
           AND created_at >= $2
           AND status IN ('submitted', 'paid')`,
        [s.table_no, s.opened_at]
      );

      if (Number(orderCount.rows[0]?.count || 0) > 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "该拼桌已有订单，不能取消拼桌，请先结账" }, { status: 409 });
      }

      const primary = mapping.rows[0].table_no;
      const secondary = mapping.rows[1].table_no;

      await client.query(
        `UPDATE table_sessions
         SET table_no = $2
         WHERE id = $1`,
        [s.id, primary]
      );

      await client.query(
        `DELETE FROM table_session_tables
         WHERE session_id = $1 AND table_no = $2`,
        [s.id, secondary]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        message: "取消拼桌成功",
        tableNo: primary,
        releasedTable: secondary,
        guestCount: s.guest_count
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "取消拼桌失败" }, { status: 500 });
  }
}
