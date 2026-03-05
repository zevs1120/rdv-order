import { confidenceBand, directionIcon, formatDateTime, formatPnlPercent } from '../utils/format';

function normalizeConfidenceLevel(signal) {
  if (Number.isFinite(signal.confidence_level)) return Number(signal.confidence_level);
  if (Number(signal.confidence) <= 1) return Number(signal.confidence) * 5;
  return Number(signal.confidence || 3);
}

function buildOrderText(signal) {
  const tp = signal.take_profit_levels?.[0]?.price ?? signal.take_profit;
  return [
    `symbol: ${signal.symbol}`,
    `asset_class: ${signal.asset_class || (signal.market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK')}`,
    `market: ${signal.market}`,
    `side: ${signal.direction}`,
    `entry: ${signal.entry_zone?.low ?? signal.entry_min} - ${signal.entry_zone?.high ?? signal.entry_max}`,
    `stop: ${signal.stop_loss?.price ?? signal.stop_loss_value ?? signal.stop_loss}`,
    `tp: ${tp}`,
    `size: ${signal.position_advice?.position_pct ?? signal.position_size_pct}%`,
    `status: ${signal.status}`,
    `signal_id: ${signal.signal_id}`
  ].join('\n');
}

function assetLabel(signal, t) {
  const cls = signal.asset_class || (signal.market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK');
  if (cls === 'OPTIONS') return t('common.options');
  if (cls === 'US_STOCK') return t('common.stocks');
  return t('common.crypto');
}

function payloadHint(signal) {
  if (!signal.payload || typeof signal.payload !== 'object') return '--';
  if (signal.payload.kind === 'OPTIONS_INTRADAY') {
    const contract = signal.payload.data?.option_contract;
    if (!contract) return 'Options contract';
    return `${contract.side} ${contract.strike} (${contract.dte}D)`;
  }
  if (signal.payload.kind === 'STOCK_SWING') {
    return `Swing ${signal.payload.data?.horizon || '--'}`;
  }
  if (signal.payload.kind === 'CRYPTO') {
    const m = signal.payload.data?.perp_metrics;
    return `Funding ${m?.funding_rate_current ?? '--'} / Basis ${m?.basis_bps ?? '--'}bps`;
  }
  return '--';
}

export default function SignalCard({
  signal,
  onSelect,
  isWatched,
  onToggleWatch,
  onQuickAsk,
  onEligibilityCheck,
  onExecute,
  onMarkDone,
  t,
  locale
}) {
  const confidenceLevel = normalizeConfidenceLevel(signal);
  const confidenceKey = confidenceBand(confidenceLevel);
  const createdAt = signal.created_at ?? signal.generated_at;
  const expiresAt = signal.expires_at;

  return (
    <article className="signal-card" onClick={() => onSelect(signal)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelect(signal)}>
      <div className="signal-row">
        <div>
          <h3 className="signal-symbol">{signal.symbol}</h3>
          <p className="signal-meta">
            {assetLabel(signal, t)} · {formatDateTime(signal.created_at ?? signal.generated_at, locale)}
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
          {t('signals.confShort')}: {t(`confidenceBand.${confidenceKey}`)} ({confidenceLevel.toFixed(1)}/5)
        </div>
        <div className="mini-stat">{t('common.pnl')}: {formatPnlPercent(signal.quick_pnl_pct)}</div>
      </div>

      <div className="detail-list">
        <div className="detail-row">
          <span className="detail-label">{t('signals.assetPayload')}</span>
          <span className="detail-value">{payloadHint(signal)}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">{t('signals.freshness')}</span>
          <span className="detail-value">{formatDateTime(createdAt, locale)}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">{t('signals.expiresAt')}</span>
          <span className="detail-value">{formatDateTime(expiresAt, locale)}</span>
        </div>
      </div>

      <details className="exec-steps" onClick={(event) => event.stopPropagation()}>
        <summary>{t('signals.executionSteps')}</summary>
        <div className="exec-lines">
          <p>
            1. {t('signals.entryZone')}: {signal.entry_zone?.low ?? signal.entry_min} - {signal.entry_zone?.high ?? signal.entry_max}
          </p>
          <p>2. {t('signals.stopLoss')}: {signal.stop_loss?.price ?? signal.stop_loss_value ?? signal.stop_loss}</p>
          <p>3. {t('signals.takeProfit')}: {signal.take_profit_levels?.[0]?.price ?? signal.take_profit}</p>
        </div>
      </details>

      <div className="signal-quick-row">
        <button
          type="button"
          className="quick-ask-btn"
          onClick={(event) => {
            event.stopPropagation();
            onQuickAsk?.('explain', signal);
          }}
        >
          {t('chat.quick.explain')}
        </button>
        <button
          type="button"
          className="quick-ask-btn"
          onClick={(event) => {
            event.stopPropagation();
            onQuickAsk?.('execute', signal);
          }}
        >
          {t('chat.quick.execute')}
        </button>
        <button
          type="button"
          className="quick-ask-btn"
          onClick={(event) => {
            event.stopPropagation();
            onQuickAsk?.('risk', signal);
          }}
        >
          {t('chat.quick.risk')}
        </button>
      </div>

      <div className="signal-quick-row">
        <button
          type="button"
          className="quick-ask-btn"
          onClick={(event) => {
            event.stopPropagation();
            onEligibilityCheck?.(signal);
          }}
        >
          {t('signals.canITrade')}
        </button>
        <button
          type="button"
          className="quick-ask-btn"
          onClick={async (event) => {
            event.stopPropagation();
            try {
              await navigator.clipboard.writeText(buildOrderText(signal));
            } catch {
              // no-op
            }
          }}
        >
          {t('signals.copyParams')}
        </button>
        <button
          type="button"
          className="quick-ask-btn"
          onClick={(event) => {
            event.stopPropagation();
            onExecute?.(signal);
          }}
        >
          {t('signals.paperExecute')}
        </button>
      </div>
      <div className="signal-quick-row">
        <button
          type="button"
          className="quick-ask-btn"
          onClick={(event) => {
            event.stopPropagation();
            onMarkDone?.(signal);
          }}
        >
          {t('signals.markDone')}
        </button>
      </div>
    </article>
  );
}
