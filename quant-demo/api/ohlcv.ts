import type { VercelRequest, VercelResponse } from '@vercel/node';
import { queryOhlcv } from '../src/server/api/queries.js';
import { isoToMs } from '../src/server/utils/time.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const market = typeof req.query.market === 'string' ? req.query.market.toUpperCase() : '';
  const symbol = typeof req.query.symbol === 'string' ? req.query.symbol.toUpperCase() : '';
  const tf = typeof req.query.tf === 'string' ? req.query.tf : '';

  if (!market || !symbol || !tf) {
    res.status(400).json({ error: 'Required query params: market, symbol, tf' });
    return;
  }

  if (market !== 'US' && market !== 'CRYPTO') {
    res.status(400).json({ error: 'Invalid market' });
    return;
  }

  const start = typeof req.query.start === 'string' ? isoToMs(req.query.start) : undefined;
  const end = typeof req.query.end === 'string' ? isoToMs(req.query.end) : undefined;
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

  const result = queryOhlcv({
    market: market as 'US' | 'CRYPTO',
    symbol,
    timeframe: tf as '1m' | '5m' | '15m' | '1h' | '1d',
    start,
    end,
    limit
  });

  if (!result.asset) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }

  res.status(200).json({
    asset: result.asset,
    timeframe: tf,
    start,
    end,
    count: result.rows.length,
    data: result.rows
  });
}
