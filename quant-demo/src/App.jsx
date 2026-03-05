import { useEffect, useMemo, useState } from 'react';
import AboutModal from './components/AboutModal';
import AiPage from './components/AiPage';
import MarketTab from './components/MarketTab';
import ProofTab from './components/ProofTab';
import RiskTab from './components/RiskTab';
import SignalsTab from './components/SignalsTab';
import Skeleton from './components/Skeleton';
import OnboardingFlow from './components/OnboardingFlow';
import { useLocalStorage } from './hooks/useLocalStorage';
import { createTranslator, getDefaultLang, getLocale } from './i18n';
import { formatDateTime } from './utils/format';
import { runQuantPipeline } from './engines/pipeline';

const screenTabs = [
  { key: 'signals', icon: '◉', labelKey: 'tabs.signals' },
  { key: 'market', icon: '◎', labelKey: 'tabs.market' },
  { key: 'risk', icon: '⚑', labelKey: 'tabs.risk' },
  { key: 'proof', icon: '▦', labelKey: 'tabs.proof' }
];

const navTabs = [
  { type: 'tab', key: 'signals', icon: '◉', labelKey: 'tabs.signals' },
  { type: 'tab', key: 'market', icon: '◎', labelKey: 'tabs.market' },
  { type: 'tab', key: 'risk', icon: '⚑', labelKey: 'tabs.risk' },
  { type: 'tab', key: 'proof', icon: '▦', labelKey: 'tabs.proof' },
  { type: 'route', key: 'ai', icon: '✦', labelKey: 'chat.open' }
];

const initialData = {
  signals: [],
  performance: { records: [], last_updated: null, paper_timeline: [] },
  trades: [],
  velocity: {},
  config: {},
  market_modules: [],
  analytics: {}
};

function mapExecutionToTrade(execution) {
  const baseTime = execution.created_at || new Date().toISOString();
  const pnl = Number(execution.pnl_pct ?? execution.pnlPct ?? 0);
  return {
    time_in: baseTime,
    time_out: baseTime,
    market: execution.market,
    symbol: execution.symbol,
    side: execution.side || execution.direction || 'LONG',
    entry: Number(execution.entry ?? execution.entry_price ?? 0),
    exit: Number(execution.exit ?? execution.tp_price ?? execution.entry ?? execution.entry_price ?? 0),
    pnl_pct: pnl,
    fees: Number(execution.fees ?? 0),
    signal_id: execution.signal_id || execution.signalId,
    source: execution.mode || 'PAPER'
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState('signals');
  const [assetClass, setAssetClass] = useLocalStorage('quant-demo-asset-class', 'US_STOCK');
  const [market, setMarket] = useState('US');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(initialData);
  const [rawData, setRawData] = useState(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [now, setNow] = useState(new Date());
  const [aboutOpen, setAboutOpen] = useState(false);
  const [routePath, setRoutePath] = useState(window.location.pathname || '/');
  const [watchlist, setWatchlist] = useLocalStorage('quant-demo-watchlist', []);
  const [executions, setExecutions] = useLocalStorage('quant-demo-executions', []);
  const [riskProfileKey, setRiskProfileKey] = useLocalStorage('quant-demo-risk-profile', 'balanced');
  const [onboardingDone, setOnboardingDone] = useLocalStorage('quant-demo-onboarding-done', false);
  const [showOnboarding, setShowOnboarding] = useState(!onboardingDone);
  const [lang, setLang] = useLocalStorage('quant-demo-lang', getDefaultLang());
  const [chatUserId] = useLocalStorage(
    'quant-demo-chat-user-id',
    `guest-${Math.random().toString(36).slice(2, 10)}`
  );

  const t = useMemo(() => createTranslator(lang), [lang]);
  const locale = useMemo(() => getLocale(lang), [lang]);
  const isAiRoute = routePath.startsWith('/ai') || routePath.startsWith('/assistant');

  const navigate = (to) => {
    if (window.location.pathname !== to) {
      window.history.pushState({}, '', to);
    }
    setRoutePath(window.location.pathname);
  };

  useEffect(() => {
    const onPopState = () => setRoutePath(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (assetClass === 'CRYPTO' && market !== 'CRYPTO') {
      setMarket('CRYPTO');
    } else if (assetClass !== 'CRYPTO' && market !== 'US') {
      setMarket('US');
    }
  }, [assetClass, market]);

  useEffect(() => {
    let mounted = true;

    async function load({ silent = false } = {}) {
      if (!silent) setLoading(true);
      try {
        const [signals, performance, trades, velocity, config, marketFeatures] = await Promise.all([
          fetch('/mock/signals.json').then((res) => res.json()),
          fetch('/mock/performance.json').then((res) => res.json()),
          fetch('/mock/trades.json').then((res) => res.json()),
          fetch('/mock/velocity.json').then((res) => res.json()),
          fetch('/mock/config.json').then((res) => res.json()),
          fetch('/mock/market-features.json')
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null)
        ]);

        await new Promise((resolve) => setTimeout(resolve, 500));

        if (!mounted) return;
        const nextRaw = {
          signals,
          performance,
          trades,
          velocity,
          config,
          market_features: marketFeatures
        };
        setRawData(nextRaw);
        setHasLoaded(true);
      } catch {
        if (!mounted) return;
        setData(initialData);
        setRawData(null);
        setHasLoaded(false);
      } finally {
        if (mounted && !silent) setLoading(false);
      }
    }

    load();
    const refresh = setInterval(() => load({ silent: true }), 120000);

    return () => {
      mounted = false;
      clearInterval(refresh);
    };
  }, []);

  useEffect(() => {
    if (!rawData) return;
    const executionTrades = executions.map(mapExecutionToTrade);
    const modeled = runQuantPipeline({
      ...rawData,
      config: {
        ...(rawData.config || {}),
        risk_profile: riskProfileKey
      },
      trades: [...(rawData.trades || []), ...executionTrades]
    });
    setData(modeled);
  }, [rawData, executions, riskProfileKey]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const lastUpdated = useMemo(() => {
    return data.config.last_updated || data.performance.last_updated || data.velocity.last_updated || null;
  }, [data]);

  const handleQuickAsk = (intent, signal) => {
    const promptByIntent = {
      explain: t('chat.prompt.explain', { symbol: signal.symbol }),
      execute: t('chat.prompt.execute', { symbol: signal.symbol }),
      risk: t('chat.prompt.risk', { symbol: signal.symbol })
    };
    const q = new URLSearchParams({
      signalId: signal.signal_id,
      symbol: signal.symbol,
      market: signal.market,
      assetClass: signal.asset_class || (signal.market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK'),
      timeframe: signal.timeframe || '',
      message: promptByIntent[intent] || promptByIntent.explain
    });
    navigate(`/ai?${q.toString()}`);
  };

  const recordExecution = async ({ signal, mode, action }) => {
    const payload = {
      signal_id: signal.signal_id,
      signalId: signal.signal_id,
      market: signal.market,
      symbol: signal.symbol,
      side: signal.direction,
      direction: signal.direction,
      mode,
      action,
      created_at: new Date().toISOString(),
      entry: (signal.entry_zone?.low + signal.entry_zone?.high) / 2 || signal.entry_min,
      entry_price: (signal.entry_zone?.low + signal.entry_zone?.high) / 2 || signal.entry_min,
      tp_price: signal.take_profit_levels?.[0]?.price ?? signal.take_profit,
      pnl_pct: action === 'DONE' ? Number(signal.quick_pnl_pct ?? 0.8) : 0
    };
    setExecutions((current) => [payload, ...current].slice(0, 200));

    try {
      await fetch('/api/executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: chatUserId,
          signalId: signal.signal_id,
          mode,
          action,
          pnlPct: payload.pnl_pct
        })
      });
    } catch {
      // local-first demo: ignore network failures
    }
  };

  if (isAiRoute) {
    return <AiPage userId={chatUserId} t={t} locale={locale} onBack={() => navigate('/')} />;
  }

  const renderScreen = () => {
    if (activeTab === 'signals') {
      return (
        <SignalsTab
          market={market}
          setMarket={setMarket}
          assetClass={assetClass}
          setAssetClass={setAssetClass}
          signals={data.signals}
          loading={loading}
          watchlist={watchlist}
          setWatchlist={setWatchlist}
          onQuickAsk={handleQuickAsk}
          onPaperExecute={(signal) => {
            void recordExecution({ signal, mode: 'PAPER', action: 'EXECUTE' });
          }}
          onMarkDone={(signal) => {
            void recordExecution({ signal, mode: 'LIVE', action: 'DONE' });
          }}
          riskRules={data.config.risk_rules}
          riskStatus={data.config.risk_status}
          t={t}
          locale={locale}
        />
      );
    }

    if (activeTab === 'proof') {
      return (
        <ProofTab
          market={market}
          setMarket={setMarket}
          performance={data.performance}
          trades={data.trades}
          loading={loading}
          t={t}
          lang={lang}
          locale={locale}
        />
      );
    }

    if (activeTab === 'market') {
      return !hasLoaded && loading ? (
        <Skeleton lines={6} />
      ) : (
        <MarketTab
          market={market}
          setMarket={setMarket}
          assetClass={assetClass}
          setAssetClass={setAssetClass}
          velocity={data.velocity}
          modules={data.market_modules || []}
          t={t}
          lang={lang}
          onExplainRisk={() =>
            navigate(
              `/ai?mode=market&market=${market}&assetClass=${assetClass}&symbol=${market === 'US' ? 'SPY' : 'BTC-USDT'}`
            )
          }
        />
      );
    }

    if (activeTab === 'risk') {
      return !hasLoaded && loading ? (
        <Skeleton lines={6} />
      ) : (
        <RiskTab
          config={data.config}
          t={t}
          lang={lang}
          onExplain={() => navigate(`/ai?mode=risk&market=${market}&assetClass=${assetClass}`)}
        />
      );
    }

    return null;
  };

  return (
    <div className="app-bg">
      <div className="device-shell">
        <header className="top-bar">
          <div>
            <p className="brand">{t('app.brand')}</p>
            <h1 className="headline">{t(screenTabs.find((tab) => tab.key === activeTab)?.labelKey)}</h1>
          </div>

          <div className="top-actions">
            <button type="button" className="ghost-btn" onClick={() => navigate('/ai')}>
              {t('app.ai')}
            </button>
            <div className="lang-toggle" role="group" aria-label="Language switch">
              <button
                type="button"
                className={`lang-option ${lang === 'en' ? 'active' : ''}`}
                onClick={() => setLang('en')}
              >
                EN
              </button>
              <button
                type="button"
                className={`lang-option ${lang === 'zh' ? 'active' : ''}`}
                onClick={() => setLang('zh')}
              >
                中文
              </button>
            </div>

            <button type="button" className="ghost-btn" onClick={() => setAboutOpen(true)}>
              {t('app.more')}
            </button>
          </div>
        </header>

        <div className="meta-row">
          <span>{formatDateTime(now.toISOString(), locale)}</span>
          <span>
            {t('common.lastUpdated')}: {formatDateTime(lastUpdated, locale)}
          </span>
        </div>

        <main className="main-content">
          <div className="screen-transition" key={activeTab}>
            {renderScreen()}
          </div>
        </main>

        <nav className="bottom-nav">
          {navTabs.map((item) =>
            item.type === 'route' ? (
              <button
                key={item.key}
                type="button"
                className={`tab-btn ${isAiRoute ? 'active' : ''}`}
                onClick={() => navigate('/ai')}
              >
                <span>{item.icon}</span>
                <span>{t(item.labelKey)}</span>
              </button>
            ) : (
              <button
                key={item.key}
                type="button"
                className={`tab-btn ${activeTab === item.key ? 'active' : ''}`}
                onClick={() => setActiveTab(item.key)}
              >
                <span>{item.icon}</span>
                <span>{t(item.labelKey)}</span>
              </button>
            )
          )}
        </nav>
      </div>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} config={data.config} t={t} locale={locale} />
      <OnboardingFlow
        open={showOnboarding}
        t={t}
        onComplete={(payload) => {
          setMarket(payload.market);
          setAssetClass(payload.market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK');
          setWatchlist(payload.watchlist);
          setRiskProfileKey(payload.riskProfile);
          setOnboardingDone(true);
          setShowOnboarding(false);
        }}
      />
    </div>
  );
}
