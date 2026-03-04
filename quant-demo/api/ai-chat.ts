import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from './chat.js';

export default async function aiChatHandler(req: VercelRequest, res: VercelResponse) {
  return handler(req, res);
}

