import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";

const SHIFT_MAP: Record<string, string> = {
  breakfast: "breakfast",
  lunch: "lunch_dinner",
  dinner: "lunch_dinner",
  beverage: "lunch_dinner",
  cocktail: "cocktail",
  package: "set_menu"
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const shift = (url.searchParams.get("shift") || "lunch").toLowerCase();
  const mapped = SHIFT_MAP[shift] || "lunch_dinner";
  const baseSql = `
    SELECT id, name, price, category, description, menu_group, item_type, allergens
    FROM menu_items
    WHERE is_active = true
      AND is_temporary = false
      AND COALESCE(category, '') NOT IN ('热菜', '主食', '饮品', 'Hot Dish', 'Staple', 'Drink', 'Drinks')
      AND menu_group = $1
  `;

  const { rows } = shift === "beverage"
    ? await pool.query(
      `${baseSql}
       AND $2 = ANY(available_shifts)
       ORDER BY sort_order ASC, name ASC`,
      [mapped, shift]
    )
    : await pool.query(
      `${baseSql}
       AND (
         COALESCE(array_length(available_shifts, 1), 0) = 0
         OR $2 = ANY(available_shifts)
       )
       ORDER BY sort_order ASC, name ASC`,
      [mapped, shift]
    );

  return NextResponse.json(
    { items: rows, shift, menuGroup: mapped },
    {
      headers: {
        "Cache-Control": "public, max-age=15, stale-while-revalidate=45"
      }
    }
  );
}
