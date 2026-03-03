import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";

const ALLOWED_GROUPS = ["breakfast", "lunch_dinner", "cocktail", "set_menu"] as const;
const ALLOWED_ITEM_TYPES = ["single", "set"] as const;
const BEVERAGE_CATEGORY_KEYS = new Set([
  "beer",
  "soft drink",
  "soft drinks",
  "canned juice",
  "canned juices",
  "coffee",
  "coffees",
  "shake",
  "shakes",
  "啤酒",
  "咖啡",
  "软饮",
  "罐装果汁",
  "奶昔"
]);

function isBeverageCategory(raw: unknown) {
  const key = String(raw || "").trim().toLowerCase();
  return BEVERAGE_CATEGORY_KEYS.has(key);
}

export async function GET(req: Request) {
  try {
    await requirePermission(req, "menu.manage");

    const url = new URL(req.url);
    const menuGroup = (url.searchParams.get("menuGroup") || "").trim();

    const values: string[] = [];
    let where = "WHERE is_temporary = false AND is_active = true AND COALESCE(category, '') NOT IN ('热菜', '主食', '饮品', 'Hot Dish', 'Staple', 'Drink', 'Drinks')";
    if (menuGroup && ALLOWED_GROUPS.includes(menuGroup as (typeof ALLOWED_GROUPS)[number])) {
      where += " AND menu_group = $1";
      values.push(menuGroup);
    }

    const { rows } = await pool.query(
      `SELECT id, name, price, category, description, menu_group, item_type, is_active, sort_order, allergens, available_shifts
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
    await requirePermission(req, "menu.manage");

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

    const allergens = Array.isArray(body.allergens)
      ? body.allergens.map((v: unknown) => String(v || "").trim()).filter(Boolean)
      : [];
    const availableShifts = Array.isArray(body.availableShifts)
      ? body.availableShifts.map((v: unknown) => String(v || "").trim()).filter(Boolean)
      : (
        body.menuGroup === "breakfast"
          ? ["breakfast"]
          : body.menuGroup === "cocktail"
            ? ["cocktail"]
            : body.menuGroup === "set_menu"
              ? ["package"]
            : isBeverageCategory(body.category)
              ? ["beverage"]
              : ["lunch", "dinner"]
      );

    const { rows } = await pool.query(
      `INSERT INTO menu_items
       (name, price, category, description, menu_group, item_type, is_active, is_temporary, sort_order, allergens, available_shifts)
       VALUES ($1, $2, $3, $4, $5, $6, true, false, $7, $8::text[], $9::text[])
       RETURNING id, name, price, category, description, menu_group, item_type, is_active, sort_order, allergens, available_shifts`,
      [
        body.name,
        body.price,
        body.category || null,
        body.description || null,
        body.menuGroup,
        itemType,
        typeof body.sortOrder === "number" ? body.sortOrder : 0,
        allergens,
        availableShifts
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
