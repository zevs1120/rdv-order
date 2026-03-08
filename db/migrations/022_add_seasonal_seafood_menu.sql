WITH seafood_items(name, price, category, description, sort_order, available_shifts) AS (
  VALUES
    ('Grouper', 120, 'Local Catch', 'Seasonal Seafood · Steamed / Braised / Pickled', 320, ARRAY['lunch', 'dinner']::text[]),
    ('Hairtail', 80, 'Local Catch', 'Seasonal Seafood · Steamed / Braised / Seared', 321, ARRAY['lunch', 'dinner']::text[]),
    ('Parrot Fish', 90, 'Local Catch', 'Seasonal Seafood · Steamed / Braised / Pickled', 322, ARRAY['lunch', 'dinner']::text[]),
    ('Crab', 150, 'Treasures from the Sea', 'Seasonal Seafood · Steamed / Ginger & Garlic', 323, ARRAY['lunch', 'dinner']::text[]),
    ('Mantis', 360, 'Treasures from the Sea', 'Seasonal Seafood · Steamed / Salt & Pepper', 324, ARRAY['lunch', 'dinner']::text[]),
    ('Tiger Prawn', 200, 'Treasures from the Sea', 'Seasonal Seafood · Poached / Braised / BBQ', 325, ARRAY['lunch', 'dinner']::text[])
)
UPDATE menu_items mi
SET price = si.price,
    category = si.category,
    description = si.description,
    menu_group = 'lunch_dinner',
    item_type = 'single',
    is_active = true,
    is_temporary = false,
    sort_order = si.sort_order,
    available_shifts = si.available_shifts
FROM seafood_items si
WHERE lower(trim(mi.name)) = lower(trim(si.name))
  AND mi.menu_group = 'lunch_dinner';

WITH seafood_items(name, price, category, description, sort_order, available_shifts) AS (
  VALUES
    ('Grouper', 120, 'Local Catch', 'Seasonal Seafood · Steamed / Braised / Pickled', 320, ARRAY['lunch', 'dinner']::text[]),
    ('Hairtail', 80, 'Local Catch', 'Seasonal Seafood · Steamed / Braised / Seared', 321, ARRAY['lunch', 'dinner']::text[]),
    ('Parrot Fish', 90, 'Local Catch', 'Seasonal Seafood · Steamed / Braised / Pickled', 322, ARRAY['lunch', 'dinner']::text[]),
    ('Crab', 150, 'Treasures from the Sea', 'Seasonal Seafood · Steamed / Ginger & Garlic', 323, ARRAY['lunch', 'dinner']::text[]),
    ('Mantis', 360, 'Treasures from the Sea', 'Seasonal Seafood · Steamed / Salt & Pepper', 324, ARRAY['lunch', 'dinner']::text[]),
    ('Tiger Prawn', 200, 'Treasures from the Sea', 'Seasonal Seafood · Poached / Braised / BBQ', 325, ARRAY['lunch', 'dinner']::text[])
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
  si.name,
  si.price,
  si.category,
  si.description,
  'lunch_dinner',
  'single',
  true,
  false,
  si.sort_order,
  '{}'::text[],
  si.available_shifts
FROM seafood_items si
WHERE NOT EXISTS (
  SELECT 1
  FROM menu_items mi
  WHERE lower(trim(mi.name)) = lower(trim(si.name))
    AND mi.menu_group = 'lunch_dinner'
);
