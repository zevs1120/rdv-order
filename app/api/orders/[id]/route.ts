import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requireAuth } from "../../../../lib/api-auth";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, { params }: Params) {
  try {
    await requireAuth(req, ["manager"]);
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "缺少订单 ID" }, { status: 400 });
    }

    const { rows } = await pool.query<{ id: string }>(
      `DELETE FROM orders
       WHERE id = $1
       RETURNING id`,
      [id]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, id: rows[0].id });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "删除订单失败" }, { status: 500 });
  }
}

