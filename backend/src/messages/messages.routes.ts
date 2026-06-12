import express, { Router, type Request, type Response } from 'express';
import { requireAuth } from '../auth/auth.middleware';
import { broadcastMessage } from '../realtime/socket';
import { messagesRepo } from './messages.repo';
import { historyQuerySchema, messageInputSchema } from './messages.schema';

const router = Router();

// Order: requireAuth → json → handler. Auth-first means anonymous
// callers get 401 before the body parser runs; no info leak about
// the size limit to unauth probers. 1kB caps the realistic body
// (Zod caps message at 280 chars; the wrapper adds ~60 bytes).
router.post(
  '/',
  requireAuth,
  express.json({ limit: '1kb' }),
  async (req: Request, res: Response) => {
    const parsed = messageInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid message',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const message = await messagesRepo.add(parsed.data);
    broadcastMessage(message);
    res.status(201).json({ message });
  },
);

router.get('/', requireAuth, async (req: Request, res: Response) => {
  const parsed = historyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid query',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const messages = await messagesRepo.history(parsed.data.latitude, parsed.data.longitude);
  res.json({ messages });
});

export default router;
