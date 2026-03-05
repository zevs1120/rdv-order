import { NextResponse } from "next/server";
import { pool } from "../../../../../lib/db";
import { requirePermission } from "../../../../../lib/permissions";
import { writeAuditLogSafe } from "../../../../../lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, { params }: Params) {
  try {
    const auth = await requirePermission(req, "menu.manage");
    if (auth.role !== "manager") {
      return NextResponse.json({ error: "仅经理可操作" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    }

    const { rows } = await pool.query<{ id: string; shift_key: string; name: string }>(
      `UPDATE menu_subcategories
       SET is_active = false,
           updated_at = now()
       WHERE id = $1
         AND is_active = true
       RETURNING id, shift_key, name`,
      [id]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "子类目不存在" }, { status: 404 });
    }

    await writeAuditLogSafe({
      actorUserId: auth.userId,
      action: "menu.delete_subcategory",
      entityType: "menu_subcategory",
      entityId: rows[0].id,
      detail: {
        shift: rows[0].shift_key,
        name: rows[0].name
      },
      req
    });

    return NextResponse.json({ deleted: true, id: rows[0].id });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    return NextResponse.json({ error: "子类目删除失败" }, { status: 500 });
  }
}
