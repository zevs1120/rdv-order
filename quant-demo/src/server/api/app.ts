import express from 'express';
import { isoToMs } from '../utils/time.js';
import type { AssetClass, Market, Timeframe } from '../types.js';
import {
  ensureDefaultPublicSignalsApiKey,
  getMarketState,
  getMarketModules,
  listExternalConnections,
  getPerformanceSummary,
  getRiskProfile,
  getSignalContract,
  listAssets,
  listExecutions,
  listSignalContracts,
  queryOhlcv,
  syncQuantState,
  upsertExecution,
  upsertExternalConnection,
  verifyPublicSignalsApiKey
} from './queries.js';
import { checkRateLimit } from '../chat/rateLimit.js';
import { streamChat } from '../chat/service.js';
import { logChatAudit } from '../chat/audit.js';
import { createBrokerAdapter, createExchangeAdapter } from '../connect/adapters.js';

function parseMarket(value?: string): Market | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (upper === 'US' || upper === 'CRYPTO') return upper;
  return undefined;
}

function parseTimeframe(value?: string): Timeframe | undefined {
  if (!value) return undefined;
  const tf = value as Timeframe;
  if (['1m', '5m', '15m', '1h', '1d'].includes(tf)) return tf;
  return undefined;
}

function parseAssetClass(value?: string): AssetClass | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (upper === 'OPTIONS' || upper === 'US_STOCK' || upper === 'CRYPTO') return upper;
  return undefined;
}

function parseSignalStatus(value?: string): 'ALL' | 'NEW' | 'TRIGGERED' | 'EXPIRED' | 'INVALIDATED' | 'CLOSED' | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (
    upper === 'ALL' ||
    upper === 'NEW' ||
    upper === 'TRIGGERED' ||
    upper === 'EXPIRED' ||
    upper === 'INVALIDATED' ||
    upper === 'CLOSED'
  ) {
    return upper;
  }
  return undefined;
}

export function createApiApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  ensureDefaultPublicSignalsApiKey();

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  app.get('/api/assets', (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    if (req.query.market && !market) {
      res.status(400).json({ error: 'Invalid market, use US or CRYPTO' });
      return;
    }

    const assets = listAssets(market);
    res.json({ market: market ?? 'ALL', count: assets.length, data: assets });
  });

  app.get('/api/signals', (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    const status = parseSignalStatus(req.query.status as string | undefined) || 'ALL';
    const symbol = (req.query.symbol as string | undefined)?.toUpperCase();
    const limit = req.query.limit ? Number(req.query.limit) : 40;
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    if (req.query.assetClass && !assetClass) {
      res.status(400).json({ error: 'Invalid assetClass, use OPTIONS | US_STOCK | CRYPTO' });
      return;
    }
    syncQuantState(userId);
    const data = listSignalContracts({
      userId,
      assetClass,
      market,
      symbol,
      status,
      limit
    });
    res.json({
      asof: new Date().toISOString(),
      count: data.length,
      data
    });
  });

  app.get('/api/public/signals', (req, res) => {
    const key = (req.header('x-api-key') || req.query.apikey || req.query.apiKey || '').toString();
    if (!verifyPublicSignalsApiKey(key)) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    const status = parseSignalStatus(req.query.status as string | undefined) || 'ALL';
    const symbol = (req.query.symbol as string | undefined)?.toUpperCase();
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const data = listSignalContracts({
      userId: 'public-api',
      assetClass,
      market,
      symbol,
      status,
      limit
    });
    res.json({
      asof: new Date().toISOString(),
      count: data.length,
      data
    });
  });

  app.get('/api/market/modules', (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const assetClass = parseAssetClass(req.query.assetClass as string | undefined);
    const modules = getMarketModules({
      market,
      assetClass
    });
    res.json({
      asof: new Date().toISOString(),
      count: modules.length,
      data: modules
    });
  });

  app.get('/api/signals/:id', (req, res) => {
    const signalId = String(req.params.id || '');
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    syncQuantState(userId);
    const data = getSignalContract(signalId, userId);
    if (!data) {
      res.status(404).json({ error: 'Signal not found' });
      return;
    }
    const executions = listExecutions({ userId, signalId, limit: 20 });
    res.json({ data, executions });
  });

  app.post('/api/executions', (req, res) => {
    const body = req.body as {
      userId?: string;
      signalId?: string;
      mode?: 'PAPER' | 'LIVE';
      action?: 'EXECUTE' | 'DONE' | 'CLOSE';
      note?: string;
      pnlPct?: number | null;
    };
    const userId = String(body.userId || '').trim() || 'guest-default';
    const signalId = String(body.signalId || '').trim();
    const mode = body.mode || 'PAPER';
    const action = body.action || 'EXECUTE';
    if (!signalId) {
      res.status(400).json({ error: 'signalId is required' });
      return;
    }
    if (!['PAPER', 'LIVE'].includes(mode) || !['EXECUTE', 'DONE', 'CLOSE'].includes(action)) {
      res.status(400).json({ error: 'Invalid mode/action' });
      return;
    }

    const result = upsertExecution({
      userId,
      signalId,
      mode,
      action,
      note: body.note,
      pnlPct: body.pnlPct
    });
    if (!result.ok) {
      res.status(404).json({ error: result.error });
      return;
    }
    res.json({ ok: true, executionId: result.executionId });
  });

  app.get('/api/market-state', (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const symbol = (req.query.symbol as string | undefined)?.toUpperCase();
    const timeframe = req.query.tf as string | undefined;
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const data = getMarketState({
      userId,
      market,
      symbol,
      timeframe
    });
    res.json({
      asof: new Date().toISOString(),
      count: data.length,
      data
    });
  });

  app.get('/api/performance', (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const range = (req.query.range as string | undefined) || undefined;
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const data = getPerformanceSummary({ userId, market, range });
    res.json(data);
  });

  app.get('/api/risk-profile', (req, res) => {
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const data = getRiskProfile(userId);
    res.json({ data });
  });

  app.get('/api/connect/broker', async (req, res) => {
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const provider = String((req.query.provider as string | undefined) || 'ALPACA').toUpperCase();
    const adapter = createBrokerAdapter(provider);
    const snapshot = await adapter.fetchSnapshot();
    const connections = listExternalConnections({ userId, connectionType: 'BROKER' });
    res.json({
      provider,
      mode: 'READ_ONLY',
      snapshot,
      connections
    });
  });

  app.post('/api/connect/broker', (req, res) => {
    const body = req.body as { userId?: string; provider?: string; mode?: 'READ_ONLY' | 'TRADING' };
    const userId = body.userId || 'guest-default';
    const provider = String(body.provider || 'ALPACA').toUpperCase();
    const mode = body.mode || 'READ_ONLY';
    const saved = upsertExternalConnection({
      userId,
      connectionType: 'BROKER',
      provider,
      mode,
      status: 'CONNECTED',
      meta: {
        capabilities: ['positions', 'buying_power']
      }
    });
    res.json({ ok: true, ...saved });
  });

  app.get('/api/connect/exchange', async (req, res) => {
    const userId = (req.query.userId as string | undefined) || 'guest-default';
    const provider = String((req.query.provider as string | undefined) || 'BINANCE').toUpperCase();
    const adapter = createExchangeAdapter(provider);
    const snapshot = await adapter.fetchSnapshot();
    const connections = listExternalConnections({ userId, connectionType: 'EXCHANGE' });
    res.json({
      provider,
      mode: 'READ_ONLY',
      snapshot,
      connections
    });
  });

  app.post('/api/connect/exchange', (req, res) => {
    const body = req.body as { userId?: string; provider?: string; mode?: 'READ_ONLY' | 'TRADING' };
    const userId = body.userId || 'guest-default';
    const provider = String(body.provider || 'BINANCE').toUpperCase();
    const mode = body.mode || 'READ_ONLY';
    const saved = upsertExternalConnection({
      userId,
      connectionType: 'EXCHANGE',
      provider,
      mode,
      status: 'CONNECTED',
      meta: {
        capabilities: ['balances', 'positions']
      }
    });
    res.json({ ok: true, ...saved });
  });

  app.get('/api/ohlcv', (req, res) => {
    const market = parseMarket(req.query.market as string | undefined);
    const symbol = (req.query.symbol as string | undefined)?.toUpperCase();
    const timeframe = parseTimeframe(req.query.tf as string | undefined);
    const start = isoToMs(req.query.start as string | undefined);
    const end = isoToMs(req.query.end as string | undefined);
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    if (!market || !symbol || !timeframe) {
      res.status(400).json({ error: 'Required query params: market, symbol, tf' });
      return;
    }

    const { asset, rows } = queryOhlcv({
      market,
      symbol,
      timeframe,
      start,
      end,
      limit
    });

    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }

    res.json({
      asset,
      timeframe,
      start,
      end,
      count: rows.length,
      data: rows
    });
  });

  async function handleChat(req: express.Request, res: express.Response) {
    const startedAt = Date.now();
    const body = req.body as {
      userId?: string;
      message?: string;
      context?: { signalId?: string; symbol?: string; market?: Market; assetClass?: AssetClass; timeframe?: string };
    };
    const userId = String(body?.userId || '').trim();
    const message = String(body?.message || '').trim();
    const context = body?.context;

    if (!userId || !message) {
      res.status(400).json({ error: 'userId and message are required' });
      return;
    }

    const rate = checkRateLimit(userId);
    if (!rate.allowed) {
      logChatAudit({
        userId,
        mode: context ? 'context-aware' : 'general-coach',
        provider: 'none',
        message,
        contextJson: JSON.stringify(context ?? {}),
        status: 'rate_limited',
        durationMs: Date.now() - startedAt
      });
      res.status(429).json({
        error: 'Rate limit exceeded',
        resetAt: rate.resetAt
      });
      return;
    }

    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    let mode: 'general-coach' | 'context-aware' = context ? 'context-aware' : 'general-coach';
    let provider = 'unknown';
    let responseText = '';
    let status: 'ok' | 'error' = 'ok';
    let errorText = '';

    try {
      for await (const event of streamChat({
        userId,
        message,
        context
      })) {
        if (event.type === 'meta') {
          mode = event.mode;
          provider = event.provider;
        } else if (event.type === 'chunk') {
          responseText += event.delta;
        } else if (event.type === 'error') {
          status = 'error';
          errorText = event.error;
        }

        res.write(`${JSON.stringify(event)}\n`);
      }
    } catch (error) {
      status = 'error';
      errorText = error instanceof Error ? error.message : String(error);
      res.write(`${JSON.stringify({ type: 'error', error: errorText })}\n`);
    } finally {
      logChatAudit({
        userId,
        mode,
        provider,
        message,
        contextJson: JSON.stringify(context ?? {}),
        status,
        error: errorText || undefined,
        responsePreview: responseText.slice(0, 1200),
        durationMs: Date.now() - startedAt
      });
      res.end();
    }
  }

  app.post('/api/chat', handleChat);
  app.post('/api/ai-chat', handleChat);

  // Internal tool endpoints consumed by AI assistant service.
  app.post('/getSignalCards', (req, res) => {
    const body = req.body as { userId?: string; market?: Market; assetClass?: AssetClass };
    const data = listSignalContracts({
      userId: body.userId || 'guest-default',
      assetClass: body.assetClass,
      market: body.market,
      status: 'ALL',
      limit: 40
    });
    res.json(data);
  });

  app.post('/getSignalDetail', (req, res) => {
    const body = req.body as { signalId?: string; userId?: string };
    const signalId = String(body.signalId || '').trim();
    if (!signalId) {
      res.status(400).json({ error: 'signalId is required' });
      return;
    }
    const data = getSignalContract(signalId, body.userId || 'guest-default');
    if (!data) {
      res.status(404).json({ error: 'Signal not found' });
      return;
    }
    res.json(data);
  });

  app.post('/getMarketTemperature', (req, res) => {
    const body = req.body as { market?: Market; symbol?: string; assetClass?: AssetClass; timeframe?: string; userId?: string };
    const data = getMarketState({
      userId: body.userId || 'guest-default',
      market: body.market,
      symbol: body.symbol,
      timeframe: body.timeframe
    });
    res.json(data[0] || null);
  });

  app.post('/getRiskProfile', (req, res) => {
    const body = req.body as { userId?: string };
    const data = getRiskProfile(body.userId || 'guest-default');
    res.json(data);
  });

  app.post('/getPerformanceSummary', (req, res) => {
    const body = req.body as { userId?: string; market?: Market; range?: string };
    const data = getPerformanceSummary({
      userId: body.userId || 'guest-default',
      market: body.market,
      range: body.range
    });
    res.json(data);
  });

  return app;
}
