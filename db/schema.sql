CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('waiter', 'manager')),
  pin_salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price INT NOT NULL,
  category TEXT,
  description TEXT,
  menu_group TEXT NOT NULL CHECK (menu_group IN ('breakfast', 'lunch_dinner', 'cocktail')),
  item_type TEXT NOT NULL DEFAULT 'single' CHECK (item_type IN ('single', 'set')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_temporary BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_no TEXT NOT NULL,
  waiter_id UUID REFERENCES users(id),
  client_request_id TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id),
  qty INT NOT NULL CHECK (qty > 0)
);

CREATE TABLE print_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'printing', 'printed', 'failed')),
  retry_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE table_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_no TEXT NOT NULL,
  guest_count INT NOT NULL CHECK (guest_count > 0),
  opened_by UUID REFERENCES users(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX table_sessions_open_unique_idx
  ON table_sessions(table_no)
  WHERE closed_at IS NULL;

CREATE TABLE table_session_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
  table_no TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX table_session_tables_unique_idx
  ON table_session_tables(session_id, table_no);

CREATE UNIQUE INDEX orders_waiter_request_unique_idx
  ON orders(waiter_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX orders_created_at_idx
  ON orders(created_at DESC);

CREATE INDEX orders_table_created_idx
  ON orders(table_no, created_at DESC);

CREATE INDEX orders_status_created_idx
  ON orders(status, created_at DESC);

CREATE INDEX orders_waiter_created_idx
  ON orders(waiter_id, created_at DESC);

CREATE INDEX order_items_order_id_idx
  ON order_items(order_id);

CREATE INDEX order_items_menu_item_id_idx
  ON order_items(menu_item_id);

CREATE INDEX menu_items_lookup_idx
  ON menu_items(menu_group, is_active, is_temporary, sort_order, name);

CREATE UNIQUE INDEX print_jobs_order_unique_idx
  ON print_jobs(order_id);

CREATE INDEX print_jobs_status_created_idx
  ON print_jobs(status, created_at);

CREATE INDEX table_session_tables_table_idx
  ON table_session_tables(table_no);
