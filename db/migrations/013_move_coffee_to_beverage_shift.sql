UPDATE menu_items
SET available_shifts = ARRAY['beverage']::text[]
WHERE menu_group = 'lunch_dinner'
  AND lower(trim(COALESCE(category, ''))) IN (
    'coffee',
    'coffees',
    '咖啡'
  );
