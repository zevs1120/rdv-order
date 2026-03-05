import { NextResponse } from "next/server";
import { pool } from "../../../../../lib/db";
import { requirePermission } from "../../../../../lib/permissions";
import { writeAuditLogSafe } from "../../../../../lib/audit";

type Params = { params: Promise<{ key: string }> };

function normalizeKey(value: string) {
  return String(value || "").trim().toLowerCase();
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const auth = await requirePermission(req, "menu.manage");
    if (auth.role !== "manager") {
      return NextResponse.json({ error: "仅经理可操作" }, { status: 403 });
    }

    const { key: rawKey } = await params;
    const key = normalizeKey(rawKey);
    if (!key) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    }

    const remaining = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM menu_major_categories
       WHERE is_active = true`
    );
    if (Number(remaining.rows[0]?.count || 0) <= 1) {
      return NextResponse.json({ error: "至少保留一个主目录" }, { status: 409 });
    }

    await pool.query("BEGIN");
    try {
      const { rows } = await pool.query<{ key: string }>(
        `UPDATE menu_major_categories
         SET is_active = false,
             updated_at = now()
         WHERE key = $1
           AND is_active = true
         RETURNING key`,
        [key]
      );
      if (rows.length === 0) {
        await pool.query("ROLLBACK");
        return NextResponse.json({ error: "大类目不存在" }, { status: 404 });
      }

      await pool.query(
        `UPDATE menu_subcategories
         SET is_active = false,
             updated_at = now()
         WHERE shift_key = $1
           AND is_active = true`,
        [key]
      );
      await pool.query("COMMIT");
    } catch (inner) {
      await pool.query("ROLLBACK");
      throw inner;
    }

    await writeAuditLogSafe({
      actorUserId: auth.userId,
      action: "menu.delete_major_category",
      entityType: "menu_major_category",
      entityId: key,
      detail: { key },
      req
    });

    return NextResponse.json({ deleted: true, key });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    return NextResponse.json({ error: "大类目删除失败" }, { status: 500 });
  }
}
