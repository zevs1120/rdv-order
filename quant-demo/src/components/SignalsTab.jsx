import { useMemo, useState } from 'react';
import SegmentedControl from './SegmentedControl';
import SignalCard from './SignalCard';
import SignalDetail from './SignalDetail';
import Skeleton from './Skeleton';
import EligibilitySheet from './EligibilitySheet';
import { formatDateTime } from '../utils/format';

const ACTIVE_STATUSES = new Set(['NEW', 'TRIGGERED']);

function confidenceValue(signal) {
  if (Number.isFinite(signal.confidence_level)) return Number(signal.confidence_level);
  if (Number(signal.confidence) <= 1) return Number(signal.confidence) * 5;
  return Number(signal.confidence || 3);
}

function buildStrategyDeck(signals, market) {
  const map = new Map();

  for (const item of signals) {
    if (item.market !== market) continue;
    const key = item.strategy_id || 'UNCLASSIFIED';
    const prev = map.get(key) || { id: key, count: 0, active: 0, confidenceSum: 0 };
    prev.count += 1;
    prev.active += ACTIVE_STATUSES.has(item.status) ? 1 : 0;
    prev.confidenceSum += Number(item.confidence || 0);
    map.set(key, prev);
  }

  return Array.from(map.values())
    .map((item) => ({
      ...item,
      avgConfidence: item.count ? item.confidenceSum / item.count : 0
    }))
    .sort((a, b) => b.active - a.active || b.count - a.count || b.avgConfidence - a.avgConfidence);
}

function buildOpportunityStack(signals, market) {
  return signals
    .filter((item) => item.market === market)
    .sort((a, b) => {
      const aActive = ACTIVE_STATUSES.has(a.status) ? 1 : 0;
      const bActive = ACTIVE_STATUSES.has(b.status) ? 1 : 0;
      const aTs = new Date(a.created_at ?? a.generated_at).getTime();
      const bTs = new Date(b.created_at ?? b.generated_at).getTime();
      if (aActive !== bActive) return bActive - aActive;
      if (confidenceValue(a) !== confidenceValue(b)) return confidenceValue(b) - confidenceValue(a);
      return bTs - aTs;
    })
    .slice(0, 5);
}

export default function SignalsTab({
  market,
  setMarket,
  signals,
  loading,
  watchlist,
  setWatchlist,
  onQuickAsk,
  onPaperExecute,
  onMarkDone,
  riskRules,
  riskStatus,
  t,
  locale
}) {
  const [status, setStatus] = useState('ALL');
  const [sortBy, setSortBy] = useState('newest');
  const [activeSignal, setActiveSignal] = useState(null);
  const [eligibilitySignal, setEligibilitySignal] = useState(null);

  const statusOptions = [
    { label: t('common.all'), value: 'ALL' },
    { label: t('status.NEW'), value: 'NEW' },
    { label: t('status.TRIGGERED'), value: 'TRIGGERED' },
    { label: t('status.INVALIDATED'), value: 'INVALIDATED' },
    { label: t('status.EXPIRED'), value: 'EXPIRED' }
  ];

  const filteredSignals = useMemo(() => {
    const scoped = signals
      .filter((item) => item.market === market && (status === 'ALL' || item.status === status))
      .sort((a, b) => new Date(b.created_at ?? b.generated_at) - new Date(a.created_at ?? a.generated_at));

    if (status === 'ALL' && watchlist.length) {
      return [...scoped]
        .filter((item) => watchlist.includes(item.symbol) || confidenceValue(item) >= 4)
        .sort((a, b) => {
          const aW = watchlist.includes(a.symbol) ? 1 : 0;
          const bW = watchlist.includes(b.symbol) ? 1 : 0;
          if (aW !== bW) return bW - aW;
          return confidenceValue(b) - confidenceValue(a);
        });
    }

    if (sortBy === 'confidence') {
      return [...scoped].sort((a, b) => confidenceValue(b) - confidenceValue(a));
    }

    return scoped;
  }, [signals, market, status, sortBy, watchlist]);

  const strategyDeck = useMemo(() => buildStrategyDeck(signals, market), [signals, market]);
  const opportunityStack = useMemo(() => buildOpportunityStack(signals, market), [signals, market]);
  const activeSignalCount = useMemo(
    () => signals.filter((item) => item.market === market && ACTIVE_STATUSES.has(item.status)).length,
    [signals, market]
  );

  const toggleWatch = (symbol) => {
    setWatchlist((current) =>
      current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol]
    );
  };

  const eligibilityChecks = useMemo(() => {
    if (!eligibilitySignal) return [];
    const pos = Number(eligibilitySignal.position_advice?.position_pct ?? eligibilitySignal.position_size_pct ?? 0);
    const exposureCap = Number(riskRules?.exposure_cap_pct ?? 100);
    const bucket = String(
      eligibilitySignal.position_advice?.risk_bucket_applied || riskStatus?.current_risk_bucket || riskStatus?.bucket_state || 'BASE'
    );
    const temp = Number(eligibilitySignal.temperature_percentile ?? 50);
    const vol = Number(eligibilitySignal.volatility_percentile ?? 50);
    const isExpired = ['EXPIRED', 'INVALIDATED'].includes(String(eligibilitySignal.status || ''));

    return [
      {
        key: 'risk',
        label: t('signals.checkRisk'),
        value: pos <= exposureCap ? `OK (${pos.toFixed(2)}% <= ${exposureCap}%)` : `Cap exceeded (${pos.toFixed(2)}%)`,
        state: pos <= exposureCap ? 'pass' : 'fail'
      },
      {
        key: 'temperature',
        label: t('signals.checkTemp'),
        value:
          temp > 90 || vol > 90
            ? `${t('signals.reducedSize')} (${bucket})`
            : `${t('signals.normalSize')} (${bucket})`,
        state: temp > 90 || vol > 90 ? 'warn' : 'pass'
      },
      {
        key: 'validity',
        label: t('signals.checkValidity'),
        value: isExpired ? t('signals.invalidNow') : t('signals.validNow'),
        state: isExpired ? 'fail' : 'pass'
      }
    ];
  }, [eligibilitySignal, riskRules, riskStatus, t]);

  if (activeSignal) {
    return <SignalDetail signal={activeSignal} onBack={() => setActiveSignal(null)} t={t} />;
  }

  return (
    <section>
      <div className="stack-gap">
        <article className="glass-card strategy-overview">
          <div className="strategy-overview-head">
            <div>
              <h3 className="card-title">{t('signals.strategyDeckTitle')}</h3>
              <p className="muted">
                {t('signals.strategyDeckSub', {
                  strategies: strategyDeck.length,
                  active: activeSignalCount
                })}
              </p>
            </div>
          </div>

          <div className="strategy-kpi-row">
            <div className="mini-stat">
              {t('signals.coveredStrategies')}: {strategyDeck.length}
            </div>
            <div className="mini-stat">
              {t('signals.activeSignals')}: {activeSignalCount}
            </div>
            <div className="mini-stat">
              {t('signals.totalSignals')}: {signals.filter((item) => item.market === market).length}
            </div>
          </div>

          <div className="strategy-pill-grid">
            {strategyDeck.map((item) => (
              <div key={item.id} className="strategy-pill">
                <p className="strategy-pill-id">{item.id}</p>
                <p className="strategy-pill-meta">{t('signals.activeCount', { active: item.active, total: item.count })}</p>
                <p className="strategy-pill-meta">{t('signals.avgConf', { value: item.avgConfidence.toFixed(1) })}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="glass-card opportunity-stack">
          <h3 className="card-title">{t('signals.todayOpportunityTitle')}</h3>
          <p className="muted">
            {t('signals.todayOpportunitySub', {
              count: opportunityStack.length
            })}
          </p>
          <div className="opportunity-list">
            {opportunityStack.map((item, index) => (
              <button
                key={item.signal_id}
                type="button"
                className="opportunity-card"
                style={{
                  zIndex: opportunityStack.length - index,
                  transform: `translateY(${index * -7}px) scale(${1 - index * 0.015})`
                }}
                onClick={() => setActiveSignal(item)}
              >
                <div className="opportunity-top">
                  <p className="opportunity-symbol">{item.symbol}</p>
                  <span className={`badge badge-${item.status.toLowerCase()}`}>
                    {t(`status.${item.status}`, undefined, item.status)}
                  </span>
                </div>
                <p className="opportunity-meta">
                  {(item.strategy_id || 'UNCLASSIFIED') + ' · '}
                  {item.timeframe || '--'} · {t(`direction.${item.direction}`, undefined, item.direction)} ·{' '}
                  {t('signals.confN', { value: item.confidence })}
                </p>
                <p className="opportunity-meta">
                  {formatDateTime(item.created_at ?? item.generated_at, locale)} · {item.advice || item.rationale?.[0] || '--'}
                </p>
              </button>
            ))}
          </div>
        </article>

        <SegmentedControl
          label={t('common.market')}
          options={[
            { label: t('common.usStocks'), value: 'US' },
            { label: t('common.crypto'), value: 'CRYPTO' }
          ]}
          value={market}
          onChange={setMarket}
        />

        <SegmentedControl label={t('common.status')} options={statusOptions} value={status} onChange={setStatus} compact />

        <div className="filter-row">
          <span className="muted">{t('common.sort')}</span>
          <div className="filter-buttons">
            <button type="button" className={`pill-btn ${sortBy === 'newest' ? 'active' : ''}`} onClick={() => setSortBy('newest')}>
              {t('common.newest')}
            </button>
            <button type="button" className={`pill-btn ${sortBy === 'confidence' ? 'active' : ''}`} onClick={() => setSortBy('confidence')}>
              {t('common.confidence')}
            </button>
          </div>
        </div>

        {loading ? (
          <>
            <Skeleton lines={4} />
            <Skeleton lines={4} />
            <Skeleton lines={4} />
          </>
        ) : filteredSignals.length ? (
          filteredSignals.map((signal) => (
            <SignalCard
              key={signal.signal_id}
              signal={signal}
              onSelect={setActiveSignal}
              isWatched={watchlist.includes(signal.symbol)}
              onToggleWatch={toggleWatch}
              onQuickAsk={onQuickAsk}
              onEligibilityCheck={setEligibilitySignal}
              onExecute={onPaperExecute}
              onMarkDone={onMarkDone}
              t={t}
              locale={locale}
            />
          ))
        ) : (
          <article className="glass-card empty-card">
            <p>
              {t('signals.noSignals', {
                status: status === 'ALL' ? t('common.all') : t(`status.${status}`),
                market: market === 'US' ? t('common.usStocks') : t('common.crypto')
              })}
            </p>
          </article>
        )}
      </div>
      <EligibilitySheet
        open={Boolean(eligibilitySignal)}
        signal={eligibilitySignal}
        checks={eligibilityChecks}
        onClose={() => setEligibilitySignal(null)}
        t={t}
      />
    </section>
  );
}
