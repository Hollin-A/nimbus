import express, { Router, type Request, type Response } from 'express';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { validateBody, validateQuery } from '../middleware/validation';
import { broadcastMessage } from '../realtime/socket';
import { messagesRepo } from './messages.repo';
import { historyQuerySchema, messageInputSchema } from './messages.schema';

const router = Router();

// Order: requireAuth → json → validate → handler. Auth-first means anonymous
// callers get 401 before the body parser runs; no info leak about the size
// limit to unauth probers. 1kB caps the realistic body (Zod caps message at
// 280 chars; the wrapper adds ~60 bytes).
router.post(
  '/',
  requireAuth,
  requireRole('admin'), // broadcasting is admin-only
  express.json({ limit: '1kb' }),
  validateBody(messageInputSchema),
  async (req: Request, res: Response) => {
    const message = await messagesRepo.add(req.body);
    broadcastMessage(message);
    res.status(201).json({ message });
  },
);

router.get(
  '/',
  requireAuth,
  validateQuery(historyQuerySchema),
  async (_req: Request, res: Response) => {
    const { latitude, longitude } = res.locals.query;
    const messages = await messagesRepo.history(latitude, longitude);
    res.json({ messages });
  },
);

export default router;
