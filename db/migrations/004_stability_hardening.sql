ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS client_request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS orders_waiter_request_unique_idx
  ON orders(waiter_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_created_at_idx
  ON orders(created_at DESC);

CREATE INDEX IF NOT EXISTS orders_table_created_idx
  ON orders(table_no, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_status_created_idx
  ON orders(status, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_waiter_created_idx
  ON orders(waiter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx
  ON order_items(order_id);

CREATE INDEX IF NOT EXISTS order_items_menu_item_id_idx
  ON order_items(menu_item_id);

CREATE INDEX IF NOT EXISTS menu_items_lookup_idx
  ON menu_items(menu_group, is_active, sort_order, name);

CREATE UNIQUE INDEX IF NOT EXISTS print_jobs_order_unique_idx
  ON print_jobs(order_id);

CREATE INDEX IF NOT EXISTS print_jobs_status_created_idx
  ON print_jobs(status, created_at);

CREATE INDEX IF NOT EXISTS table_session_tables_table_idx
  ON table_session_tables(table_no);

