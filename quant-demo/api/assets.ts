import type { VercelRequest, VercelResponse } from '@vercel/node';
import { listAssets } from '../src/server/api/queries.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const market = typeof req.query.market === 'string' ? req.query.market.toUpperCase() : undefined;
  if (market && market !== 'US' && market !== 'CRYPTO') {
    res.status(400).json({ error: 'Invalid market' });
    return;
  }

  const data = listAssets(market as 'US' | 'CRYPTO' | undefined);
  res.status(200).json({ market: market ?? 'ALL', count: data.length, data });
}
