import type Database from 'better-sqlite3';
import type {
  Asset,
  AssetInput,
  ExecutionRecord,
  Market,
  MarketStateRecord,
  NormalizedBar,
  PerformanceSnapshotRecord,
  SignalContract,
  SignalRecord,
  SignalStatus,
  Timeframe,
  UserRiskProfileRecord
} from '../types.js';

function nowMs(): number {
  return Date.now();
}

export class MarketRepository {
  constructor(private readonly db: Database.Database) {}

  upsertAsset(input: AssetInput): Asset {
    const ts = nowMs();
    const stmt = this.db.prepare(`
      INSERT INTO assets(symbol, market, venue, base, quote, status, created_at, updated_at)
      VALUES(@symbol, @market, @venue, @base, @quote, @status, @created_at, @updated_at)
      ON CONFLICT(symbol, market, venue) DO UPDATE SET
        base = excluded.base,
        quote = excluded.quote,
        status = excluded.status,
        updated_at = excluded.updated_at
    `);

    stmt.run({
      symbol: input.symbol,
      market: input.market,
      venue: input.venue,
      base: input.base ?? null,
      quote: input.quote ?? null,
      status: input.status ?? 'ACTIVE',
      created_at: ts,
      updated_at: ts
    });

    const row = this.db
      .prepare(
        'SELECT asset_id, symbol, market, venue, base, quote, status, created_at, updated_at FROM assets WHERE symbol=? AND market=? AND venue=?'
      )
      .get(input.symbol, input.market, input.venue) as Asset | undefined;

    if (!row) throw new Error(`Failed to upsert asset ${input.symbol} (${input.market})`);
    return row;
  }

  getAssetBySymbol(market: string, symbol: string): Asset | null {
    const row = this.db
      .prepare(
        `SELECT asset_id, symbol, market, venue, base, quote, status, created_at, updated_at
         FROM assets WHERE market=? AND symbol=? AND status='ACTIVE' ORDER BY updated_at DESC LIMIT 1`
      )
      .get(market, symbol) as Asset | undefined;
    return row ?? null;
  }

  listAssets(market?: string): Asset[] {
    if (market) {
      return this.db
        .prepare(
          'SELECT asset_id, symbol, market, venue, base, quote, status, created_at, updated_at FROM assets WHERE market=? ORDER BY symbol'
        )
        .all(market) as Asset[];
    }

    return this.db
      .prepare('SELECT asset_id, symbol, market, venue, base, quote, status, created_at, updated_at FROM assets ORDER BY market, symbol')
      .all() as Asset[];
  }

  upsertOhlcvBars(
    assetId: number,
    timeframe: Timeframe,
    bars: NormalizedBar[],
    source: string
  ): number {
    if (!bars.length) return 0;

    const ingestAt = nowMs();
    const stmt = this.db.prepare(`
      INSERT INTO ohlcv(asset_id, timeframe, ts_open, open, high, low, close, volume, source, ingest_at)
      VALUES(@asset_id, @timeframe, @ts_open, @open, @high, @low, @close, @volume, @source, @ingest_at)
      ON CONFLICT(asset_id, timeframe, ts_open) DO UPDATE SET
        open = excluded.open,
        high = excluded.high,
        low = excluded.low,
        close = excluded.close,
        volume = excluded.volume,
        source = excluded.source,
        ingest_at = excluded.ingest_at
    `);

    const tx = this.db.transaction((records: NormalizedBar[]) => {
      for (const bar of records) {
        stmt.run({
          asset_id: assetId,
          timeframe,
          ts_open: bar.ts_open,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
          source,
          ingest_at: ingestAt
        });
      }
    });

    tx(bars);
    return bars.length;
  }

  getOhlcv(params: {
    assetId: number;
    timeframe: Timeframe;
    start?: number;
    end?: number;
    limit?: number;
  }): Array<{
    ts_open: number;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    source: string;
  }> {
    const where: string[] = ['asset_id = @asset_id', 'timeframe = @timeframe'];
    if (params.start !== undefined) where.push('ts_open >= @start');
    if (params.end !== undefined) where.push('ts_open <= @end');
    const limitSql = params.limit ? 'LIMIT @limit' : '';

    const sql = `
      SELECT ts_open, open, high, low, close, volume, source
      FROM ohlcv
      WHERE ${where.join(' AND ')}
      ORDER BY ts_open ASC
      ${limitSql}
    `;

    return this.db.prepare(sql).all({
      asset_id: params.assetId,
      timeframe: params.timeframe,
      start: params.start,
      end: params.end,
      limit: params.limit
    }) as Array<{
      ts_open: number;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
      source: string;
    }>;
  }

  getLatestTsOpen(assetId: number, timeframe: Timeframe): number | null {
    const row = this.db
      .prepare('SELECT ts_open FROM ohlcv WHERE asset_id=? AND timeframe=? ORDER BY ts_open DESC LIMIT 1')
      .get(assetId, timeframe) as { ts_open: number } | undefined;
    return row?.ts_open ?? null;
  }

  getCursor(assetId: number, timeframe: Timeframe): number | null {
    const row = this.db
      .prepare('SELECT last_ts_open FROM ingest_cursors WHERE asset_id=? AND timeframe=?')
      .get(assetId, timeframe) as { last_ts_open: number } | undefined;
    return row?.last_ts_open ?? null;
  }

  setCursor(assetId: number, timeframe: Timeframe, lastTsOpen: number, source: string): void {
    this.db
      .prepare(
        `
          INSERT INTO ingest_cursors(asset_id, timeframe, last_ts_open, source, updated_at)
          VALUES(@asset_id, @timeframe, @last_ts_open, @source, @updated_at)
          ON CONFLICT(asset_id, timeframe) DO UPDATE SET
            last_ts_open = excluded.last_ts_open,
            source = excluded.source,
            updated_at = excluded.updated_at
        `
      )
      .run({
        asset_id: assetId,
        timeframe,
        last_ts_open: lastTsOpen,
        source,
        updated_at: nowMs()
      });
  }

  listAssetIdsByMarket(market?: string): Array<{ asset_id: number; symbol: string; market: string; venue: string }> {
    if (market) {
      return this.db
        .prepare('SELECT asset_id, symbol, market, venue FROM assets WHERE market = ? ORDER BY symbol')
        .all(market) as Array<{ asset_id: number; symbol: string; market: string; venue: string }>;
    }

    return this.db
      .prepare('SELECT asset_id, symbol, market, venue FROM assets ORDER BY market, symbol')
      .all() as Array<{ asset_id: number; symbol: string; market: string; venue: string }>;
  }

  listBarsRange(assetId: number, timeframe: Timeframe, start: number, end: number): number[] {
    const rows = this.db
      .prepare(
        'SELECT ts_open FROM ohlcv WHERE asset_id=? AND timeframe=? AND ts_open>=? AND ts_open<=? ORDER BY ts_open ASC'
      )
      .all(assetId, timeframe, start, end) as Array<{ ts_open: number }>;
    return rows.map((row) => row.ts_open);
  }

  logAnomaly(args: {
    assetId?: number | null;
    timeframe: Timeframe;
    tsOpen?: number | null;
    anomalyType: string;
    detail: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO ingest_anomalies(asset_id, timeframe, ts_open, anomaly_type, detail, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(args.assetId ?? null, args.timeframe, args.tsOpen ?? null, args.anomalyType, args.detail, nowMs());
  }

  upsertSignal(signal: SignalContract): void {
    const tp1 = signal.take_profit_levels?.[0];
    const tp2 = signal.take_profit_levels?.[1];
    const payload = JSON.stringify(signal);
    const updatedAt = nowMs();
    const stmt = this.db.prepare(`
      INSERT INTO signals(
        signal_id, created_at_ms, expires_at_ms, market, symbol, timeframe, strategy_id, strategy_family, strategy_version,
        regime_id, temperature_percentile, volatility_percentile, direction, strength, confidence,
        entry_low, entry_high, entry_method, invalidation_level,
        stop_type, stop_price, tp1_price, tp1_size_pct, tp2_price, tp2_size_pct,
        trailing_type, trailing_params_json,
        position_pct, leverage_cap, risk_bucket_applied,
        fee_bps, spread_bps, slippage_bps, funding_est_bps, basis_est,
        expected_r, hit_rate_est, sample_size, expected_max_dd_est,
        status, score, payload_json, updated_at_ms
      ) VALUES (
        @signal_id, @created_at_ms, @expires_at_ms, @market, @symbol, @timeframe, @strategy_id, @strategy_family, @strategy_version,
        @regime_id, @temperature_percentile, @volatility_percentile, @direction, @strength, @confidence,
        @entry_low, @entry_high, @entry_method, @invalidation_level,
        @stop_type, @stop_price, @tp1_price, @tp1_size_pct, @tp2_price, @tp2_size_pct,
        @trailing_type, @trailing_params_json,
        @position_pct, @leverage_cap, @risk_bucket_applied,
        @fee_bps, @spread_bps, @slippage_bps, @funding_est_bps, @basis_est,
        @expected_r, @hit_rate_est, @sample_size, @expected_max_dd_est,
        @status, @score, @payload_json, @updated_at_ms
      )
      ON CONFLICT(signal_id) DO UPDATE SET
        created_at_ms = excluded.created_at_ms,
        expires_at_ms = excluded.expires_at_ms,
        market = excluded.market,
        symbol = excluded.symbol,
        timeframe = excluded.timeframe,
        strategy_id = excluded.strategy_id,
        strategy_family = excluded.strategy_family,
        strategy_version = excluded.strategy_version,
        regime_id = excluded.regime_id,
        temperature_percentile = excluded.temperature_percentile,
        volatility_percentile = excluded.volatility_percentile,
        direction = excluded.direction,
        strength = excluded.strength,
        confidence = excluded.confidence,
        entry_low = excluded.entry_low,
        entry_high = excluded.entry_high,
        entry_method = excluded.entry_method,
        invalidation_level = excluded.invalidation_level,
        stop_type = excluded.stop_type,
        stop_price = excluded.stop_price,
        tp1_price = excluded.tp1_price,
        tp1_size_pct = excluded.tp1_size_pct,
        tp2_price = excluded.tp2_price,
        tp2_size_pct = excluded.tp2_size_pct,
        trailing_type = excluded.trailing_type,
        trailing_params_json = excluded.trailing_params_json,
        position_pct = excluded.position_pct,
        leverage_cap = excluded.leverage_cap,
        risk_bucket_applied = excluded.risk_bucket_applied,
        fee_bps = excluded.fee_bps,
        spread_bps = excluded.spread_bps,
        slippage_bps = excluded.slippage_bps,
        funding_est_bps = excluded.funding_est_bps,
        basis_est = excluded.basis_est,
        expected_r = excluded.expected_r,
        hit_rate_est = excluded.hit_rate_est,
        sample_size = excluded.sample_size,
        expected_max_dd_est = excluded.expected_max_dd_est,
        status = excluded.status,
        score = excluded.score,
        payload_json = excluded.payload_json,
        updated_at_ms = excluded.updated_at_ms
    `);

    stmt.run({
      signal_id: signal.id,
      created_at_ms: Date.parse(signal.created_at) || updatedAt,
      expires_at_ms: Date.parse(signal.expires_at) || updatedAt,
      market: signal.market,
      symbol: signal.symbol,
      timeframe: signal.timeframe,
      strategy_id: signal.strategy_id,
      strategy_family: signal.strategy_family,
      strategy_version: signal.strategy_version,
      regime_id: signal.regime_id,
      temperature_percentile: signal.temperature_percentile,
      volatility_percentile: signal.volatility_percentile,
      direction: signal.direction,
      strength: signal.strength,
      confidence: signal.confidence,
      entry_low: signal.entry_zone.low,
      entry_high: signal.entry_zone.high,
      entry_method: signal.entry_zone.method,
      invalidation_level: signal.invalidation_level,
      stop_type: signal.stop_loss.type,
      stop_price: signal.stop_loss.price,
      tp1_price: tp1?.price ?? null,
      tp1_size_pct: tp1?.size_pct ?? null,
      tp2_price: tp2?.price ?? null,
      tp2_size_pct: tp2?.size_pct ?? null,
      trailing_type: signal.trailing_rule.type,
      trailing_params_json: JSON.stringify(signal.trailing_rule.params ?? {}),
      position_pct: signal.position_advice.position_pct,
      leverage_cap: signal.position_advice.leverage_cap,
      risk_bucket_applied: signal.position_advice.risk_bucket_applied,
      fee_bps: signal.cost_model.fee_bps,
      spread_bps: signal.cost_model.spread_bps,
      slippage_bps: signal.cost_model.slippage_bps,
      funding_est_bps: signal.cost_model.funding_est_bps ?? null,
      basis_est: signal.cost_model.basis_est ?? null,
      expected_r: signal.expected_metrics.expected_R,
      hit_rate_est: signal.expected_metrics.hit_rate_est,
      sample_size: signal.expected_metrics.sample_size,
      expected_max_dd_est: signal.expected_metrics.expected_max_dd_est ?? null,
      status: signal.status,
      score: signal.score,
      payload_json: payload,
      updated_at_ms: updatedAt
    });
  }

  upsertSignals(signals: SignalContract[]): void {
    const tx = this.db.transaction((rows: SignalContract[]) => {
      for (const signal of rows) this.upsertSignal(signal);
    });
    tx(signals);
  }

  listSignals(params?: {
    market?: Market;
    symbol?: string;
    status?: SignalStatus | 'ALL';
    limit?: number;
  }): SignalRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.market) {
      where.push('market = @market');
      q.market = params.market;
    }
    if (params?.symbol) {
      where.push('symbol = @symbol');
      q.symbol = params.symbol.toUpperCase();
    }
    if (params?.status && params.status !== 'ALL') {
      where.push('status = @status');
      q.status = params.status;
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params?.limit ? 'LIMIT @limit' : '';
    if (params?.limit) q.limit = params.limit;

    const sql = `
      SELECT * FROM signals
      ${whereSql}
      ORDER BY score DESC, created_at_ms DESC
      ${limitSql}
    `;
    return this.db.prepare(sql).all(q) as SignalRecord[];
  }

  getSignal(signalId: string): SignalRecord | null {
    const row = this.db.prepare('SELECT * FROM signals WHERE signal_id = ? LIMIT 1').get(signalId) as
      | SignalRecord
      | undefined;
    return row ?? null;
  }

  appendSignalEvent(signalId: string, eventType: string, payload?: Record<string, unknown>): void {
    this.db
      .prepare(
        `INSERT INTO signal_events(signal_id, event_type, payload_json, created_at_ms)
         VALUES (?, ?, ?, ?)`
      )
      .run(signalId, eventType, payload ? JSON.stringify(payload) : null, nowMs());
  }

  listSignalEvents(signalId: string, limit = 40): Array<{ id: number; signal_id: string; event_type: string; payload_json: string | null; created_at_ms: number }> {
    return this.db
      .prepare(
        `SELECT id, signal_id, event_type, payload_json, created_at_ms
         FROM signal_events
         WHERE signal_id = ?
         ORDER BY created_at_ms DESC
         LIMIT ?`
      )
      .all(signalId, limit) as Array<{ id: number; signal_id: string; event_type: string; payload_json: string | null; created_at_ms: number }>;
  }

  upsertExecution(input: Omit<ExecutionRecord, 'updated_at_ms'> & { updated_at_ms?: number }): void {
    const ts = input.updated_at_ms ?? nowMs();
    this.db
      .prepare(
        `
          INSERT INTO executions(
            execution_id, signal_id, user_id, mode, action, market, symbol,
            entry_price, stop_price, tp_price, size_pct, pnl_pct, note,
            created_at_ms, updated_at_ms
          ) VALUES(
            @execution_id, @signal_id, @user_id, @mode, @action, @market, @symbol,
            @entry_price, @stop_price, @tp_price, @size_pct, @pnl_pct, @note,
            @created_at_ms, @updated_at_ms
          )
          ON CONFLICT(execution_id) DO UPDATE SET
            signal_id = excluded.signal_id,
            user_id = excluded.user_id,
            mode = excluded.mode,
            action = excluded.action,
            market = excluded.market,
            symbol = excluded.symbol,
            entry_price = excluded.entry_price,
            stop_price = excluded.stop_price,
            tp_price = excluded.tp_price,
            size_pct = excluded.size_pct,
            pnl_pct = excluded.pnl_pct,
            note = excluded.note,
            created_at_ms = excluded.created_at_ms,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run({
        execution_id: input.execution_id,
        signal_id: input.signal_id,
        user_id: input.user_id,
        mode: input.mode,
        action: input.action,
        market: input.market,
        symbol: input.symbol,
        entry_price: input.entry_price ?? null,
        stop_price: input.stop_price ?? null,
        tp_price: input.tp_price ?? null,
        size_pct: input.size_pct ?? null,
        pnl_pct: input.pnl_pct ?? null,
        note: input.note ?? null,
        created_at_ms: input.created_at_ms,
        updated_at_ms: ts
      });
  }

  listExecutions(params?: {
    userId?: string;
    market?: Market;
    mode?: 'PAPER' | 'LIVE';
    signalId?: string;
    limit?: number;
  }): ExecutionRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.userId) {
      where.push('user_id = @user_id');
      q.user_id = params.userId;
    }
    if (params?.market) {
      where.push('market = @market');
      q.market = params.market;
    }
    if (params?.mode) {
      where.push('mode = @mode');
      q.mode = params.mode;
    }
    if (params?.signalId) {
      where.push('signal_id = @signal_id');
      q.signal_id = params.signalId;
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitSql = params?.limit ? 'LIMIT @limit' : '';
    if (params?.limit) q.limit = params.limit;

    const rows = this.db
      .prepare(
        `
        SELECT
          execution_id, signal_id, user_id, mode, action, market, symbol,
          entry_price, stop_price, tp_price, size_pct, pnl_pct, note,
          created_at_ms, updated_at_ms
        FROM executions
        ${whereSql}
        ORDER BY created_at_ms DESC
        ${limitSql}
      `
      )
      .all(q) as Array<{
      execution_id: string;
      signal_id: string;
      user_id: string;
      mode: 'PAPER' | 'LIVE';
      action: 'EXECUTE' | 'DONE' | 'CLOSE';
      market: Market;
      symbol: string;
      entry_price: number | null;
      stop_price: number | null;
      tp_price: number | null;
      size_pct: number | null;
      pnl_pct: number | null;
      note: string | null;
      created_at_ms: number;
      updated_at_ms: number;
    }>;

    return rows.map((row) => ({
      ...row,
      entry_price: row.entry_price ?? undefined,
      stop_price: row.stop_price ?? undefined,
      tp_price: row.tp_price ?? undefined,
      size_pct: row.size_pct ?? undefined,
      pnl_pct: row.pnl_pct ?? undefined,
      note: row.note ?? undefined
    }));
  }

  upsertUserRiskProfile(profile: UserRiskProfileRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO user_risk_profiles(
            user_id, profile_key, max_loss_per_trade, max_daily_loss, max_drawdown, exposure_cap, leverage_cap, updated_at_ms
          ) VALUES(
            @user_id, @profile_key, @max_loss_per_trade, @max_daily_loss, @max_drawdown, @exposure_cap, @leverage_cap, @updated_at_ms
          )
          ON CONFLICT(user_id) DO UPDATE SET
            profile_key = excluded.profile_key,
            max_loss_per_trade = excluded.max_loss_per_trade,
            max_daily_loss = excluded.max_daily_loss,
            max_drawdown = excluded.max_drawdown,
            exposure_cap = excluded.exposure_cap,
            leverage_cap = excluded.leverage_cap,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(profile);
  }

  getUserRiskProfile(userId: string): UserRiskProfileRecord | null {
    const row = this.db
      .prepare(
        `SELECT user_id, profile_key, max_loss_per_trade, max_daily_loss, max_drawdown, exposure_cap, leverage_cap, updated_at_ms
         FROM user_risk_profiles WHERE user_id = ? LIMIT 1`
      )
      .get(userId) as UserRiskProfileRecord | undefined;
    return row ?? null;
  }

  upsertMarketState(record: MarketStateRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO market_state(
            market, symbol, timeframe, snapshot_ts_ms, regime_id, trend_strength, temperature_percentile,
            volatility_percentile, risk_off_score, stance, event_stats_json, assumptions_json, updated_at_ms
          ) VALUES(
            @market, @symbol, @timeframe, @snapshot_ts_ms, @regime_id, @trend_strength, @temperature_percentile,
            @volatility_percentile, @risk_off_score, @stance, @event_stats_json, @assumptions_json, @updated_at_ms
          )
          ON CONFLICT(market, symbol, timeframe) DO UPDATE SET
            snapshot_ts_ms = excluded.snapshot_ts_ms,
            regime_id = excluded.regime_id,
            trend_strength = excluded.trend_strength,
            temperature_percentile = excluded.temperature_percentile,
            volatility_percentile = excluded.volatility_percentile,
            risk_off_score = excluded.risk_off_score,
            stance = excluded.stance,
            event_stats_json = excluded.event_stats_json,
            assumptions_json = excluded.assumptions_json,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(record);
  }

  upsertMarketStates(rows: MarketStateRecord[]): void {
    const tx = this.db.transaction((records: MarketStateRecord[]) => {
      for (const row of records) this.upsertMarketState(row);
    });
    tx(rows);
  }

  listMarketState(params?: { market?: Market; symbol?: string; timeframe?: string }): MarketStateRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.market) {
      where.push('market = @market');
      q.market = params.market;
    }
    if (params?.symbol) {
      where.push('symbol = @symbol');
      q.symbol = params.symbol.toUpperCase();
    }
    if (params?.timeframe) {
      where.push('timeframe = @timeframe');
      q.timeframe = params.timeframe;
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.db
      .prepare(
        `
      SELECT
        market, symbol, timeframe, snapshot_ts_ms, regime_id, trend_strength, temperature_percentile,
        volatility_percentile, risk_off_score, stance, event_stats_json, assumptions_json, updated_at_ms
      FROM market_state
      ${whereSql}
      ORDER BY temperature_percentile DESC, updated_at_ms DESC
    `
      )
      .all(q) as MarketStateRecord[];
  }

  upsertPerformanceSnapshot(record: PerformanceSnapshotRecord): void {
    this.db
      .prepare(
        `
          INSERT INTO performance_snapshots(
            market, range, segment_type, segment_key, source_label, sample_size, payload_json, asof_ms, updated_at_ms
          ) VALUES(
            @market, @range, @segment_type, @segment_key, @source_label, @sample_size, @payload_json, @asof_ms, @updated_at_ms
          )
          ON CONFLICT(market, range, segment_type, segment_key) DO UPDATE SET
            source_label = excluded.source_label,
            sample_size = excluded.sample_size,
            payload_json = excluded.payload_json,
            asof_ms = excluded.asof_ms,
            updated_at_ms = excluded.updated_at_ms
        `
      )
      .run(record);
  }

  upsertPerformanceSnapshots(rows: PerformanceSnapshotRecord[]): void {
    const tx = this.db.transaction((records: PerformanceSnapshotRecord[]) => {
      for (const row of records) this.upsertPerformanceSnapshot(row);
    });
    tx(rows);
  }

  listPerformanceSnapshots(params?: { market?: Market; range?: string; segmentType?: string }): PerformanceSnapshotRecord[] {
    const where: string[] = [];
    const q: Record<string, unknown> = {};
    if (params?.market) {
      where.push('market = @market');
      q.market = params.market;
    }
    if (params?.range) {
      where.push('range = @range');
      q.range = params.range;
    }
    if (params?.segmentType) {
      where.push('segment_type = @segment_type');
      q.segment_type = params.segmentType;
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.db
      .prepare(
        `
      SELECT market, range, segment_type, segment_key, source_label, sample_size, payload_json, asof_ms, updated_at_ms
      FROM performance_snapshots
      ${whereSql}
      ORDER BY asof_ms DESC, sample_size DESC
    `
      )
      .all(q) as PerformanceSnapshotRecord[];
  }
}
