-- Add Tea category item under beverage shift.
WITH existing AS (
  SELECT id
  FROM menu_items
  WHERE lower(trim(name)) IN ('英式早餐茶', 'english breakfast tea')
  ORDER BY id
  LIMIT 1
)
INSERT INTO menu_items (
  name,
  price,
  category,
  description,
  menu_group,
  item_type,
  is_active,
  is_temporary,
  sort_order,
  allergens,
  available_shifts
)
SELECT
  '英式早餐茶',
  120,
  '茶',
  'English Breakfast Tea',
  'lunch_dinner',
  'single',
  true,
  false,
  215,
  ARRAY[]::text[],
  ARRAY['beverage']::text[]
WHERE NOT EXISTS (SELECT 1 FROM existing);

UPDATE menu_items
SET
  name = '英式早餐茶',
  price = 120,
  category = '茶',
  description = 'English Breakfast Tea',
  menu_group = 'lunch_dinner',
  item_type = 'single',
  is_active = true,
  is_temporary = false,
  sort_order = 215,
  available_shifts = ARRAY['beverage']::text[]
WHERE id IN (
  SELECT id
  FROM menu_items
  WHERE lower(trim(name)) IN ('英式早餐茶', 'english breakfast tea')
);
