-- Compact breakfast category labels. Existing items keep their immutable codes.
BEGIN;

UPDATE menu_items
SET category = CASE category
  WHEN 'Complimentary Breakfast' THEN 'Free'
  WHEN 'Breakfast Set' THEN 'Set'
  WHEN 'Breakfast Add-ons' THEN 'Add-ons'
  WHEN 'Breakfast Beverages' THEN 'Coffee'
END
WHERE is_active
  AND NOT is_temporary
  AND menu_group = 'breakfast'
  AND category IN ('Complimentary Breakfast', 'Breakfast Set', 'Breakfast Add-ons', 'Breakfast Beverages');

UPDATE menu_subcategories
SET name = 'Set'
WHERE shift_key = 'breakfast'
  AND is_active
  AND name = 'Breakfast Set';

COMMIT;
