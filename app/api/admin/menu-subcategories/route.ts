import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";
import { writeAuditLogSafe } from "../../../../lib/audit";
import { findMenuMajorCategory, loadMenuMajorCategories } from "../../../../lib/menu-categories";

function normalizeName(value: unknown) {
  return String(value || "").trim();
}

function normalizeNameKey(value: string) {
  return value.toLowerCase();
}

export async function GET(req: Request) {
  try {
    await requirePermission(req, "menu.manage");
    const url = new URL(req.url);
    const shift = normalizeName(url.searchParams.get("shift"));
    const majorCategories = await loadMenuMajorCategories();
    if (shift && !findMenuMajorCategory(majorCategories, shift)) {
      return NextResponse.json({ error: "大类目无效" }, { status: 400 });
    }

    const values: string[] = [];
    let where = "WHERE is_active = true";
    if (shift) {
      where += " AND shift_key = $1";
      values.push(shift);
    }

    const { rows } = await pool.query(
      `SELECT id, shift_key, name, display_name_zh, sort_order
       FROM menu_subcategories
       ${where}
       ORDER BY shift_key ASC, sort_order ASC, name ASC`,
      values
    );

    return NextResponse.json({ subcategories: rows });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    return NextResponse.json({ error: "子类目查询失败" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requirePermission(req, "menu.manage");
    if (auth.role !== "manager") {
      return NextResponse.json({ error: "仅经理可操作" }, { status: 403 });
    }
    const body = await req.json().catch(() => null);
    const shift = normalizeName(body?.shift).toLowerCase();
    const name = normalizeName(body?.name);
    const displayNameZh = normalizeName(body?.displayNameZh) || null;
    const sortOrder = Number.isFinite(body?.sortOrder) ? Math.trunc(Number(body.sortOrder)) : 1000;

    const majorCategories = await loadMenuMajorCategories();
    if (!findMenuMajorCategory(majorCategories, shift)) {
      return NextResponse.json({ error: "大类目无效" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "子类目名称不能为空" }, { status: 400 });
    }
    if (name.length > 60) {
      return NextResponse.json({ error: "子类目名称长度不能超过 60" }, { status: 400 });
    }

    const nameKey = normalizeNameKey(name);
    const duplicate = await pool.query<{ id: string }>(
      `SELECT id
       FROM menu_subcategories
       WHERE shift_key = $1
         AND name_key = $2
         AND is_active = true
       LIMIT 1`,
      [shift, nameKey]
    );
    if (duplicate.rows.length > 0) {
      return NextResponse.json({ error: "子类目已存在" }, { status: 409 });
    }

    const { rows } = await pool.query(
      `INSERT INTO menu_subcategories (shift_key, name, name_key, display_name_zh, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, shift_key, name, display_name_zh, sort_order`,
      [shift, name, nameKey, displayNameZh, sortOrder]
    );

    await writeAuditLogSafe({
      actorUserId: auth.userId,
      action: "menu.create_subcategory",
      entityType: "menu_subcategory",
      entityId: rows[0].id,
      detail: {
        shift,
        name,
        displayNameZh,
        sortOrder
      },
      req
    });

    return NextResponse.json({ subcategory: rows[0] }, { status: 201 });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    if (err?.code === "23505") {
      return NextResponse.json({ error: "子类目已存在" }, { status: 409 });
    }
    return NextResponse.json({ error: "子类目创建失败" }, { status: 500 });
  }
}
