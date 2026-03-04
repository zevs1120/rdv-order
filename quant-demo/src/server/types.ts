export type Market = 'US' | 'CRYPTO';
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '1d';
export type SignalDirection = 'LONG' | 'SHORT' | 'FLAT';
export type SignalStatus = 'NEW' | 'TRIGGERED' | 'EXPIRED' | 'INVALIDATED';
export type RiskProfileKey = 'conservative' | 'balanced' | 'aggressive';
export type ExecutionMode = 'PAPER' | 'LIVE';
export type ExecutionAction = 'EXECUTE' | 'DONE' | 'CLOSE';

export interface Asset {
  asset_id: number;
  symbol: string;
  market: Market;
  venue: string;
  base: string | null;
  quote: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface AssetInput {
  symbol: string;
  market: Market;
  venue: string;
  base?: string | null;
  quote?: string | null;
  status?: string;
}

export interface NormalizedBar {
  ts_open: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface OhlcvRow extends NormalizedBar {
  asset_id: number;
  timeframe: Timeframe;
  source: string;
  ingest_at: number;
}

export interface OhlcvQuery {
  market: Market;
  symbol: string;
  timeframe: Timeframe;
  start?: number;
  end?: number;
  limit?: number;
}

export interface RetryConfig {
  attempts: number;
  baseDelayMs: number;
}

export interface SignalContract {
  id: string;
  created_at: string;
  expires_at: string;
  market: Market;
  symbol: string;
  timeframe: string;
  strategy_id: string;
  strategy_family: string;
  strategy_version: string;
  regime_id: string;
  temperature_percentile: number;
  volatility_percentile: number;
  direction: SignalDirection;
  strength: number;
  confidence: number;
  entry_zone: {
    low: number;
    high: number;
    method: 'MARKET' | 'LIMIT' | 'SPLIT_LIMIT';
    notes?: string;
  };
  invalidation_level: number;
  stop_loss: {
    type: 'STRUCTURE' | 'ATR' | 'HYBRID';
    price: number;
    rationale: string;
  };
  take_profit_levels: Array<{
    price: number;
    size_pct: number;
    rationale: string;
  }>;
  trailing_rule: {
    type: 'EMA' | 'CHAND_EXIT' | 'NONE';
    params: Record<string, unknown>;
  };
  position_advice: {
    position_pct: number;
    leverage_cap: number;
    risk_bucket_applied: string;
    rationale: string;
  };
  cost_model: {
    fee_bps: number;
    spread_bps: number;
    slippage_bps: number;
    funding_est_bps?: number;
    basis_est?: number;
  };
  expected_metrics: {
    expected_R: number;
    hit_rate_est: number;
    sample_size: number;
    expected_max_dd_est?: number;
  };
  explain_bullets: string[];
  execution_checklist: string[];
  tags: string[];
  status: SignalStatus;
  references?: {
    chart_url?: string;
    docs_url?: string;
  };
  score: number;
  payload_version: string;
}

export interface SignalRecord {
  signal_id: string;
  created_at_ms: number;
  expires_at_ms: number;
  market: Market;
  symbol: string;
  timeframe: string;
  strategy_id: string;
  strategy_family: string;
  strategy_version: string;
  regime_id: string;
  temperature_percentile: number;
  volatility_percentile: number;
  direction: SignalDirection;
  strength: number;
  confidence: number;
  entry_low: number;
  entry_high: number;
  entry_method: string;
  invalidation_level: number;
  stop_type: string;
  stop_price: number;
  tp1_price: number | null;
  tp1_size_pct: number | null;
  tp2_price: number | null;
  tp2_size_pct: number | null;
  trailing_type: string;
  trailing_params_json: string;
  position_pct: number;
  leverage_cap: number;
  risk_bucket_applied: string;
  fee_bps: number;
  spread_bps: number;
  slippage_bps: number;
  funding_est_bps: number | null;
  basis_est: number | null;
  expected_r: number;
  hit_rate_est: number;
  sample_size: number;
  expected_max_dd_est: number | null;
  status: SignalStatus;
  score: number;
  payload_json: string;
  updated_at_ms: number;
}

export interface SignalEventRecord {
  id?: number;
  signal_id: string;
  event_type: string;
  payload_json?: string;
  created_at_ms: number;
}

export interface ExecutionRecord {
  execution_id: string;
  signal_id: string;
  user_id: string;
  mode: ExecutionMode;
  action: ExecutionAction;
  market: Market;
  symbol: string;
  entry_price?: number | null;
  stop_price?: number | null;
  tp_price?: number | null;
  size_pct?: number | null;
  pnl_pct?: number | null;
  note?: string | null;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface UserRiskProfileRecord {
  user_id: string;
  profile_key: RiskProfileKey;
  max_loss_per_trade: number;
  max_daily_loss: number;
  max_drawdown: number;
  exposure_cap: number;
  leverage_cap: number;
  updated_at_ms: number;
}

export interface MarketStateRecord {
  market: Market;
  symbol: string;
  timeframe: string;
  snapshot_ts_ms: number;
  regime_id: string;
  trend_strength: number;
  temperature_percentile: number;
  volatility_percentile: number;
  risk_off_score: number;
  stance: string;
  event_stats_json: string;
  assumptions_json: string;
  updated_at_ms: number;
}

export interface PerformanceSnapshotRecord {
  market: Market;
  range: string;
  segment_type: 'OVERALL' | 'STRATEGY' | 'REGIME' | 'DEVIATION';
  segment_key: string;
  source_label: 'BACKTEST' | 'PAPER' | 'LIVE' | 'MIXED';
  sample_size: number;
  payload_json: string;
  asof_ms: number;
  updated_at_ms: number;
}

export interface AppConfig {
  database: {
    driver: 'sqlite';
    path: string;
  };
  markets: {
    US: {
      venue: string;
      symbols: string[];
    };
    CRYPTO: {
      venue: string;
      symbols: string[];
    };
  };
  timeframes: Timeframe[];
  stooq: {
    baseUrl: string;
    bulkPackCodes: Partial<Record<Timeframe, string>>;
    timeoutMs: number;
    batchSize: number;
  };
  binancePublic: {
    baseUrl: string;
    pathPrefix: string;
    startDate: string;
    lookbackDailyDays: number;
    concurrency: number;
  };
  binanceRest: {
    baseUrl: string;
    limit: number;
    requestDelayMs: number;
    retry: RetryConfig;
  };
}
