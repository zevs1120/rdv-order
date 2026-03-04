import type Database from 'better-sqlite3';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS assets (
  asset_id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO')),
  venue TEXT NOT NULL,
  base TEXT,
  quote TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(symbol, market, venue)
);

CREATE TABLE IF NOT EXISTS ohlcv (
  asset_id INTEGER NOT NULL,
  timeframe TEXT NOT NULL,
  ts_open INTEGER NOT NULL,
  open TEXT NOT NULL,
  high TEXT NOT NULL,
  low TEXT NOT NULL,
  close TEXT NOT NULL,
  volume TEXT NOT NULL,
  source TEXT NOT NULL,
  ingest_at INTEGER NOT NULL,
  PRIMARY KEY(asset_id, timeframe, ts_open),
  FOREIGN KEY(asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ohlcv_lookup ON ohlcv(asset_id, timeframe, ts_open);

CREATE TABLE IF NOT EXISTS ingest_cursors (
  asset_id INTEGER NOT NULL,
  timeframe TEXT NOT NULL,
  last_ts_open INTEGER NOT NULL,
  source TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(asset_id, timeframe),
  FOREIGN KEY(asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ingest_anomalies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER,
  timeframe TEXT NOT NULL,
  ts_open INTEGER,
  anomaly_type TEXT NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(asset_id) REFERENCES assets(asset_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS funding_rates (
  asset_id INTEGER NOT NULL,
  ts_open INTEGER NOT NULL,
  funding_rate TEXT NOT NULL,
  source TEXT NOT NULL,
  ingest_at INTEGER NOT NULL,
  PRIMARY KEY(asset_id, ts_open),
  FOREIGN KEY(asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS basis_snapshots (
  asset_id INTEGER NOT NULL,
  ts_open INTEGER NOT NULL,
  basis_bps TEXT NOT NULL,
  source TEXT NOT NULL,
  ingest_at INTEGER NOT NULL,
  PRIMARY KEY(asset_id, ts_open),
  FOREIGN KEY(asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  provider TEXT NOT NULL,
  message TEXT NOT NULL,
  context_json TEXT,
  status TEXT NOT NULL,
  error TEXT,
  response_preview TEXT,
  duration_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS signals (
  signal_id TEXT PRIMARY KEY,
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO')),
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  strategy_id TEXT NOT NULL,
  strategy_family TEXT NOT NULL,
  strategy_version TEXT NOT NULL,
  regime_id TEXT NOT NULL,
  temperature_percentile REAL NOT NULL,
  volatility_percentile REAL NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT', 'FLAT')),
  strength REAL NOT NULL,
  confidence REAL NOT NULL,
  entry_low REAL NOT NULL,
  entry_high REAL NOT NULL,
  entry_method TEXT NOT NULL,
  invalidation_level REAL NOT NULL,
  stop_type TEXT NOT NULL,
  stop_price REAL NOT NULL,
  tp1_price REAL,
  tp1_size_pct REAL,
  tp2_price REAL,
  tp2_size_pct REAL,
  trailing_type TEXT NOT NULL,
  trailing_params_json TEXT NOT NULL,
  position_pct REAL NOT NULL,
  leverage_cap REAL NOT NULL,
  risk_bucket_applied TEXT NOT NULL,
  fee_bps REAL NOT NULL,
  spread_bps REAL NOT NULL,
  slippage_bps REAL NOT NULL,
  funding_est_bps REAL,
  basis_est REAL,
  expected_r REAL NOT NULL,
  hit_rate_est REAL NOT NULL,
  sample_size INTEGER NOT NULL,
  expected_max_dd_est REAL,
  status TEXT NOT NULL CHECK (status IN ('NEW', 'TRIGGERED', 'EXPIRED', 'INVALIDATED')),
  score REAL NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_signals_lookup ON signals(market, status, score DESC, created_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_signals_symbol_tf ON signals(symbol, timeframe, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS signal_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY(signal_id) REFERENCES signals(signal_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_signal_events_signal ON signal_events(signal_id, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS executions (
  execution_id TEXT PRIMARY KEY,
  signal_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('PAPER', 'LIVE')),
  action TEXT NOT NULL CHECK (action IN ('EXECUTE', 'DONE', 'CLOSE')),
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO')),
  symbol TEXT NOT NULL,
  entry_price REAL,
  stop_price REAL,
  tp_price REAL,
  size_pct REAL,
  pnl_pct REAL,
  note TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY(signal_id) REFERENCES signals(signal_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_executions_signal ON executions(signal_id, created_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_executions_user ON executions(user_id, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS user_risk_profiles (
  user_id TEXT PRIMARY KEY,
  profile_key TEXT NOT NULL CHECK (profile_key IN ('conservative', 'balanced', 'aggressive')),
  max_loss_per_trade REAL NOT NULL,
  max_daily_loss REAL NOT NULL,
  max_drawdown REAL NOT NULL,
  exposure_cap REAL NOT NULL,
  leverage_cap REAL NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS market_state (
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO')),
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  snapshot_ts_ms INTEGER NOT NULL,
  regime_id TEXT NOT NULL,
  trend_strength REAL NOT NULL,
  temperature_percentile REAL NOT NULL,
  volatility_percentile REAL NOT NULL,
  risk_off_score REAL NOT NULL,
  stance TEXT NOT NULL,
  event_stats_json TEXT NOT NULL,
  assumptions_json TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY(market, symbol, timeframe)
);

CREATE INDEX IF NOT EXISTS idx_market_state_market ON market_state(market, temperature_percentile DESC);

CREATE TABLE IF NOT EXISTS performance_snapshots (
  market TEXT NOT NULL CHECK (market IN ('US', 'CRYPTO')),
  range TEXT NOT NULL,
  segment_type TEXT NOT NULL CHECK (segment_type IN ('OVERALL', 'STRATEGY', 'REGIME', 'DEVIATION')),
  segment_key TEXT NOT NULL,
  source_label TEXT NOT NULL CHECK (source_label IN ('BACKTEST', 'PAPER', 'LIVE', 'MIXED')),
  sample_size INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  asof_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY(market, range, segment_type, segment_key)
);

CREATE INDEX IF NOT EXISTS idx_performance_snapshots ON performance_snapshots(market, range, segment_type, sample_size DESC);
`;

export function ensureSchema(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
}
