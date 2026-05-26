import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../auth/auth.middleware';
import { broadcastMessage } from '../realtime/socket';
import { addMessage, getHistory } from './messages.store';
import { historyQuerySchema, messageInputSchema } from './messages.schema';

const router = Router();

router.post('/', requireAuth, (req: Request, res: Response) => {
  const parsed = messageInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid message',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const message = addMessage(parsed.data);
  broadcastMessage(message);
  res.status(201).json({ message });
});

router.get('/', requireAuth, (req: Request, res: Response) => {
  const parsed = historyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid query',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const messages = getHistory(parsed.data.latitude, parsed.data.longitude);
  res.json({ messages });
});

export default router;
