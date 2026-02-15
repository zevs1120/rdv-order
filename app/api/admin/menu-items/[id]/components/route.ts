import { NextResponse } from "next/server";
import { pool } from "../../../../../../lib/db";
import { requirePermission } from "../../../../../../lib/permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    await requirePermission(req, "menu.manage");
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "缺少菜品 ID" }, { status: 400 });
    }

    const { rows } = await pool.query(
      `SELECT mic.id,
              mic.parent_item_id,
              mic.child_item_id,
              mic.qty,
              mi.name AS child_name
       FROM menu_item_components mic
       JOIN menu_items mi ON mi.id = mic.child_item_id
       WHERE mic.parent_item_id = $1
       ORDER BY mi.name ASC`,
      [id]
    );

    return NextResponse.json({ components: rows });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "套餐组件查询失败" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    await requirePermission(req, "menu.manage");
    const { id } = await params;
    const body = await req.json().catch(() => null) as {
      components?: Array<{ childItemId?: unknown; qty?: unknown }>;
    } | null;

    if (!id) {
      return NextResponse.json({ error: "缺少菜品 ID" }, { status: 400 });
    }
    const components = Array.isArray(body?.components) ? body!.components : [];

    const normalized = components
      .map((item) => ({
        childItemId: String(item.childItemId || "").trim(),
        qty: Number(item.qty)
      }))
      .filter((item) => item.childItemId && Number.isInteger(item.qty) && item.qty > 0);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM menu_item_components WHERE parent_item_id = $1`, [id]);
      for (const item of normalized) {
        await client.query(
          `INSERT INTO menu_item_components (parent_item_id, child_item_id, qty)
           VALUES ($1, $2, $3)
           ON CONFLICT (parent_item_id, child_item_id)
           DO UPDATE SET qty = EXCLUDED.qty`,
          [id, item.childItemId, item.qty]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return NextResponse.json({ ok: true, count: normalized.length });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "套餐组件保存失败" }, { status: 500 });
  }
}
