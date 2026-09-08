import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { findMenuMajorCategory, loadMenuMajorCategories } from "../../../lib/menu-categories";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const shift = (url.searchParams.get("shift") || "lunch").toLowerCase();
  const majorCategories = await loadMenuMajorCategories();
  const fallbackCategory = majorCategories[0] || null;
  const majorCategory = findMenuMajorCategory(majorCategories, shift) || fallbackCategory;
  const mapped = majorCategory?.menu_group || "lunch_dinner";
  const includeEmptyShiftItems = Boolean(majorCategory?.include_empty_shift_items);
  const effectiveShift = majorCategory?.key || shift;
  const baseSql = `
    SELECT id, name, price, category, description, menu_group, item_type, allergens, code, option_groups, is_complimentary
    FROM menu_items
    WHERE is_active = true
      AND is_temporary = false
      AND COALESCE(category, '') NOT IN ('热菜', '主食', '饮品', 'Hot Dish', 'Staple', 'Drink', 'Drinks')
      AND (menu_group = $1 OR ($2 = 'breakfast' AND $2 = ANY(available_shifts)))
  `;

  const menuRequest = includeEmptyShiftItems
    ? pool.query(
      `${baseSql}
       AND (
         COALESCE(array_length(available_shifts, 1), 0) = 0
         OR $2 = ANY(available_shifts)
       )
       ORDER BY sort_order ASC, name ASC`,
      [mapped, effectiveShift]
    )
    : pool.query(
      `${baseSql}
       AND $2 = ANY(available_shifts)
       ORDER BY sort_order ASC, name ASC`,
      [mapped, effectiveShift]
    );
  // Both reads depend on the selected major category, not on one another.
  // Keep dish-first category ordering and the pre-019 compatibility fallback.
  const subcategoryRequest = pool.query<{ name: string }>(
    `SELECT name
     FROM menu_subcategories
     WHERE is_active = true
       AND shift_key = $1
     ORDER BY sort_order ASC, name ASC`,
    [effectiveShift]
  ).catch((err: { code?: string }) => {
    if (err?.code !== "42P01") throw err;
    return { rows: [] };
  });
  const allMenuRequest = pool.query(`SELECT id, name, price, category, description, menu_group, item_type, allergens, code, option_groups, is_complimentary
    FROM menu_items WHERE is_active AND NOT is_temporary ORDER BY code NULLS LAST, sort_order, name`);
  const [menuResult, subRows, allMenu] = await Promise.all([menuRequest, subcategoryRequest, allMenuRequest]);
  const { rows } = menuResult;

  const categories: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const category = String(row.category || "").trim();
    if (!category) continue;
    const key = category.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    categories.push(category);
  }

  for (const row of subRows.rows) {
    const category = String(row.name || "").trim();
    if (!category) continue;
    const key = category.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    categories.push(category);
  }

  return NextResponse.json(
    { items: rows, searchItems: allMenu.rows, subcategories: categories, shift: effectiveShift, menuGroup: mapped, majorCategories },
    {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=240"
      }
    }
  );
}
