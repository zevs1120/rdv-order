CREATE TABLE IF NOT EXISTS table_session_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
  table_no TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS table_session_tables_unique_idx
  ON table_session_tables(session_id, table_no);

INSERT INTO table_session_tables (session_id, table_no)
SELECT ts.id, ts.table_no
FROM table_sessions ts
WHERE ts.closed_at IS NULL
  AND ts.table_no NOT LIKE '%+%'
  AND NOT EXISTS (
    SELECT 1 FROM table_session_tables t WHERE t.session_id = ts.id AND t.table_no = ts.table_no
  );
