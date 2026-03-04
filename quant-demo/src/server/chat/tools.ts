import fs from 'node:fs';
import path from 'node:path';
import type { ChatContextInput, ToolContextBundle } from './types.js';

const internalBase = (
  process.env.INTERNAL_API_BASE_URL ||
  process.env.API_BASE_URL ||
  `http://127.0.0.1:${process.env.PORT || 8787}`
).replace(/\/$/, '');

async function callInternalTool<T>(pathName: string, payload: Record<string, unknown>): Promise<T | null> {
  if (!internalBase) return null;

  try {
    const res = await fetch(`${internalBase}${pathName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function readJsonFile<T>(relativePath: string): T | null {
  const absolute = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(absolute)) return null;
  try {
    return JSON.parse(fs.readFileSync(absolute, 'utf-8')) as T;
  } catch {
    return null;
  }
}

export async function getSignalCards(userId: string): Promise<unknown[]> {
  const remote = await callInternalTool<unknown[]>('/getSignalCards', { userId });
  if (Array.isArray(remote) && remote.length) return remote;

  const local = readJsonFile<unknown[]>('public/mock/signals.json');
  return Array.isArray(local) ? local : [];
}

export async function getSignalDetail(signalId: string): Promise<Record<string, unknown> | null> {
  const remote = await callInternalTool<Record<string, unknown>>('/getSignalDetail', { signalId });
  if (remote && typeof remote === 'object') return remote;

  const local = readJsonFile<Array<Record<string, unknown>>>('public/mock/signals.json');
  if (!Array.isArray(local)) return null;
  return (local.find((item) => String(item.signal_id) === signalId) as Record<string, unknown> | undefined) ?? null;
}

export async function getMarketTemperature(
  market: string,
  symbol?: string
): Promise<Record<string, unknown> | null> {
  const remote = await callInternalTool<Record<string, unknown>>('/getMarketTemperature', {
    market,
    symbol
  });
  if (remote && typeof remote === 'object') return remote;

  const local = readJsonFile<Record<string, unknown>>('public/mock/velocity.json');
  return local ?? null;
}

export async function getRiskProfile(userId: string): Promise<Record<string, unknown> | null> {
  const remote = await callInternalTool<Record<string, unknown>>('/getRiskProfile', { userId });
  if (remote && typeof remote === 'object') return remote;

  const local = readJsonFile<Record<string, unknown>>('public/mock/config.json');
  if (!local) return null;
  const risk = (local.risk_rules as Record<string, unknown> | undefined) || {};
  return risk;
}

export async function getPerformanceSummary(
  userId: string,
  market?: string
): Promise<Record<string, unknown> | null> {
  const remote = await callInternalTool<Record<string, unknown>>('/getPerformanceSummary', {
    userId,
    market
  });
  if (remote && typeof remote === 'object') return remote;

  const local = readJsonFile<Record<string, unknown>>('public/mock/performance.json');
  return local ?? null;
}

export async function buildContextBundle(args: {
  userId: string;
  context?: ChatContextInput;
}): Promise<ToolContextBundle> {
  const { userId, context } = args;
  const signalCards = await getSignalCards(userId);

  let signalDetail: Record<string, unknown> | null = null;
  if (context?.signalId) {
    signalDetail = await getSignalDetail(context.signalId);
  }

  if (!signalDetail && context?.symbol) {
    const match = signalCards.find((item) => {
      if (!item || typeof item !== 'object') return false;
      const symbol = String((item as Record<string, unknown>).symbol ?? '').toUpperCase();
      return symbol === context.symbol?.toUpperCase();
    });

    if (match && typeof match === 'object') {
      signalDetail = match as Record<string, unknown>;
    }
  }

  const marketTemperature =
    context?.market || context?.symbol
      ? await getMarketTemperature(context.market || 'CRYPTO', context.symbol)
      : null;

  const riskProfile = await getRiskProfile(userId);
  const performanceSummary = await getPerformanceSummary(userId, context?.market);

  return {
    signalCards,
    signalDetail,
    marketTemperature,
    riskProfile,
    performanceSummary,
    hasExactSignalData: Boolean(signalDetail)
  };
}
