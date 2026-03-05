import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDateTime, formatNumber } from '../utils/format';
import GlassCard from './GlassCard';
import GridOverlay from './GridOverlay';
import NoiseOverlay from './NoiseOverlay';
import Skeleton from './Skeleton';

function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function readQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    signalId: params.get('signalId') || undefined,
    symbol: params.get('symbol') || undefined,
    market: params.get('market') || undefined,
    assetClass: params.get('assetClass') || undefined,
    timeframe: params.get('timeframe') || undefined,
    mode: params.get('mode') || undefined,
    seed: params.get('message') || undefined
  };
}

export default function AiPage({ userId, t, locale, onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [contextOpen, setContextOpen] = useState(false);
  const [context, setContext] = useState(readQuery());
  const [signalDetail, setSignalDetail] = useState(null);
  const [marketState, setMarketState] = useState(null);
  const [riskProfile, setRiskProfile] = useState(null);
  const listRef = useRef(null);
  const didSeed = useRef(false);

  const effectiveAssetClass = useMemo(
    () => context.assetClass || signalDetail?.asset_class || (context.market === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK'),
    [context.assetClass, context.market, signalDetail]
  );

  const quickActions = useMemo(
    () =>
      effectiveAssetClass === 'OPTIONS'
        ? [t('ai.quickOpt.explainContract'), t('ai.quickOpt.entryStopTp'), t('ai.quickOpt.eodPlan')]
        : effectiveAssetClass === 'CRYPTO'
          ? [t('ai.quickCr.explainFunding'), t('ai.quickCr.squeezeRisk'), t('ai.quickCr.executionTips')]
          : [t('ai.quickSt.horizonPlan'), t('ai.quickSt.catalystRisk'), t('ai.quickSt.positionSizing')],
    [effectiveAssetClass, t]
  );

  const visibleMessages = useMemo(
    () => messages.filter((item) => item.role === 'user' || String(item.content || '').trim()),
    [messages]
  );

  const showResponseSkeleton = useMemo(
    () => streaming && !messages.some((item) => item.role === 'assistant' && String(item.content || '').trim()),
    [messages, streaming]
  );

  useEffect(() => {
    const onPop = () => {
      const next = readQuery();
      setContext(next);
      didSeed.current = false;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, streaming]);

  useEffect(() => {
    const fetchContext = async () => {
      if (!context.signalId) {
        setSignalDetail(null);
      } else {
        try {
          const signalRes = await fetch(`/api/signals/${encodeURIComponent(context.signalId)}?userId=${encodeURIComponent(userId)}`);
          if (signalRes.ok) {
            const payload = await signalRes.json();
            setSignalDetail(payload.data || null);
          } else {
            setSignalDetail(null);
          }
        } catch {
          setSignalDetail(null);
        }
      }

      if (context.market || context.symbol) {
        const q = new URLSearchParams();
        if (context.market) q.set('market', context.market);
        if (context.symbol) q.set('symbol', context.symbol);
        if (context.timeframe) q.set('tf', context.timeframe);
        q.set('userId', userId);
        try {
          const tempRes = await fetch(`/api/market-state?${q.toString()}`);
          if (tempRes.ok) {
            const payload = await tempRes.json();
            setMarketState(payload.data?.[0] || null);
          } else {
            setMarketState(null);
          }
        } catch {
          setMarketState(null);
        }
      } else {
        setMarketState(null);
      }

      try {
        const riskRes = await fetch(`/api/risk-profile?userId=${encodeURIComponent(userId)}`);
        if (riskRes.ok) {
          const payload = await riskRes.json();
          setRiskProfile(payload.data || null);
        } else {
          setRiskProfile(null);
        }
      } catch {
        setRiskProfile(null);
      }
    };
    void fetchContext();
  }, [context.signalId, context.market, context.symbol, context.timeframe, userId]);

  const sendMessage = async (rawText) => {
    const text = String(rawText || '').trim();
    if (!text || streaming) return;
    setError('');
    setStreaming(true);

    const userMsg = { id: randomId(), role: 'user', content: text };
    const assistantId = randomId();
    const assistantMsg = { id: assistantId, role: 'assistant', content: '' };
    setMessages((current) => [...current, userMsg, assistantMsg]);
    setInput('');

    const requestContext = {
      signalId: context.signalId || signalDetail?.id,
      symbol: context.symbol || signalDetail?.symbol,
      market: context.market || signalDetail?.market,
      assetClass: effectiveAssetClass,
      timeframe: context.timeframe || signalDetail?.timeframe
    };

    try {
      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          message: text,
          context: requestContext
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      if (!response.body) throw new Error('No stream body from /api/ai-chat');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed);
            if (event.type === 'chunk' && event.delta) {
              setMessages((current) =>
                current.map((item) =>
                  item.id === assistantId ? { ...item, content: `${item.content}${event.delta}` } : item
                )
              );
            }
            if (event.type === 'error') {
              setError(event.error || t('chat.errorFallback'));
            }
          } catch {
            // ignore malformed line
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('chat.errorFallback');
      setError(message);
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId ? { ...item, content: `${t('chat.errorPrefix')} ${message}` } : item
        )
      );
    } finally {
      setStreaming(false);
    }
  };

  useEffect(() => {
    if (didSeed.current) return;
    if (!context.seed) return;
    didSeed.current = true;
    void sendMessage(context.seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.seed]);

  return (
    <div className="ai-page">
      <GridOverlay className="ai-grid-bg" />
      <NoiseOverlay className="ai-noise-bg" />
      <div className="ai-shell">
        <header className="ai-topbar">
          <button type="button" className="ghost-btn" onClick={onBack}>
            ← {t('ai.back')}
          </button>
          <div className="ai-brand-wrap">
            <p className="brand">{t('ai.brand')}</p>
            <h1 className="ai-headline">{t('ai.title')}</h1>
          </div>
          <button type="button" className="ghost-btn ai-context-toggle" onClick={() => setContextOpen((prev) => !prev)}>
            {t('ai.contextTitle')}
          </button>
        </header>

        <div className={`ai-center-logo ${messages.length ? 'logo-dim' : ''}`} aria-hidden="true">
          <div className="ai-logo-glow" />
          <div className="ai-logo-hex hex-outer" />
          <div className="ai-logo-hex hex-mid" />
          <div className="ai-logo-hex hex-inner" />
          <div className="ai-particle-track track-a">
            <span className="ai-particle" />
          </div>
          <div className="ai-particle-track track-b">
            <span className="ai-particle" />
          </div>
          <div className="ai-particle-track track-c">
            <span className="ai-particle" />
          </div>
          <div className="ai-particle-track track-d">
            <span className="ai-particle" />
          </div>
          <div className="ai-logo-core">
            <svg className="ai-logo-svg" viewBox="0 0 120 120" aria-label="Nova Quant logo">
              <defs>
                <linearGradient id="nq-stroke-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#67f0d2" />
                  <stop offset="55%" stopColor="#79b4ff" />
                  <stop offset="100%" stopColor="#c7ddff" />
                </linearGradient>
                <filter id="nq-soft-glow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="1.8" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <path
                className="ai-logo-frame"
                d="M60 10 L95 30 L95 72 L60 92 L25 72 L25 30 Z"
              />

              <path
                className="ai-logo-wire"
                d="M60 10 V4 M95 51 H110 M25 51 H10"
              />
              <circle className="ai-logo-node" cx="60" cy="4" r="2.4" />
              <circle className="ai-logo-node" cx="110" cy="51" r="2.2" />
              <circle className="ai-logo-node" cx="10" cy="51" r="2.2" />

              <path
                className="ai-logo-main"
                d="M36 75 V40 L50 75 V40"
                filter="url(#nq-soft-glow)"
              />

              <circle
                className="ai-logo-main"
                cx="76"
                cy="56"
                r="15"
                fill="none"
                filter="url(#nq-soft-glow)"
              />
              <path
                className="ai-logo-main"
                d="M84 64 L92 72"
                filter="url(#nq-soft-glow)"
              />
            </svg>
          </div>
          <p className="ai-logo-caption">NOVA QUANT</p>
        </div>

        <main className="ai-main">
          <GlassCard as="section" className="ai-chat-panel">
            <div className="ai-chip-row">
              {quickActions.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="ai-chip"
                  onClick={() => {
                    void sendMessage(item);
                  }}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="ai-thread" ref={listRef}>
              {!messages.length ? (
                <article className="ai-empty">
                  <p>{t('ai.empty')}</p>
                  <p className="muted">{t('ai.emptySub')}</p>
                </article>
              ) : (
                visibleMessages.map((item) => (
                  <article key={item.id} className={`ai-bubble ai-${item.role}`}>
                    {item.content}
                  </article>
                ))
              )}
              {showResponseSkeleton ? <Skeleton lines={2} compact className="ai-response-skeleton" /> : null}
              {streaming ? (
                <div className="ai-typing" aria-live="polite">
                  <span />
                  <span />
                  <span />
                </div>
              ) : null}
            </div>

            {error ? <p className="chat-error">{error}</p> : null}

            <form
              className="ai-input-row"
              onSubmit={(event) => {
                event.preventDefault();
                void sendMessage(input);
              }}
            >
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                className="ai-input"
                placeholder={t('ai.inputPlaceholder')}
                disabled={streaming}
              />
              <button type="submit" className="primary-btn ai-send" disabled={streaming || !input.trim()}>
                {streaming ? t('chat.sending') : t('chat.send')}
              </button>
            </form>
          </GlassCard>

          <GlassCard as="aside" className={`ai-context-panel ${contextOpen ? 'open' : ''}`}>
            <h3 className="card-title">{t('ai.contextTitle')}</h3>
            <div className="ai-context-grid">
              <div className="status-box">
                <p className="muted">{t('common.symbol')}</p>
                <h2>{signalDetail?.symbol || context.symbol || '--'}</h2>
              </div>
              <div className="status-box">
                <p className="muted">{t('common.market')}</p>
                <h2>{signalDetail?.market || context.market || '--'}</h2>
              </div>
              <div className="status-box">
                <p className="muted">{t('common.assetClass')}</p>
                <h2>{effectiveAssetClass || '--'}</h2>
              </div>
              <div className="status-box">
                <p className="muted">{t('ai.timeframe')}</p>
                <h2>{signalDetail?.timeframe || context.timeframe || '--'}</h2>
              </div>
              <div className="status-box">
                <p className="muted">{t('ai.riskBucket')}</p>
                <h2>{signalDetail?.position_advice?.risk_bucket_applied || '--'}</h2>
              </div>
              <div className="status-box">
                <p className="muted">{t('ai.tempPct')}</p>
                <h2>{formatNumber(marketState?.temperature_percentile, 1, locale)}</h2>
              </div>
              <div className="status-box">
                <p className="muted">{t('ai.volPct')}</p>
                <h2>{formatNumber(marketState?.volatility_percentile, 1, locale)}</h2>
              </div>
            </div>

            <GlassCard className="ai-params-card">
              <h4 className="card-title">{t('ai.keyParams')}</h4>
              <div className="detail-list">
                <div className="detail-row">
                  <span className="detail-label">{t('signals.entryZone')}</span>
                  <span className="detail-value">
                    {formatNumber(signalDetail?.entry_zone?.low, 2, locale)} - {formatNumber(signalDetail?.entry_zone?.high, 2, locale)}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">{t('signals.stopLoss')}</span>
                  <span className="detail-value">{formatNumber(signalDetail?.stop_loss?.price ?? signalDetail?.stop_loss_value, 2, locale)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">{t('signals.takeProfit')}</span>
                  <span className="detail-value">{formatNumber(signalDetail?.take_profit_levels?.[0]?.price, 2, locale)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">{t('signals.positionSize')}</span>
                  <span className="detail-value">
                    {formatNumber(signalDetail?.position_advice?.position_pct ?? signalDetail?.position_size_pct, 2, locale)}%
                  </span>
                </div>
              </div>
              <p className="muted">
                {t('common.lastUpdated')}: {formatDateTime(new Date().toISOString(), locale)}
              </p>
              {riskProfile ? (
                <p className="muted">
                  {t('ai.profile')}: {riskProfile.profile_key || '--'} · {t('risk.dailyLoss')} {formatNumber(riskProfile.max_daily_loss, 2, locale)}%
                </p>
              ) : null}
            </GlassCard>
          </GlassCard>
        </main>
        <p className="ai-disclaimer">Disclaimer: educational, not financial advice.</p>
      </div>
    </div>
  );
}
