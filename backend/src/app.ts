import express, {
  type ErrorRequestHandler,
  type Express,
  type Request,
  type Response,
} from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { config } from './config';
import { logger } from './logger';
import authRouter from './auth/auth.routes';
import { seedUsers } from './auth/users.store';
import weatherRouter from './weather/weather.routes';
import messagesRouter from './messages/messages.routes';

// Logs unexpected errors (anything that reached here via next(err) or a thrown
// middleware error) and returns a consistent JSON body. Client errors that
// carry a status (e.g. malformed JSON from express.json → 400) are echoed with
// that status; everything else is a 500.
const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const status =
    typeof (err as { status?: number }).status === 'number'
      ? (err as { status: number }).status
      : 500;

  if (status >= 500) {
    logger.error(
      `[error] ${req.method} ${req.originalUrl} —`,
      err instanceof Error ? (err.stack ?? err.message) : err,
    );
  }

  if (res.headersSent) return;
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : 'Invalid request',
  });
};

export function createApp(): Express {
  // Idempotent — safe to call on every app construction, including per-test.
  seedUsers();

  const app = express();

  // Request logging — first, so it captures every request (including
  // rate-limited 429s and 404s). Skip /api/health (Render + the uptime ping
  // poll it constantly) and stay silent during tests.
  if (config.nodeEnv !== 'test') {
    app.use(
      morgan('tiny', {
        skip: (req) => req.url === '/api/health',
      }),
    );
  }

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
  );
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/weather', weatherRouter);
  app.use('/api/messages', messagesRouter);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(errorHandler);

  return app;
}
