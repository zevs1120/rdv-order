import { PARAM_VERSION, PIPELINE_VERSION, STRATEGY_TEMPLATE_VERSION } from './params.js';
import { deterministicHash } from './math.js';
import { runVelocityEngine } from './velocityEngine.js';
import { runRegimeEngine } from './regimeEngine.js';
import { runRiskEngine } from './riskEngine.js';
import { runSignalEngine } from './signalEngine.js';
import { runPerformanceEngine } from './performanceEngine.js';

function calcAnchorTime(signals, trades, fallbackIso) {
  const candidates = [
    ...signals.map((item) => new Date(item.generated_at).getTime()),
    ...trades.map((item) => new Date(item.time_out).getTime()),
    new Date(fallbackIso).getTime()
  ].filter((value) => Number.isFinite(value));

  if (!candidates.length) return Date.now();
  return Math.max(...candidates);
}

function enrichTrades(trades, signalMap) {
  return trades.map((trade) => {
    const signal = signalMap[trade.signal_id] || {};
    return {
      ...trade,
      strategy_id: signal.strategy_id || trade.strategy_id || 'UNCLASSIFIED',
      regime_id: signal.regime_id || trade.regime_id || 'RGM_NEUTRAL'
    };
  });
}

function buildFingerprint(raw, generatedAt) {
  const payload = JSON.stringify({
    generated_at: generatedAt,
    signals: raw.signals?.length || 0,
    trades: raw.trades?.length || 0,
    records: raw.performance?.records?.length || 0,
    velocity_seed: raw.velocity?.current || 0
  });
  return `F-${deterministicHash(payload).toString(16)}`;
}

export function runQuantPipeline(raw) {
  const signals = raw.signals || [];
  const trades = raw.trades || [];
  const config = raw.config || {};
  const generatedAt = new Date().toISOString();
  const anchorTime = calcAnchorTime(signals, trades, generatedAt);

  const velocityState = runVelocityEngine({
    signals,
    trades,
    velocitySeed: raw.velocity || {},
    featureSeries: raw.market_features?.series,
    anchorTime
  });

  const regimeState = runRegimeEngine({ velocityState });
  const riskState = runRiskEngine({
    config,
    trades,
    velocityState,
    regimeState
  });

  const signalContracts = runSignalEngine({
    signals,
    velocityState,
    regimeState,
    riskState
  });

  const signalMap = Object.fromEntries(signalContracts.map((signal) => [signal.signal_id, signal]));
  const enrichedTrades = enrichTrades(trades, signalMap);
  const performance = runPerformanceEngine({
    performance: raw.performance || {},
    trades: enrichedTrades,
    signals: signalContracts
  });

  const primarySeries = velocityState.series_index?.[velocityState.primary_key];
  const primaryRegime = regimeState.primary?.regime_label || 'NEUTRAL';
  const dataFingerprint = buildFingerprint(raw, generatedAt);

  const velocity = {
    ...raw.velocity,
    current: velocityState.global.current,
    percentile: velocityState.global.percentile,
    acceleration: velocityState.global.acceleration,
    v_norm: velocityState.global.current,
    regime: primaryRegime,
    stats: {
      n_events: velocityState.global.stats_7d.n_events,
      next_7d_up_prob: velocityState.global.stats_7d.next_7d_up_prob,
      avg_move: velocityState.global.stats_7d.avg_move,
      avg_dd: velocityState.global.stats_7d.avg_dd,
      tail_quantiles: velocityState.global.stats_7d.tail_quantiles
    },
    rule_summary: velocityState.global.rule_summary_en,
    rule_summary_en: velocityState.global.rule_summary_en,
    rule_summary_zh: velocityState.global.rule_summary_zh,
    how_used: velocityState.global.how_used_en,
    how_used_en: velocityState.global.how_used_en,
    how_used_zh: velocityState.global.how_used_zh,
    engine: {
      parameter_version: PARAM_VERSION,
      primary_key: velocityState.primary_key,
      primary_snapshot: primarySeries?.latest || null,
      event_study_db: velocityState.event_study_db
    },
    last_updated: generatedAt
  };

  const nextConfig = {
    ...config,
    risk_rules: {
      per_trade_risk_pct: riskState.rules.per_trade_risk_pct,
      daily_loss_pct: riskState.rules.daily_loss_pct,
      max_dd_pct: riskState.rules.max_dd_pct,
      vol_switch: riskState.rules.vol_switch,
      exposure_cap_pct: riskState.rules.exposure_cap_pct,
      leverage_cap: riskState.rules.leverage_cap
    },
    risk_status: riskState.status,
    risk_profile: riskState.profile_key,
    calc_meta: {
      pipeline_version: PIPELINE_VERSION,
      parameter_version: PARAM_VERSION,
      strategy_template_version: STRATEGY_TEMPLATE_VERSION,
      data_fingerprint: dataFingerprint
    },
    last_updated: generatedAt
  };

  return {
    signals: signalContracts,
    performance: { ...performance, last_updated: generatedAt },
    trades: enrichedTrades,
    velocity,
    config: nextConfig,
    market_modules: raw.market_features?.modules || [],
    analytics: {
      pipeline_version: PIPELINE_VERSION,
      parameter_version: PARAM_VERSION,
      strategy_template_version: STRATEGY_TEMPLATE_VERSION,
      data_fingerprint: dataFingerprint,
      velocity_regime: regimeState
    }
  };
}
