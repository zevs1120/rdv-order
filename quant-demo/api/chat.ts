import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkRateLimit } from '../src/server/chat/rateLimit.js';
import { streamChat } from '../src/server/chat/service.js';
import { logChatAudit } from '../src/server/chat/audit.js';
import type { Market } from '../src/server/types.js';

interface ChatBody {
  userId?: string;
  message?: string;
  context?: {
    signalId?: string;
    symbol?: string;
    market?: Market;
    timeframe?: string;
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const startedAt = Date.now();
  const body = (req.body || {}) as ChatBody;
  const userId = String(body.userId || '').trim();
  const message = String(body.message || '').trim();
  const context = body.context;

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
    res.status(429).json({ error: 'Rate limit exceeded', resetAt: rate.resetAt });
    return;
  }

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');

  let mode: 'general-coach' | 'context-aware' = context ? 'context-aware' : 'general-coach';
  let provider = 'unknown';
  let responseText = '';
  let status: 'ok' | 'error' = 'ok';
  let errorText = '';

  try {
    for await (const event of streamChat({ userId, message, context })) {
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
