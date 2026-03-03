-- Speed up high-frequency table bill lookups (open tables, unpaid orders).
CREATE INDEX IF NOT EXISTS orders_table_bill_open_idx
  ON orders(table_no, created_at DESC)
  WHERE cancelled_at IS NULL
    AND merged_into_order_id IS NULL
    AND status IN ('submitted', 'paid');

-- Speed up hot-items / revenue reports over paid history.
CREATE INDEX IF NOT EXISTS orders_paid_report_idx
  ON orders(created_at DESC)
  WHERE cancelled_at IS NULL
    AND status IN ('paid', 'closed');

-- Speed up print worker retry scan based on status + updated_at.
CREATE INDEX IF NOT EXISTS print_jobs_status_updated_idx
  ON print_jobs(status, updated_at ASC, created_at ASC);

-- Speed up beverage shift filtering with available_shifts array.
CREATE INDEX IF NOT EXISTS menu_items_available_shifts_gin_idx
  ON menu_items USING GIN (available_shifts);

-- Speed up open-session table lookup.
CREATE INDEX IF NOT EXISTS table_sessions_open_lookup_idx
  ON table_sessions(table_no, opened_at DESC)
  WHERE closed_at IS NULL;
