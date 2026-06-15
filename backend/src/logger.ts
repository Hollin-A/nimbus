import pino from 'pino';
import { config } from './config';

// Structured JSON logger — one line per event to stdout, the shape Render
// (and any log aggregator) expects. Silent under test so the suite's
// deliberate failure-path cases (502s, retries, failed logins) don't
// clutter output.
//
// Levels convention:
//   error — server-side failure (5xx, uncaught)
//   warn  — noteworthy client-side problem (failed auth, upstream retry,
//           probing-shaped input)
//   info  — audit trail (login success, broadcast sent, socket join)
//   debug — quiet by default; flip on with LOG_LEVEL=debug locally
// Defence in depth: even if a future log statement dumps a whole request,
// headers, or credential object, these paths never reach the output. The
// top-level `password`/`token` entries catch the case where the object is
// logged directly rather than nested under `req`. Exported so the
// redaction test guards this real config rather than a copy — the
// no-secret-leak invariant has teeth only if the test sees the same paths.
export const redactOptions = {
  paths: [
    'req.headers.authorization',
    'req.body.password',
    'req.body.token',
    'password',
    'token',
  ],
  censor: '[redacted]',
};

export const logger = pino({
  level: config.nodeEnv === 'test' ? 'silent' : (process.env.LOG_LEVEL ?? 'info'),
  redact: redactOptions,

  // Drop pid/hostname noise — single-instance demo; request/connection
  // correlation ids (added in later commits) are the identifiers that
  // matter for tracing.
  base: undefined,
});

export type Logger = typeof logger;
