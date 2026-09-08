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

CREATE TABLE menu_major_categories (
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

CREATE TABLE menu_subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_key TEXT NOT NULL CHECK (shift_key ~ '^[a-z0-9_\\-]+$'),
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  display_name_zh TEXT,
  sort_order INT NOT NULL DEFAULT 1000,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
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

CREATE UNIQUE INDEX menu_major_categories_unique_active_key_idx
  ON menu_major_categories(key)
  WHERE is_active = true;

CREATE INDEX menu_major_categories_lookup_idx
  ON menu_major_categories(is_active, sort_order, key);

CREATE UNIQUE INDEX menu_subcategories_unique_active_name_idx
  ON menu_subcategories(shift_key, name_key)
  WHERE is_active = true;

CREATE INDEX menu_subcategories_lookup_idx
  ON menu_subcategories(shift_key, is_active, sort_order, name);

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

-- Apply before the menu refresh. Freeze the prices visible at migration time.
-- Historical prices before this snapshot cannot be reconstructed from this schema.
BEGIN;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS code integer UNIQUE;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS option_groups jsonb NOT NULL DEFAULT '[]';
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_complimentary boolean NOT NULL DEFAULT false;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_price integer;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS choices jsonb NOT NULL DEFAULT '{}';
UPDATE order_items oi SET unit_price = mi.price FROM menu_items mi
WHERE mi.id = oi.menu_item_id AND oi.unit_price IS NULL;

CREATE SEQUENCE IF NOT EXISTS menu_code_seq START 1;
SELECT setval('menu_code_seq', GREATEST(COALESCE((SELECT MAX(code) FROM menu_items),0)+1,
  (SELECT CASE WHEN is_called THEN last_value+1 ELSE last_value END FROM menu_code_seq)), false);
DO $$ DECLARE dish record; BEGIN
  FOR dish IN SELECT id FROM menu_items WHERE is_active AND NOT is_temporary AND code IS NULL
    ORDER BY CASE menu_group WHEN 'breakfast' THEN 1 WHEN 'lunch_dinner' THEN 2 WHEN 'cocktail' THEN 3 ELSE 4 END,
      sort_order, name, id
  LOOP
    UPDATE menu_items SET code = nextval('menu_code_seq') WHERE id = dish.id;
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION assign_menu_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS NULL AND NEW.is_active AND NOT NEW.is_temporary THEN
    NEW.code := nextval('menu_code_seq');
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.code IS NOT NULL AND NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'MENU_CODE_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS menu_code_assignment ON menu_items;
CREATE TRIGGER menu_code_assignment BEFORE INSERT OR UPDATE ON menu_items
FOR EACH ROW EXECUTE FUNCTION assign_menu_code();

-- One mandatory selection per group. Prices and printable labels come only
-- from the server's catalog. Split/merge explicitly copy the saved price/note.
CREATE OR REPLACE FUNCTION snapshot_order_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  dish menu_items%ROWTYPE;
  grp jsonb;
  opt jsonb;
  labels text[] := '{}';
BEGIN
  IF NEW.unit_price IS NOT NULL THEN RETURN NEW; END IF;
  SELECT * INTO STRICT dish FROM menu_items WHERE id = NEW.menu_item_id;
  NEW.unit_price := dish.price;
  IF jsonb_typeof(NEW.choices) <> 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(NEW.choices)) <> jsonb_array_length(dish.option_groups) THEN
    RAISE EXCEPTION 'INVALID_CHOICES';
  END IF;
  FOR grp IN SELECT value FROM jsonb_array_elements(dish.option_groups) LOOP
    SELECT value INTO opt FROM jsonb_array_elements(grp->'options')
      WHERE value->>'id' = NEW.choices->>(grp->>'id');
    IF opt IS NULL THEN RAISE EXCEPTION 'INVALID_CHOICES'; END IF;
    NEW.unit_price := NEW.unit_price + COALESCE((opt->>'price_delta')::integer, 0);
    labels := array_append(labels, (grp->>'label_en') || ': ' || (opt->>'label_en'));
  END LOOP;
  IF dish.is_complimentary THEN NEW.unit_price := 0; END IF;
  NEW.note := NULLIF(concat_ws('; ', NULLIF(array_to_string(labels, '; '), ''), NULLIF(NEW.note, '')), '');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS order_item_snapshot ON order_items;
CREATE TRIGGER order_item_snapshot BEFORE INSERT ON order_items
FOR EACH ROW EXECUTE FUNCTION snapshot_order_item();
COMMIT;
