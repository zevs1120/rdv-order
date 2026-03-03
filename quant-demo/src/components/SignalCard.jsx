import { confidenceBand, directionIcon, formatDateTime, formatPnlPercent } from '../utils/format';

export default function SignalCard({ signal, onSelect, isWatched, onToggleWatch, t, locale }) {
  const confidenceKey = confidenceBand(signal.confidence);

  return (
    <article className="signal-card" onClick={() => onSelect(signal)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelect(signal)}>
      <div className="signal-row">
        <div>
          <h3 className="signal-symbol">{signal.symbol}</h3>
          <p className="signal-meta">
            {signal.market === 'US' ? t('common.usStocks') : t('common.crypto')} · {formatDateTime(signal.generated_at, locale)}
          </p>
        </div>
        <button
          type="button"
          className={`watch-btn ${isWatched ? 'watched' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggleWatch(signal.symbol);
          }}
          aria-label={t('signals.watchlistToggle')}
        >
          {isWatched ? '★' : '☆'}
        </button>
      </div>

      <div className="signal-grid">
        <div className="chip">
          <span>{directionIcon(signal.direction)}</span>
          <span>{t(`direction.${signal.direction}`, undefined, signal.direction)}</span>
        </div>
        <div className={`badge badge-${signal.status.toLowerCase()}`}>{t(`status.${signal.status}`, undefined, signal.status)}</div>
        <div className="mini-stat">
          {t('signals.confShort')}: {t(`confidenceBand.${confidenceKey}`)} ({signal.confidence}/5)
        </div>
        <div className="mini-stat">{t('common.pnl')}: {formatPnlPercent(signal.quick_pnl_pct)}</div>
      </div>
    </article>
  );
}
