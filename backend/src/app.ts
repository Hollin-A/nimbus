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
import { requestContext } from './middleware/request-context';
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
      {
        method: req.method,
        url: req.originalUrl,
        err: err instanceof Error ? (err.stack ?? err.message) : err,
      },
      'unhandled request error',
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

  // Behind Render's proxy the client IP arrives in X-Forwarded-For. Trust
  // the first hop (not `true`, which is permissive and lets a client spoof
  // its own rate-limit key) so req.ip is the real client — what the auth
  // audit log records, and what express-rate-limit keys on.
  app.set('trust proxy', 1);

  // Correlation id — first of all, so every downstream middleware and
  // handler (including morgan, the rate limiter's 429s, and the 404
  // fallback) can reference req.id / req.log and every response carries
  // the X-Request-ID header.
  app.use(requestContext);

  // Request logging — early, so it captures every request (including
  // rate-limited 429s and 404s). The :id token ties each access-log line
  // back to the structured pino lines for the same request. Skip
  // /api/health (Render + the uptime ping poll it constantly) and stay
  // silent during tests.
  if (config.nodeEnv !== 'test') {
    morgan.token('id', (req: Request) => req.id);
    app.use(
      morgan(':id :method :url :status :res[content-length] - :response-time ms', {
        skip: (req) => req.url === '/api/health',
      }),
    );
  }

  // Explicit overrides on top of helmet's defaults. Defaults already give
  // us X-Content-Type-Options: nosniff and a baseline CSP; we tighten the
  // ones whose defaults are weaker than what we want:
  //   - frameguard:   DENY > SAMEORIGIN (no embedding at all, paired with
  //                   CSP frame-ancestors 'none' as defence-in-depth)
  //   - hsts:         1 year + preload (default is 180 days, no preload)
  //   - referrer:     strict-origin-when-cross-origin (default is no-referrer,
  //                   which breaks legitimate same-origin nav diagnostics)
  //   - csp:          start from defaults, override frame-ancestors 'none'
  app.use(
    helmet({
      frameguard: { action: 'deny' },
      hsts: {
        maxAge: 31_536_000, // 1 year, matches HSTS preload requirement
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'frame-ancestors': ["'none'"],
        },
      },
    }),
  );
  app.use(cors({ origin: config.corsOrigin }));
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
  );
  // No global body parser — each POST route below opts in to express.json
  // with a tight per-route limit (auth.routes 256B, messages.routes 1kB).
  // Anything new that needs to read a JSON body has to declare its own
  // limit, which surfaces the "what is the realistic max body for this
  // endpoint" question at write time instead of leaving it to the
  // 32kb global default.

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
