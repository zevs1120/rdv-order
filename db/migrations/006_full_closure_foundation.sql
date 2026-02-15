ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT,
  ADD COLUMN IF NOT EXISTS merged_into_order_id UUID REFERENCES orders(id),
  ADD COLUMN IF NOT EXISTS split_from_order_id UUID REFERENCES orders(id),
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS order_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  charge_type TEXT NOT NULL CHECK (charge_type IN ('discount', 'service_fee')),
  mode TEXT NOT NULL CHECK (mode IN ('amount', 'percent')),
  value INT NOT NULL CHECK (value > 0),
  amount INT NOT NULL,
  note TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_charges_order_idx
  ON order_charges(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_events (
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

CREATE INDEX IF NOT EXISTS order_events_order_idx
  ON order_events(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS kitchen_tickets (
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

CREATE UNIQUE INDEX IF NOT EXISTS kitchen_tickets_order_item_unique_idx
  ON kitchen_tickets(order_item_id);

CREATE INDEX IF NOT EXISTS kitchen_tickets_status_idx
  ON kitchen_tickets(status, created_at DESC);

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS allergens TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS available_shifts TEXT[] NOT NULL DEFAULT '{}'::text[];

UPDATE menu_items
SET available_shifts = CASE
  WHEN menu_group = 'breakfast' THEN ARRAY['breakfast']
  WHEN menu_group = 'cocktail' THEN ARRAY['cocktail']
  ELSE ARRAY['lunch', 'dinner']
END
WHERE COALESCE(array_length(available_shifts, 1), 0) = 0;

CREATE TABLE IF NOT EXISTS menu_item_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  child_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  qty INT NOT NULL CHECK (qty > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(parent_item_id, child_item_id)
);

CREATE TABLE IF NOT EXISTS cashier_closings (
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

CREATE INDEX IF NOT EXISTS cashier_closings_time_idx
  ON cashier_closings(from_time DESC, to_time DESC);

CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT NOT NULL CHECK (role IN ('waiter', 'manager')),
  permission TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role, permission)
);

INSERT INTO role_permissions (role, permission, allowed)
VALUES
  ('waiter', 'order.create', true),
  ('waiter', 'order.return_item', true),
  ('waiter', 'order.cancel', false),
  ('waiter', 'order.adjust_charge', false),
  ('waiter', 'order.split_merge', false),
  ('waiter', 'order.delete', false),
  ('waiter', 'cashier.reverse_checkout', false),
  ('waiter', 'cashier.close_shift', false),
  ('waiter', 'kitchen.view', true),
  ('waiter', 'kitchen.update', false),
  ('waiter', 'kitchen.rush', true),
  ('waiter', 'report.orders', true),
  ('waiter', 'report.finance', false),
  ('waiter', 'report.ops', false),
  ('waiter', 'menu.manage', false),
  ('waiter', 'rbac.manage', false),
  ('waiter', 'device.view', false),
  ('waiter', 'device.manage', false),
  ('manager', 'order.create', true),
  ('manager', 'order.return_item', true),
  ('manager', 'order.cancel', true),
  ('manager', 'order.adjust_charge', true),
  ('manager', 'order.split_merge', true),
  ('manager', 'order.delete', true),
  ('manager', 'cashier.reverse_checkout', true),
  ('manager', 'cashier.close_shift', true),
  ('manager', 'kitchen.view', true),
  ('manager', 'kitchen.update', true),
  ('manager', 'kitchen.rush', true),
  ('manager', 'report.orders', true),
  ('manager', 'report.finance', true),
  ('manager', 'report.ops', true),
  ('manager', 'menu.manage', true),
  ('manager', 'rbac.manage', true),
  ('manager', 'device.view', true),
  ('manager', 'device.manage', true)
ON CONFLICT (role, permission) DO NOTHING;

CREATE TABLE IF NOT EXISTS audit_logs (
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

CREATE INDEX IF NOT EXISTS audit_logs_actor_idx
  ON audit_logs(actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON audit_logs(entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS device_status (
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

INSERT INTO device_status (device_code, device_type, label, status, is_backup)
VALUES
  ('printer-primary', 'printer', 'Primary Printer', 'offline', false),
  ('printer-backup', 'printer', 'Backup Printer', 'offline', true)
ON CONFLICT (device_code) DO NOTHING;
