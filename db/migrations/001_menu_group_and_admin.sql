ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS menu_group TEXT,
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'single';

UPDATE menu_items
SET menu_group = CASE
  WHEN category = '鸡尾酒' THEN 'cocktail'
  ELSE 'lunch_dinner'
END
WHERE menu_group IS NULL;

ALTER TABLE menu_items
  ALTER COLUMN menu_group SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_menu_group_check'
  ) THEN
    ALTER TABLE menu_items
      ADD CONSTRAINT menu_items_menu_group_check
      CHECK (menu_group IN ('breakfast', 'lunch_dinner', 'cocktail'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_item_type_check'
  ) THEN
    ALTER TABLE menu_items
      ADD CONSTRAINT menu_items_item_type_check
      CHECK (item_type IN ('single', 'set'));
  END IF;
END $$;
