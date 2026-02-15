CREATE TABLE IF NOT EXISTS table_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_no TEXT NOT NULL,
  guest_count INT NOT NULL CHECK (guest_count > 0),
  opened_by UUID REFERENCES users(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS table_sessions_open_unique_idx
  ON table_sessions(table_no)
  WHERE closed_at IS NULL;
