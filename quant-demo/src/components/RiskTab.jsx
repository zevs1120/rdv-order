export default function RiskTab({ config, t, lang }) {
  const riskRules = config.risk_rules ?? {};
  const riskStatus = config.risk_status ?? {};
  const lastEvent =
    lang === 'zh'
      ? riskStatus.last_event_zh ?? riskStatus.last_event ?? '--'
      : riskStatus.last_event_en ?? riskStatus.last_event ?? '--';

  return (
    <section className="stack-gap">
      <article className="glass-card">
        <h3 className="card-title">{t('risk.rules')}</h3>
        <div className="risk-list">
          <div className="detail-row">
            <span className="detail-label">{t('risk.perTrade')}</span>
            <span className="detail-value">{t('risk.perTradeValue', { value: riskRules.per_trade_risk_pct ?? '--' })}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">{t('risk.dailyLoss')}</span>
            <span className="detail-value">{t('risk.dailyLossValue', { value: riskRules.daily_loss_pct ?? '--' })}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">{t('risk.maxDD')}</span>
            <span className="detail-value">{t('risk.maxDDValue', { value: riskRules.max_dd_pct ?? '--' })}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">{t('risk.volSwitch')}</span>
            <span className="detail-value">{riskRules.vol_switch ? t('common.on') : t('common.off')}</span>
          </div>
        </div>
      </article>

      <article className="glass-card">
        <h3 className="card-title">{t('risk.status')}</h3>
        <div className="risk-status-grid">
          <div className="status-box">
            <p className="muted">{t('risk.tradingToday')}</p>
            <h2 className={riskStatus.trading_on ? 'positive' : 'negative'}>
              {riskStatus.trading_on ? t('common.on') : t('common.off')}
            </h2>
          </div>
          <div className="status-box">
            <p className="muted">{t('risk.currentLevel')}</p>
            <h2>{t(`risk.level.${riskStatus.current_level}`, undefined, riskStatus.current_level ?? '--')}</h2>
          </div>
        </div>
        <p className="muted status-line">
          {t('risk.lastEvent')}: {lastEvent}
        </p>
      </article>
    </section>
  );
}
