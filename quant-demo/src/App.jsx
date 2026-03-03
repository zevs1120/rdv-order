import { useEffect, useMemo, useState } from 'react';
import AboutModal from './components/AboutModal';
import ProofTab from './components/ProofTab';
import RiskTab from './components/RiskTab';
import SignalsTab from './components/SignalsTab';
import VelocityTab from './components/VelocityTab';
import Skeleton from './components/Skeleton';
import { useLocalStorage } from './hooks/useLocalStorage';
import { createTranslator, getDefaultLang, getLocale } from './i18n';
import { formatDateTime } from './utils/format';

const tabs = [
  { key: 'signals', icon: '◉', labelKey: 'tabs.signals' },
  { key: 'proof', icon: '▦', labelKey: 'tabs.proof' },
  { key: 'risk', icon: '⚑', labelKey: 'tabs.risk' },
  { key: 'velocity', icon: '◍', labelKey: 'tabs.velocity' }
];

const initialData = {
  signals: [],
  performance: { records: [], last_updated: null, paper_timeline: [] },
  trades: [],
  velocity: {},
  config: {}
};

export default function App() {
  const [activeTab, setActiveTab] = useState('signals');
  const [market, setMarket] = useState('US');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(initialData);
  const [now, setNow] = useState(new Date());
  const [aboutOpen, setAboutOpen] = useState(false);
  const [watchlist, setWatchlist] = useLocalStorage('quant-demo-watchlist', []);
  const [lang, setLang] = useLocalStorage('quant-demo-lang', getDefaultLang());

  const t = useMemo(() => createTranslator(lang), [lang]);
  const locale = useMemo(() => getLocale(lang), [lang]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        const [signals, performance, trades, velocity, config] = await Promise.all([
          fetch('/mock/signals.json').then((res) => res.json()),
          fetch('/mock/performance.json').then((res) => res.json()),
          fetch('/mock/trades.json').then((res) => res.json()),
          fetch('/mock/velocity.json').then((res) => res.json()),
          fetch('/mock/config.json').then((res) => res.json())
        ]);

        await new Promise((resolve) => setTimeout(resolve, 500));

        if (!mounted) return;
        setData({ signals, performance, trades, velocity, config });
      } catch {
        if (!mounted) return;
        setData(initialData);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const lastUpdated = useMemo(() => {
    return data.config.last_updated || data.performance.last_updated || data.velocity.last_updated || null;
  }, [data]);

  const renderScreen = () => {
    if (activeTab === 'signals') {
      return (
        <SignalsTab
          market={market}
          setMarket={setMarket}
          signals={data.signals}
          loading={loading}
          watchlist={watchlist}
          setWatchlist={setWatchlist}
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

    if (activeTab === 'risk') {
      return loading ? <Skeleton lines={6} /> : <RiskTab config={data.config} t={t} lang={lang} />;
    }

    return loading ? <Skeleton lines={6} /> : <VelocityTab velocity={data.velocity} t={t} lang={lang} />;
  };

  return (
    <div className="app-bg">
      <div className="device-shell">
        <header className="top-bar">
          <div>
            <p className="brand">{t('app.brand')}</p>
            <h1 className="headline">{t(tabs.find((tab) => tab.key === activeTab)?.labelKey)}</h1>
          </div>

          <div className="top-actions">
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

        <main className="main-content">{renderScreen()}</main>

        <nav className="bottom-nav">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span>{tab.icon}</span>
              <span>{t(tab.labelKey)}</span>
            </button>
          ))}
        </nav>
      </div>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} config={data.config} t={t} locale={locale} />
    </div>
  );
}
