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
  menu_group TEXT NOT NULL CHECK (menu_group IN ('breakfast', 'lunch_dinner', 'cocktail', 'set_menu')),
  item_type TEXT NOT NULL DEFAULT 'single' CHECK (item_type IN ('single', 'set')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_temporary BOOLEAN NOT NULL DEFAULT false,
  allergens TEXT[] NOT NULL DEFAULT '{}'::text[],
  available_shifts TEXT[] NOT NULL DEFAULT '{}'::text[],
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_no TEXT NOT NULL,
  waiter_id UUID REFERENCES users(id),
  client_request_id TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'paid', 'closed')),
  paid_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES users(id),
  cancelled_reason TEXT,
  merged_into_order_id UUID REFERENCES orders(id),
  split_from_order_id UUID REFERENCES orders(id),
  reversed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id),
  qty INT NOT NULL CHECK (qty > 0),
  note TEXT
);

CREATE TABLE order_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  charge_type TEXT NOT NULL CHECK (charge_type IN ('discount', 'service_fee', 'tax')),
  mode TEXT NOT NULL CHECK (mode IN ('amount', 'percent')),
  value INT NOT NULL CHECK (value > 0),
  amount INT NOT NULL,
  note TEXT,
  created_by UUID REFERENCES users(id),
  rule_id UUID,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'rule_auto')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'created',
      'serve',
      'return_item',
      'cancel',
      'discount',
      'service_fee',
      'tax',
      'split_out',
      'split_in',
      'merge_out',
      'merge_in',
      'checkout',
      'reverse_checkout'
    )
  ),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE kitchen_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  table_no TEXT NOT NULL,
  dish_name TEXT NOT NULL,
  qty INT NOT NULL CHECK (qty > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'cooking', 'ready', 'served', 'cancelled')),
  rush_count INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  served_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE menu_item_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  child_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  qty INT NOT NULL CHECK (qty > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(parent_item_id, child_item_id)
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

CREATE TABLE cashier_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_label TEXT,
  from_time TIMESTAMPTZ NOT NULL,
  to_time TIMESTAMPTZ NOT NULL,
  expected_amount INT NOT NULL,
  actual_amount INT NOT NULL,
  variance_amount INT NOT NULL,
  note TEXT,
  closed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  charge_type TEXT NOT NULL CHECK (charge_type IN ('discount', 'service_fee', 'tax')),
  mode TEXT NOT NULL CHECK (mode IN ('amount', 'percent')),
  value INT NOT NULL CHECK (value > 0),
  is_active BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE order_charges
  ADD CONSTRAINT order_charges_rule_id_fkey
  FOREIGN KEY (rule_id)
  REFERENCES pricing_rules(id);

CREATE TABLE role_permissions (
  role TEXT NOT NULL CHECK (role IN ('waiter', 'manager')),
  permission TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role, permission)
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE device_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_code TEXT NOT NULL UNIQUE,
  device_type TEXT NOT NULL CHECK (device_type IN ('printer', 'kds')),
  label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('online', 'offline', 'degraded')),
  is_backup BOOLEAN NOT NULL DEFAULT false,
  fail_count INT NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
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

CREATE INDEX orders_table_bill_open_idx
  ON orders(table_no, created_at DESC)
  WHERE cancelled_at IS NULL
    AND merged_into_order_id IS NULL
    AND status IN ('submitted', 'paid');

CREATE INDEX orders_paid_report_idx
  ON orders(created_at DESC)
  WHERE cancelled_at IS NULL
    AND status IN ('paid', 'closed');

CREATE INDEX order_items_order_id_idx
  ON order_items(order_id);

CREATE INDEX order_items_menu_item_id_idx
  ON order_items(menu_item_id);

CREATE INDEX order_charges_order_idx
  ON order_charges(order_id, created_at DESC);

CREATE UNIQUE INDEX order_charges_rule_unique_idx
  ON order_charges(order_id, rule_id, source)
  WHERE rule_id IS NOT NULL;

CREATE INDEX order_events_order_idx
  ON order_events(order_id, created_at DESC);

CREATE UNIQUE INDEX kitchen_tickets_order_item_unique_idx
  ON kitchen_tickets(order_item_id);

CREATE INDEX kitchen_tickets_status_idx
  ON kitchen_tickets(status, created_at DESC);

CREATE INDEX menu_items_lookup_idx
  ON menu_items(menu_group, is_active, is_temporary, sort_order, name);

CREATE INDEX menu_items_available_shifts_gin_idx
  ON menu_items USING GIN (available_shifts);

CREATE UNIQUE INDEX print_jobs_order_unique_idx
  ON print_jobs(order_id);

CREATE INDEX print_jobs_status_created_idx
  ON print_jobs(status, created_at);

CREATE INDEX print_jobs_status_updated_idx
  ON print_jobs(status, updated_at ASC, created_at ASC);

CREATE INDEX table_session_tables_table_idx
  ON table_session_tables(table_no);

CREATE INDEX table_sessions_open_lookup_idx
  ON table_sessions(table_no, opened_at DESC)
  WHERE closed_at IS NULL;

CREATE INDEX cashier_closings_time_idx
  ON cashier_closings(from_time DESC, to_time DESC);

CREATE INDEX audit_logs_actor_idx
  ON audit_logs(actor_user_id, created_at DESC);

CREATE INDEX audit_logs_entity_idx
  ON audit_logs(entity_type, entity_id, created_at DESC);
