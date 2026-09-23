-- New print pipeline only. Existing print_jobs are deliberately untouched.
CREATE TABLE IF NOT EXISTS print_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('order', 'receipt', 'self_test', 'reprint')),
  intent_key TEXT NOT NULL,
  order_id UUID REFERENCES orders(id),
  printer_sn TEXT NOT NULL,
  content TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  content_sha256 CHAR(64) NOT NULL,
  provider_key CHAR(48) NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN
    ('queued', 'sending', 'accepted', 'unknown', 'failed', 'expired', 'completed', 'cancelled')),
  attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  unknown_retry_count INT NOT NULL DEFAULT 0 CHECK (unknown_retry_count BETWEEN 0 AND 1),
  remote_id TEXT,
  last_error TEXT,
  first_attempt_at TIMESTAMPTZ,
  sending_started_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_token UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, intent_key),
  UNIQUE (provider_key),
  CHECK ((kind = 'order' AND order_id IS NOT NULL)
    OR kind = 'reprint'
    OR (kind IN ('receipt', 'self_test') AND order_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS print_deliveries_order_unique_idx
  ON print_deliveries(order_id) WHERE kind = 'order';
CREATE UNIQUE INDEX IF NOT EXISTS print_deliveries_one_sender_per_sn_idx
  ON print_deliveries(printer_sn) WHERE status = 'sending';
CREATE INDEX IF NOT EXISTS print_deliveries_ready_idx
  ON print_deliveries(next_attempt_at, created_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS print_deliveries_accepted_idx
  ON print_deliveries(updated_at) WHERE status = 'accepted';

CREATE OR REPLACE FUNCTION prevent_print_delivery_snapshot_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind IS DISTINCT FROM OLD.kind OR NEW.intent_key IS DISTINCT FROM OLD.intent_key
    OR NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.printer_sn IS DISTINCT FROM OLD.printer_sn
    OR NEW.content IS DISTINCT FROM OLD.content OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
    OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
    OR NEW.provider_key IS DISTINCT FROM OLD.provider_key THEN
    RAISE EXCEPTION 'print delivery snapshot is immutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS print_delivery_snapshot_immutable ON print_deliveries;
CREATE TRIGGER print_delivery_snapshot_immutable BEFORE UPDATE ON print_deliveries
FOR EACH ROW EXECUTE FUNCTION prevent_print_delivery_snapshot_change();
