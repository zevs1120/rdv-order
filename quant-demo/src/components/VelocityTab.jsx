import { formatPercent } from '../utils/format';

export default function VelocityTab({ velocity, t, lang }) {
  const regimeLabel = t(`velocity.regime.${velocity.regime}`, undefined, velocity.regime ?? '--');
  const regimeClass = velocity.regime?.toLowerCase?.() ?? '';
  const ruleSummary =
    lang === 'zh'
      ? velocity.rule_summary_zh ?? velocity.rule_summary ?? '--'
      : velocity.rule_summary_en ?? velocity.rule_summary ?? '--';
  const howUsed =
    lang === 'zh'
      ? velocity.how_used_zh ?? velocity.how_used ?? []
      : velocity.how_used_en ?? velocity.how_used ?? [];

  return (
    <section className="stack-gap">
      <article className="glass-card velocity-hero">
        <p className="muted">{t('velocity.current')}</p>
        <h1 className="velocity-value">{velocity.current?.toFixed(2) ?? '--'}</h1>
        <div className="velocity-meta">
          <span>
            {t('velocity.percentile')}: {((velocity.percentile ?? 0) * 100).toFixed(0)}%
          </span>
          <span className={`badge badge-${regimeClass}`}>{regimeLabel}</span>
        </div>
      </article>

      <article className="glass-card">
        <h3 className="card-title">{t('velocity.similarStats')}</h3>
        <div className="kpi-grid">
          <div className="kpi-card">
            <p className="kpi-label">{t('velocity.events')}</p>
            <h3 className="kpi-value">{velocity.stats?.n_events ?? '--'}</h3>
          </div>
          <div className="kpi-card">
            <p className="kpi-label">{t('velocity.upProb')}</p>
            <h3 className="kpi-value">{formatPercent(velocity.stats?.next_7d_up_prob ?? null)}</h3>
          </div>
          <div className="kpi-card">
            <p className="kpi-label">{t('velocity.avgMove')}</p>
            <h3 className="kpi-value">{formatPercent(velocity.stats?.avg_move ?? null, 2, true)}</h3>
          </div>
          <div className="kpi-card">
            <p className="kpi-label">{t('velocity.avgDD')}</p>
            <h3 className="kpi-value">{formatPercent(velocity.stats?.avg_dd ?? null)}</h3>
          </div>
        </div>
      </article>

      <article className="glass-card">
        <h3 className="card-title">{t('velocity.howUsed')}</h3>
        <p className="muted">{ruleSummary}</p>
        <ul className="bullet-list">
          {howUsed.map((line, index) => (
            <li key={`${line}-${index}`}>{line}</li>
          ))}
        </ul>
      </article>
    </section>
  );
}
