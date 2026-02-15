import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";
import { writeAuditLogSafe } from "../../../../lib/audit";

type Params = { params: Promise<{ id: string }> };
const UUID_V4_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(req: Request, { params }: Params) {
  try {
    const auth = await requirePermission(req, "order.delete");
    const { id } = await params;
    if (!id || !UUID_V4_LIKE.test(id)) {
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

    await writeAuditLogSafe({
      actorUserId: auth.userId,
      action: "order.delete",
      entityType: "order",
      entityId: rows[0].id,
      req
    });

    return NextResponse.json({ deleted: true, id: rows[0].id });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "删除订单失败" }, { status: 500 });
  }
}
