import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";
import { writeAuditLogSafe } from "../../../../lib/audit";

type ShiftKey = "breakfast" | "lunch" | "dinner" | "cocktail" | "package";
type Mode = "temporary" | "permanent";

const SHIFT_MAP: Record<ShiftKey, "breakfast" | "lunch_dinner" | "cocktail" | "set_menu"> = {
  breakfast: "breakfast",
  lunch: "lunch_dinner",
  dinner: "lunch_dinner",
  cocktail: "cocktail",
  package: "set_menu"
};

export async function POST(req: Request) {
  try {
    const auth = await requirePermission(req, "order.create");
    const body = await req.json().catch(() => null);
    const name = String(body?.name || "").trim();
    const price = Number(body?.price);
    const category = String(body?.category || "").trim();
    const description = String(body?.description || "").trim();
    const shift = String(body?.shift || "lunch") as ShiftKey;
    const mode = String(body?.mode || "temporary") as Mode;

    if (!name || !Number.isInteger(price) || price <= 0) {
      return NextResponse.json({ error: "菜名或价格无效" }, { status: 400 });
    }
    if (!["temporary", "permanent"].includes(mode)) {
      return NextResponse.json({ error: "新增模式无效" }, { status: 400 });
    }
    if (!SHIFT_MAP[shift]) {
      return NextResponse.json({ error: "班次无效" }, { status: 400 });
    }
    if (mode === "permanent") {
      await requirePermission(req, "menu.manage");
    }

    const menuGroup = SHIFT_MAP[shift];

    const { rows } = await pool.query(
      `INSERT INTO menu_items (name, price, category, description, menu_group, item_type, is_active, is_temporary, sort_order)
       VALUES ($1, $2, $3, $4, $5, 'single', $6, $7, 9999)
       RETURNING id, name, price, category, description, menu_group, item_type`,
      [
        name,
        price,
        category || (mode === "temporary" ? "Temporary" : null),
        description || null,
        menuGroup,
        mode === "permanent",
        mode === "temporary"
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
