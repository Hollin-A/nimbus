import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from './auth.service';
import { requireAuth } from './auth.middleware';
import { findById, toPublicUser } from './users.store';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid request body',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const result = await authenticate(parsed.data.username, parsed.data.password);
  if (!result) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  res.json({ token: result.token, user: result.user });
});

router.get('/me', requireAuth, (req: Request, res: Response) => {
  const claims = req.auth;
  if (!claims) {
    // Defensive — requireAuth guarantees req.auth, but TS doesn't know that.
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const user = findById(claims.sub);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ user: toPublicUser(user) });
});

export default router;
