import { NextResponse } from "next/server";
import { pool } from "../../../../../lib/db";
import { requireAuth } from "../../../../../lib/api-auth";

const ALLOWED_GROUPS = ["breakfast", "lunch_dinner", "cocktail"] as const;
const ALLOWED_ITEM_TYPES = ["single", "set"] as const;

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requireAuth(req, ["manager"]);

    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body || !id) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    }

    if (body.menuGroup && !ALLOWED_GROUPS.includes(body.menuGroup)) {
      return NextResponse.json({ error: "菜单分组无效" }, { status: 400 });
    }

    if (body.itemType && !ALLOWED_ITEM_TYPES.includes(body.itemType)) {
      return NextResponse.json({ error: "菜品类型无效" }, { status: 400 });
    }

    const { rows } = await pool.query(
      `UPDATE menu_items
       SET name = COALESCE($2, name),
           price = COALESCE($3, price),
           category = COALESCE($4, category),
           description = COALESCE($5, description),
           menu_group = COALESCE($6, menu_group),
           item_type = COALESCE($7, item_type),
           is_active = COALESCE($8, is_active),
           sort_order = COALESCE($9, sort_order)
       WHERE id = $1
         AND is_temporary = false
       RETURNING id, name, price, category, description, menu_group, item_type, is_active, sort_order`,
      [
        id,
        body.name ?? null,
        typeof body.price === "number" ? body.price : null,
        body.category ?? null,
        body.description ?? null,
        body.menuGroup ?? null,
        body.itemType ?? null,
        typeof body.isActive === "boolean" ? body.isActive : null,
        typeof body.sortOrder === "number" ? body.sortOrder : null
      ]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "菜品不存在" }, { status: 404 });
    }

    return NextResponse.json({ item: rows[0] });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    await requireAuth(req, ["manager"]);
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    }

    const used = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM order_items
       WHERE menu_item_id = $1`,
      [id]
    );
    if (Number(used.rows[0]?.count || 0) > 0) {
      return NextResponse.json({ error: "该菜品已有订单记录，不能删除" }, { status: 409 });
    }

    const { rows } = await pool.query<{ id: string }>(
      `DELETE FROM menu_items
       WHERE id = $1
         AND is_temporary = false
       RETURNING id`,
      [id]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "菜品不存在" }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, id: rows[0].id });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
