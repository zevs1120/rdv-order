function progressValue(current, max) {
  if (!Number.isFinite(Number(current)) || !Number.isFinite(Number(max)) || Number(max) <= 0) return 0;
  return Math.min(100, Math.max(0, (Math.abs(Number(current)) / Number(max)) * 100));
}

export default function RiskTab({ config, t, lang, onExplain }) {
  const riskRules = config.risk_rules ?? {};
  const riskStatus = config.risk_status ?? {};
  const diagnostics = riskStatus.diagnostics ?? {};
  const lastEvent =
    lang === 'zh'
      ? riskStatus.last_event_zh ?? riskStatus.last_event ?? '--'
      : riskStatus.last_event_en ?? riskStatus.last_event ?? '--';
  const todayLoss = Math.abs(Number(diagnostics.daily_pnl_pct ?? 0));
  const todayLossMax = Number(riskRules.daily_loss_pct ?? 0);
  const drawdown = Number(diagnostics.max_dd_pct ?? 0);
  const drawdownMax = Number(riskRules.max_dd_pct ?? 0);
  const todayLossProgress = progressValue(todayLoss, todayLossMax);
  const ddProgress = progressValue(drawdown, drawdownMax);
  const bucket = riskStatus.current_risk_bucket || riskStatus.bucket_state || '--';

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
        <div className="risk-progress-wrap">
          <div className="risk-progress-item">
            <div className="detail-row">
              <span className="detail-label">{t('risk.todayLossProgress')}</span>
              <span className="detail-value">
                {todayLoss.toFixed(2)} / {todayLossMax || '--'}%
              </span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${todayLossProgress}%` }} />
            </div>
          </div>
          <div className="risk-progress-item">
            <div className="detail-row">
              <span className="detail-label">{t('risk.drawdownProgress')}</span>
              <span className="detail-value">
                {drawdown.toFixed(2)} / {drawdownMax || '--'}%
              </span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${ddProgress}%` }} />
            </div>
          </div>
          <div className="detail-row">
            <span className="detail-label">{t('risk.currentBucket')}</span>
            <span className="detail-value">{bucket}</span>
          </div>
        </div>
        <p className="muted status-line">
          {t('risk.lastEvent')}: {lastEvent}
        </p>
        <div className="action-row">
          <button type="button" className="secondary-btn" onClick={onExplain}>
            {t('risk.explain')}
          </button>
        </div>
      </article>
    </section>
  );
}
