UPDATE menu_items
SET is_active = false
WHERE menu_group = 'breakfast'
  AND (
    lower(name) IN ('breakfast set a', 'breakfast set b', '早餐套餐 a', '早餐套餐 b')
    OR COALESCE(category, '') IN ('Breakfast', '早餐')
  );
