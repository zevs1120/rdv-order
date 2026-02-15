import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";

const SHIFT_MAP: Record<string, string> = {
  breakfast: "breakfast",
  lunch: "lunch_dinner",
  dinner: "lunch_dinner",
  cocktail: "cocktail"
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const shift = (url.searchParams.get("shift") || "lunch").toLowerCase();
  const mapped = SHIFT_MAP[shift] || "lunch_dinner";

  const { rows } = await pool.query(
    `SELECT id, name, price, category, description, menu_group, item_type
     FROM menu_items
     WHERE is_active = true
       AND is_temporary = false
       AND menu_group = $1
     ORDER BY sort_order ASC, name ASC`,
    [mapped]
  );

  return NextResponse.json({ items: rows, shift, menuGroup: mapped });
}
