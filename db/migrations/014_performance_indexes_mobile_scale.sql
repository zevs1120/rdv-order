CREATE INDEX IF NOT EXISTS menu_items_available_shifts_gin_idx
  ON menu_items USING GIN (available_shifts);

CREATE INDEX IF NOT EXISTS menu_items_active_group_sort_idx
  ON menu_items(menu_group, sort_order, name)
  WHERE is_active = true AND is_temporary = false;

CREATE INDEX IF NOT EXISTS menu_items_category_lower_idx
  ON menu_items((lower(trim(COALESCE(category, '')))));

CREATE INDEX IF NOT EXISTS orders_table_status_created_idx
  ON orders(table_no, status, created_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'order_items' AND column_name = 'note'
  ) THEN
    CREATE INDEX IF NOT EXISTS order_items_order_menu_note_idx
      ON order_items(order_id, menu_item_id, note);
  ELSE
    CREATE INDEX IF NOT EXISTS order_items_order_menu_idx
      ON order_items(order_id, menu_item_id);
  END IF;
END $$;
