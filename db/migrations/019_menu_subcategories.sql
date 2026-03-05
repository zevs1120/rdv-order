CREATE TABLE IF NOT EXISTS menu_subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_key TEXT NOT NULL CHECK (shift_key IN ('breakfast', 'lunch', 'dinner', 'beverage', 'cocktail', 'package')),
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  display_name_zh TEXT,
  sort_order INT NOT NULL DEFAULT 1000,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS menu_subcategories_unique_active_name_idx
  ON menu_subcategories(shift_key, name_key)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS menu_subcategories_lookup_idx
  ON menu_subcategories(shift_key, is_active, sort_order, name);

WITH raw_categories AS (
  SELECT 'breakfast'::text AS shift_key, NULLIF(BTRIM(category), '') AS name
  FROM menu_items
  WHERE menu_group = 'breakfast'
    AND is_temporary = false
    AND is_active = true
    AND COALESCE(category, '') NOT IN ('热菜', '主食', '饮品', 'Hot Dish', 'Staple', 'Drink', 'Drinks')

  UNION ALL

  SELECT 'cocktail'::text AS shift_key, NULLIF(BTRIM(category), '') AS name
  FROM menu_items
  WHERE menu_group = 'cocktail'
    AND is_temporary = false
    AND is_active = true
    AND COALESCE(category, '') NOT IN ('热菜', '主食', '饮品', 'Hot Dish', 'Staple', 'Drink', 'Drinks')

  UNION ALL

  SELECT 'package'::text AS shift_key, NULLIF(BTRIM(category), '') AS name
  FROM menu_items
  WHERE menu_group = 'set_menu'
    AND is_temporary = false
    AND is_active = true
    AND COALESCE(category, '') NOT IN ('热菜', '主食', '饮品', 'Hot Dish', 'Staple', 'Drink', 'Drinks')

  UNION ALL

  SELECT 'beverage'::text AS shift_key, NULLIF(BTRIM(category), '') AS name
  FROM menu_items
  WHERE menu_group = 'lunch_dinner'
    AND is_temporary = false
    AND is_active = true
    AND 'beverage' = ANY(available_shifts)
    AND COALESCE(category, '') NOT IN ('热菜', '主食', '饮品', 'Hot Dish', 'Staple', 'Drink', 'Drinks')

  UNION ALL

  SELECT 'lunch'::text AS shift_key, NULLIF(BTRIM(category), '') AS name
  FROM menu_items
  WHERE menu_group = 'lunch_dinner'
    AND is_temporary = false
    AND is_active = true
    AND (
      COALESCE(array_length(available_shifts, 1), 0) = 0
      OR 'lunch' = ANY(available_shifts)
    )
    AND COALESCE(category, '') NOT IN ('热菜', '主食', '饮品', 'Hot Dish', 'Staple', 'Drink', 'Drinks')

  UNION ALL

  SELECT 'dinner'::text AS shift_key, NULLIF(BTRIM(category), '') AS name
  FROM menu_items
  WHERE menu_group = 'lunch_dinner'
    AND is_temporary = false
    AND is_active = true
    AND (
      COALESCE(array_length(available_shifts, 1), 0) = 0
      OR 'dinner' = ANY(available_shifts)
    )
    AND COALESCE(category, '') NOT IN ('热菜', '主食', '饮品', 'Hot Dish', 'Staple', 'Drink', 'Drinks')
),
deduped AS (
  SELECT DISTINCT shift_key, name
  FROM raw_categories
  WHERE shift_key IS NOT NULL
    AND name IS NOT NULL
)
INSERT INTO menu_subcategories (shift_key, name, name_key, sort_order, is_active)
SELECT shift_key, name, LOWER(name), 1000, true
FROM deduped d
WHERE NOT EXISTS (
  SELECT 1
  FROM menu_subcategories ms
  WHERE ms.shift_key = d.shift_key
    AND ms.name_key = LOWER(d.name)
    AND ms.is_active = true
);
