import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requireAuth } from "../../../../lib/api-auth";

const ALLOWED_GROUPS = ["breakfast", "lunch_dinner", "cocktail"] as const;
const ALLOWED_ITEM_TYPES = ["single", "set"] as const;

export async function GET(req: Request) {
  try {
    await requireAuth(req, ["manager"]);

    const url = new URL(req.url);
    const menuGroup = (url.searchParams.get("menuGroup") || "").trim();

    const values: string[] = [];
    let where = "";
    if (menuGroup && ALLOWED_GROUPS.includes(menuGroup as (typeof ALLOWED_GROUPS)[number])) {
      where = "WHERE menu_group = $1";
      values.push(menuGroup);
    }

    const { rows } = await pool.query(
      `SELECT id, name, price, category, description, menu_group, item_type, is_active, sort_order
       FROM menu_items
       ${where}
       ORDER BY menu_group ASC, sort_order ASC, name ASC`,
      values
    );

    return NextResponse.json({ items: rows });
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

export async function POST(req: Request) {
  try {
    await requireAuth(req, ["manager"]);

    const body = await req.json().catch(() => null);
    if (!body?.name || typeof body?.price !== "number" || !body?.menuGroup) {
      return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
    }

    if (!ALLOWED_GROUPS.includes(body.menuGroup)) {
      return NextResponse.json({ error: "菜单分组无效" }, { status: 400 });
    }

    const itemType = body.itemType || "single";
    if (!ALLOWED_ITEM_TYPES.includes(itemType)) {
      return NextResponse.json({ error: "菜品类型无效" }, { status: 400 });
    }

    const { rows } = await pool.query(
      `INSERT INTO menu_items (name, price, category, description, menu_group, item_type, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7)
       RETURNING id, name, price, category, description, menu_group, item_type, is_active, sort_order`,
      [
        body.name,
        body.price,
        body.category || null,
        body.description || null,
        body.menuGroup,
        itemType,
        typeof body.sortOrder === "number" ? body.sortOrder : 0
      ]
    );

    return NextResponse.json({ item: rows[0] }, { status: 201 });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
}
