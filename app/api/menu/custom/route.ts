import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";
import { writeAuditLogSafe } from "../../../../lib/audit";
import { findMenuMajorCategory, loadMenuMajorCategories } from "../../../../lib/menu-categories";

type Mode = "temporary" | "permanent";

export async function POST(req: Request) {
  try {
    const auth = await requirePermission(req, "order.create");
    const body = await req.json().catch(() => null);
    const name = String(body?.name || "").trim();
    const price = Number(body?.price);
    const category = String(body?.category || "").trim();
    const description = String(body?.description || "").trim();
    const shift = String(body?.shift || "lunch").trim().toLowerCase();
    const mode = String(body?.mode || "temporary") as Mode;

    if (!name || !Number.isInteger(price) || price <= 0) {
      return NextResponse.json({ error: "菜名或价格无效" }, { status: 400 });
    }
    if (!["temporary", "permanent"].includes(mode)) {
      return NextResponse.json({ error: "新增模式无效" }, { status: 400 });
    }
    const majorCategories = await loadMenuMajorCategories();
    const majorCategory = findMenuMajorCategory(majorCategories, shift);
    if (!majorCategory) {
      return NextResponse.json({ error: "班次无效" }, { status: 400 });
    }
    if (mode === "permanent") {
      await requirePermission(req, "menu.manage");
    }

    const menuGroup = majorCategory.menu_group;
    const availableShifts = [majorCategory.key];

    const { rows } = await pool.query(
      `INSERT INTO menu_items (name, price, category, description, menu_group, item_type, is_active, is_temporary, sort_order, available_shifts)
       VALUES ($1, $2, $3, $4, $5, 'single', $6, $7, 9999, $8::text[])
       RETURNING id, name, price, category, description, menu_group, item_type`,
      [
        name,
        price,
        category || (mode === "temporary" ? "Temporary" : null),
        description || null,
        menuGroup,
        mode === "permanent",
        mode === "temporary",
        availableShifts
      ]
    );

    await writeAuditLogSafe({
      actorUserId: auth.userId,
      action: mode === "permanent" ? "menu.custom_permanent" : "menu.custom_temporary",
      entityType: "menu_item",
      entityId: rows[0].id,
      detail: { name, price, category, shift, mode },
      req
    });

    return NextResponse.json({ item: rows[0] }, { status: 201 });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "新增菜失败" }, { status: 500 });
  }
}
