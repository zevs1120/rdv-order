import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { writeAuditLogSafe } from "../../../../lib/audit";
import { loadMenuMajorCategories, type MenuGroup } from "../../../../lib/menu-categories";
import { requirePermission } from "../../../../lib/permissions";

const ALLOWED_MENU_GROUPS: MenuGroup[] = ["breakfast", "lunch_dinner", "cocktail", "set_menu"];

function toSlug(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

export async function GET(req: Request) {
  try {
    await requirePermission(req, "menu.manage");
    const majorCategories = await loadMenuMajorCategories();
    return NextResponse.json({ majorCategories });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    return NextResponse.json({ error: "大类目查询失败" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requirePermission(req, "menu.manage");
    if (auth.role !== "manager") {
      return NextResponse.json({ error: "仅经理可操作" }, { status: 403 });
    }
    const body = await req.json().catch(() => null);
    const labelEn = String(body?.labelEn || "").trim();
    const labelZh = String(body?.labelZh || "").trim();
    const keyRaw = String(body?.key || labelEn || labelZh || "").trim();
    const key = toSlug(keyRaw);
    const menuGroup = String(body?.menuGroup || "").trim() as MenuGroup;
    const includeEmptyShiftItems = Boolean(body?.includeEmptyShiftItems);

    if (!labelEn) {
      return NextResponse.json({ error: "大类目英文名称不能为空" }, { status: 400 });
    }
    if (!labelZh) {
      return NextResponse.json({ error: "大类目中文名称不能为空" }, { status: 400 });
    }
    if (!key) {
      return NextResponse.json({ error: "大类目 Key 无效" }, { status: 400 });
    }
    if (!ALLOWED_MENU_GROUPS.includes(menuGroup)) {
      return NextResponse.json({ error: "菜单分组无效" }, { status: 400 });
    }

    const dup = await pool.query<{ id: string }>(
      `SELECT id
       FROM menu_major_categories
       WHERE key = $1
         AND is_active = true
       LIMIT 1`,
      [key]
    );
    if (dup.rows.length > 0) {
      return NextResponse.json({ error: "大类目已存在" }, { status: 409 });
    }

    const maxSort = await pool.query<{ sort_order: number }>(
      `SELECT COALESCE(MAX(sort_order), 0) + 10 AS sort_order
       FROM menu_major_categories`
    );
    const nextSort = Number(maxSort.rows[0]?.sort_order || 100);

    const { rows } = await pool.query(
      `INSERT INTO menu_major_categories
        (key, menu_group, label_en, label_zh, include_empty_shift_items, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING key, menu_group, label_en, label_zh, include_empty_shift_items, sort_order`,
      [key, menuGroup, labelEn, labelZh, includeEmptyShiftItems, nextSort]
    );

    await writeAuditLogSafe({
      actorUserId: auth.userId,
      action: "menu.create_major_category",
      entityType: "menu_major_category",
      entityId: key,
      detail: {
        key,
        labelEn,
        labelZh,
        menuGroup,
        includeEmptyShiftItems,
        sortOrder: nextSort
      },
      req
    });

    return NextResponse.json({ majorCategory: rows[0] }, { status: 201 });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    if (err?.code === "42P01") {
      return NextResponse.json({ error: "请先执行 021 迁移" }, { status: 409 });
    }
    if (err?.code === "23505") {
      return NextResponse.json({ error: "大类目已存在" }, { status: 409 });
    }
    return NextResponse.json({ error: "大类目创建失败" }, { status: 500 });
  }
}
