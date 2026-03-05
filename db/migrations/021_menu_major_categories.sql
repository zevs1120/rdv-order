CREATE TABLE IF NOT EXISTS menu_major_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_\\-]+$'),
  menu_group TEXT NOT NULL CHECK (menu_group IN ('breakfast', 'lunch_dinner', 'cocktail', 'set_menu')),
  label_en TEXT NOT NULL,
  label_zh TEXT NOT NULL,
  include_empty_shift_items BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS menu_major_categories_unique_active_key_idx
  ON menu_major_categories(key)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS menu_major_categories_lookup_idx
  ON menu_major_categories(is_active, sort_order, key);

INSERT INTO menu_major_categories (key, menu_group, label_en, label_zh, include_empty_shift_items, sort_order, is_active)
VALUES
  ('breakfast', 'breakfast', 'Breakfast', '早餐', true, 10, true),
  ('lunch', 'lunch_dinner', 'Lunch', '午餐', true, 20, true),
  ('dinner', 'lunch_dinner', 'Dinner', '晚餐', true, 30, true),
  ('beverage', 'lunch_dinner', 'Beverage', '饮品', false, 40, true),
  ('cocktail', 'cocktail', 'Cocktail', '鸡尾酒', true, 50, true),
  ('package', 'set_menu', 'Package', '套餐', true, 60, true)
ON CONFLICT (key) DO UPDATE
SET menu_group = EXCLUDED.menu_group,
    label_en = EXCLUDED.label_en,
    label_zh = EXCLUDED.label_zh,
    include_empty_shift_items = EXCLUDED.include_empty_shift_items,
    sort_order = EXCLUDED.sort_order,
    is_active = true,
    updated_at = now();

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'menu_subcategories'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%shift_key%'
  LOOP
    EXECUTE format('ALTER TABLE public.menu_subcategories DROP CONSTRAINT %I', r.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'menu_subcategories'
      AND c.conname = 'menu_subcategories_shift_key_format_chk'
  ) THEN
    ALTER TABLE public.menu_subcategories
      ADD CONSTRAINT menu_subcategories_shift_key_format_chk
      CHECK (shift_key ~ '^[a-z0-9_\\-]+$');
  END IF;
END $$;
