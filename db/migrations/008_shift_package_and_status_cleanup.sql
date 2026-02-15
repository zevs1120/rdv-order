UPDATE orders
SET status = 'submitted'
WHERE status IN ('preparing', 'served');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_status_check'
  ) THEN
    ALTER TABLE orders DROP CONSTRAINT orders_status_check;
  END IF;
END $$;

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('submitted', 'paid', 'closed'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_menu_group_check'
  ) THEN
    ALTER TABLE menu_items DROP CONSTRAINT menu_items_menu_group_check;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_menu_group_check1'
  ) THEN
    ALTER TABLE menu_items DROP CONSTRAINT menu_items_menu_group_check1;
  END IF;
END $$;

ALTER TABLE menu_items
  ADD CONSTRAINT menu_items_menu_group_check
  CHECK (menu_group IN ('breakfast', 'lunch_dinner', 'cocktail', 'set_menu'));

INSERT INTO menu_items
  (name, price, category, description, menu_group, item_type, is_active, is_temporary, sort_order, allergens, available_shifts)
SELECT
  x.name, x.price, '套餐', NULL, 'set_menu', 'set', true, false, x.sort_order, '{}'::text[], ARRAY['package']::text[]
FROM (
  VALUES
    ('套餐 A', 299, 5),
    ('套餐 B', 399, 6)
) AS x(name, price, sort_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM menu_items mi
  WHERE mi.name = x.name
    AND mi.menu_group = 'set_menu'
);

UPDATE menu_items
SET is_active = false
WHERE category IN ('热菜', '主食', '饮品', 'Hot Dish', 'Staple', 'Drink', 'Drinks');
