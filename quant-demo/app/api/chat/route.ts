import { checkRateLimit } from '../../../src/server/chat/rateLimit.js';
import { streamChat } from '../../../src/server/chat/service.js';
import { logChatAudit } from '../../../src/server/chat/audit.js';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const startedAt = Date.now();
  const body = (await req.json().catch(() => ({}))) as {
    userId?: string;
    message?: string;
    context?: Record<string, unknown>;
  };

  const userId = String(body.userId || '').trim();
  const message = String(body.message || '').trim();
  const context = body.context;

  if (!userId || !message) {
    return new Response(JSON.stringify({ error: 'userId and message are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
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

    return new Response(JSON.stringify({ error: 'Rate limit exceeded', resetAt: rate.resetAt }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let mode: 'general-coach' | 'context-aware' = context ? 'context-aware' : 'general-coach';
  let provider = 'unknown';
  let responsePreview = '';
  let status: 'ok' | 'error' = 'ok';
  let errorText = '';

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        for await (const event of streamChat({
          userId,
          message,
          context: context as {
            signalId?: string;
            symbol?: string;
            market?: 'US' | 'CRYPTO';
            timeframe?: string;
          }
        })) {
          if (event.type === 'meta') {
            mode = event.mode;
            provider = event.provider;
          }
          if (event.type === 'chunk') {
            responsePreview += event.delta;
          }
          if (event.type === 'error') {
            status = 'error';
            errorText = event.error;
          }

          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch (error) {
        status = 'error';
        errorText = error instanceof Error ? error.message : String(error);
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'error', error: errorText })}\n`));
      } finally {
        logChatAudit({
          userId,
          mode,
          provider,
          message,
          contextJson: JSON.stringify(context ?? {}),
          status,
          error: errorText || undefined,
          responsePreview: responsePreview.slice(0, 1200),
          durationMs: Date.now() - startedAt
        });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform'
    }
  });
}
