import { pool } from "./db";

export type MenuGroup = "breakfast" | "lunch_dinner" | "cocktail" | "set_menu";

export type MenuMajorCategory = {
  key: string;
  menu_group: MenuGroup;
  label_en: string;
  label_zh: string;
  include_empty_shift_items: boolean;
  sort_order: number;
};

const FALLBACK_CATEGORIES: MenuMajorCategory[] = [
  {
    key: "breakfast",
    menu_group: "breakfast",
    label_en: "Breakfast",
    label_zh: "早餐",
    include_empty_shift_items: true,
    sort_order: 10
  },
  {
    key: "lunch",
    menu_group: "lunch_dinner",
    label_en: "Lunch",
    label_zh: "午餐",
    include_empty_shift_items: true,
    sort_order: 20
  },
  {
    key: "dinner",
    menu_group: "lunch_dinner",
    label_en: "Dinner",
    label_zh: "晚餐",
    include_empty_shift_items: true,
    sort_order: 30
  },
  {
    key: "beverage",
    menu_group: "lunch_dinner",
    label_en: "Beverage",
    label_zh: "饮品",
    include_empty_shift_items: false,
    sort_order: 40
  },
  {
    key: "cocktail",
    menu_group: "cocktail",
    label_en: "Cocktail",
    label_zh: "鸡尾酒",
    include_empty_shift_items: true,
    sort_order: 50
  },
  {
    key: "package",
    menu_group: "set_menu",
    label_en: "Package",
    label_zh: "套餐",
    include_empty_shift_items: true,
    sort_order: 60
  }
];

function normalizeCategoryRow(input: Partial<MenuMajorCategory>) {
  const key = String(input.key || "").trim().toLowerCase();
  if (!key) return null;
  const menuGroup = String(input.menu_group || "").trim() as MenuGroup;
  if (!["breakfast", "lunch_dinner", "cocktail", "set_menu"].includes(menuGroup)) return null;
  return {
    key,
    menu_group: menuGroup,
    label_en: String(input.label_en || key).trim() || key,
    label_zh: String(input.label_zh || key).trim() || key,
    include_empty_shift_items: Boolean(input.include_empty_shift_items),
    sort_order: Number.isFinite(input.sort_order) ? Number(input.sort_order) : 100
  } satisfies MenuMajorCategory;
}

function dedupeByKey(items: MenuMajorCategory[]) {
  const byKey = new Map<string, MenuMajorCategory>();
  for (const item of items) {
    const key = item.key.toLowerCase();
    if (!byKey.has(key)) {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.key.localeCompare(b.key);
  });
}

export async function loadMenuMajorCategories() {
  try {
    const { rows } = await pool.query<MenuMajorCategory>(
      `SELECT key, menu_group, label_en, label_zh, include_empty_shift_items, sort_order
       FROM menu_major_categories
       WHERE is_active = true
       ORDER BY sort_order ASC, key ASC`
    );
    const normalized = rows
      .map((row) => normalizeCategoryRow(row))
      .filter((row): row is MenuMajorCategory => Boolean(row));
    if (normalized.length === 0) {
      return FALLBACK_CATEGORIES;
    }
    return dedupeByKey(normalized);
  } catch (err: any) {
    if (err?.code === "42P01") {
      return FALLBACK_CATEGORIES;
    }
    throw err;
  }
}

export function findMenuMajorCategory(items: MenuMajorCategory[], key: string) {
  const normalizedKey = String(key || "").trim().toLowerCase();
  if (!normalizedKey) return null;
  return items.find((item) => item.key === normalizedKey) || null;
}
