import { useMemo, useState } from 'react';
import SegmentedControl from './SegmentedControl';
import SignalCard from './SignalCard';
import SignalDetail from './SignalDetail';
import Skeleton from './Skeleton';

export default function SignalsTab({
  market,
  setMarket,
  signals,
  loading,
  watchlist,
  setWatchlist,
  t,
  locale
}) {
  const [status, setStatus] = useState('PENDING');
  const [sortBy, setSortBy] = useState('newest');
  const [activeSignal, setActiveSignal] = useState(null);

  const statusOptions = [
    { label: t('status.PENDING'), value: 'PENDING' },
    { label: t('status.TRIGGERED'), value: 'TRIGGERED' },
    { label: t('status.CLOSED'), value: 'CLOSED' },
    { label: t('status.EXPIRED'), value: 'EXPIRED' }
  ];

  const filteredSignals = useMemo(() => {
    const scoped = signals
      .filter((item) => item.market === market && item.status === status)
      .sort((a, b) => new Date(b.generated_at) - new Date(a.generated_at));

    if (sortBy === 'confidence') {
      return [...scoped].sort((a, b) => b.confidence - a.confidence);
    }

    return scoped;
  }, [signals, market, status, sortBy]);

  const toggleWatch = (symbol) => {
    setWatchlist((current) =>
      current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol]
    );
  };

  if (activeSignal) {
    return <SignalDetail signal={activeSignal} onBack={() => setActiveSignal(null)} t={t} />;
  }

  return (
    <section>
      <div className="stack-gap">
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
              t={t}
              locale={locale}
            />
          ))
        ) : (
          <article className="glass-card empty-card">
            <p>
              {t('signals.noSignals', {
                status: t(`status.${status}`),
                market: market === 'US' ? t('common.usStocks') : t('common.crypto')
              })}
            </p>
          </article>
        )}
      </div>
    </section>
  );
}
