ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS is_temporary BOOLEAN NOT NULL DEFAULT false;

UPDATE menu_items
SET is_temporary = false
WHERE is_temporary IS NULL;

DROP INDEX IF EXISTS menu_items_lookup_idx;

CREATE INDEX IF NOT EXISTS menu_items_lookup_idx
  ON menu_items(menu_group, is_active, is_temporary, sort_order, name);
