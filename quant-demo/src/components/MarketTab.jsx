import SegmentedControl from './SegmentedControl';
import GlassCard from './GlassCard';
import GridOverlay from './GridOverlay';
import NoiseOverlay from './NoiseOverlay';
import { formatNumber, formatPercent } from '../utils/format';

function assetLabel(t, assetClass) {
  if (assetClass === 'OPTIONS') return t('common.options');
  if (assetClass === 'US_STOCK') return t('common.stocks');
  return t('common.crypto');
}

export default function MarketTab({
  market,
  setMarket,
  assetClass,
  setAssetClass,
  velocity,
  modules,
  t,
  lang,
  onExplainRisk
}) {
  const filtered = modules.filter((item) => {
    if (item.asset_class && item.asset_class !== assetClass) return false;
    if (item.market && item.market !== market) return false;
    return true;
  });
  const howUsed =
    lang === 'zh'
      ? velocity.how_used_zh ?? velocity.how_used ?? []
      : velocity.how_used_en ?? velocity.how_used ?? [];

  return (
    <section className="stack-gap dashboard-surface">
      <GridOverlay />
      <NoiseOverlay />
      <SegmentedControl
        label={t('common.assetClass')}
        options={[
          { label: t('common.options'), value: 'OPTIONS' },
          { label: t('common.stocks'), value: 'US_STOCK' },
          { label: t('common.crypto'), value: 'CRYPTO' }
        ]}
        value={assetClass}
        onChange={(value) => {
          setAssetClass(value);
          setMarket(value === 'CRYPTO' ? 'CRYPTO' : 'US');
        }}
      />

      <GlassCard className="velocity-hero">
        <p className="muted">{t('velocity.current')}</p>
        <h1 className="velocity-value">{formatNumber(velocity.current, 2)}</h1>
        <div className="velocity-meta">
          <span>
            {t('velocity.percentile')}: {formatPercent(velocity.percentile)}
          </span>
          <span className={`badge badge-${String(velocity.regime || '').toLowerCase()}`}>
            {t(`velocity.regime.${velocity.regime}`, undefined, velocity.regime ?? '--')}
          </span>
        </div>
        <p className="muted status-line">
          {t('velocity.systemStance')}: {assetLabel(t, assetClass)} · {t(`velocity.regime.${velocity.regime}`, undefined, velocity.regime ?? '--')}
        </p>
        <div className="action-row">
          <button type="button" className="secondary-btn" onClick={onExplainRisk}>
            {t('velocity.whyRiskReduced')}
          </button>
        </div>
      </GlassCard>

      <GlassCard>
        <h3 className="card-title">{t('market.bigData')}</h3>
        <div className="market-module-grid">
          {filtered.map((item) => (
            <div className="market-mini-card" key={item.id}>
              <p className="market-line">{item.title}</p>
              <p className="muted">{item.summary}</p>
              {item.metric ? <p className="market-line">{item.metric}</p> : null}
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard>
        <h3 className="card-title">{t('market.cryptoDash')}</h3>
        <div className="detail-list">
          <div className="detail-row">
            <span className="detail-label">{t('market.fundingBasis')}</span>
            <span className="detail-value">{assetClass === 'CRYPTO' ? t('market.carryFavorable') : '--'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">{t('market.sentimentRegime')}</span>
            <span className="detail-value">{t(`velocity.regime.${velocity.regime}`, undefined, velocity.regime ?? '--')}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">{t('market.exchangeHealth')}</span>
            <span className="detail-value">{t('risk.level.MEDIUM')}</span>
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <h3 className="card-title">{t('velocity.howUsed')}</h3>
        <ul className="bullet-list">
          {howUsed.map((line, idx) => (
            <li key={`${line}-${idx}`}>{line}</li>
          ))}
        </ul>
      </GlassCard>
    </section>
  );
}
