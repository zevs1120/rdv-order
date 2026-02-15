UPDATE orders
SET status = 'closed'
WHERE status = 'cancelled';

UPDATE orders
SET status = 'closed'
WHERE status = 'paid';

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
  CHECK (status IN ('submitted', 'preparing', 'served', 'paid', 'closed'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_events_event_type_check'
  ) THEN
    ALTER TABLE order_events DROP CONSTRAINT order_events_event_type_check;
  END IF;
END $$;

ALTER TABLE order_events
  ADD CONSTRAINT order_events_event_type_check
  CHECK (
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
  );

CREATE TABLE IF NOT EXISTS pricing_rules (
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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_charges_charge_type_check'
  ) THEN
    ALTER TABLE order_charges DROP CONSTRAINT order_charges_charge_type_check;
  END IF;
END $$;

ALTER TABLE order_charges
  ADD CONSTRAINT order_charges_charge_type_check
  CHECK (charge_type IN ('discount', 'service_fee', 'tax'));

ALTER TABLE order_charges
  ADD COLUMN IF NOT EXISTS rule_id UUID REFERENCES pricing_rules(id),
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_charges_source_check'
  ) THEN
    ALTER TABLE order_charges DROP CONSTRAINT order_charges_source_check;
  END IF;
END $$;

ALTER TABLE order_charges
  ADD CONSTRAINT order_charges_source_check
  CHECK (source IN ('manual', 'rule_auto'));

CREATE UNIQUE INDEX IF NOT EXISTS order_charges_rule_unique_idx
  ON order_charges(order_id, rule_id, source)
  WHERE rule_id IS NOT NULL;

INSERT INTO pricing_rules (name, charge_type, mode, value, is_active, sort_order)
VALUES
  ('Default Discount 10%', 'discount', 'percent', 10, false, 10),
  ('Default Service Fee 10%', 'service_fee', 'percent', 10, false, 20),
  ('Default Tax 12%', 'tax', 'percent', 12, false, 30)
ON CONFLICT DO NOTHING;
