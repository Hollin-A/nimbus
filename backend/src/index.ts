import http from 'node:http';
import { createApp } from './app';
import { config } from './config';
import { logger } from './logger';
import { disconnectDb } from './db';
import { seed } from './seed';
import { initSocket } from './realtime/socket';

// Errors that bypass Express — a throw in a non-request callback, a
// rejected promise nobody awaits — hit Node's default: a raw text stack
// to stderr that a JSON log pipeline mangles, then exit. Log the death
// in our structured format instead, then exit 1: after an uncaught
// error the process state is unknown, so the restart (Render / compose
// restart policy) is the recovery — our job is the readable death
// certificate. Registered before createApp() so even a crash during
// startup is captured.
process.on('uncaughtException', (err) => {
  logger.fatal(
    { event: 'process.uncaught_exception', err: err.stack ?? err.message },
    'uncaught exception — exiting',
  );
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal(
    {
      event: 'process.unhandled_rejection',
      err: reason instanceof Error ? (reason.stack ?? reason.message) : String(reason),
    },
    'unhandled rejection — exiting',
  );
  process.exit(1);
});

const app = createApp();
const server = http.createServer(app);
const io = initSocket(server);

// Seed the demo accounts before accepting traffic, then listen. seed()
// is idempotent, so a restart against an existing database is a no-op.
seed()
  .then(() => {
    server.listen(config.port, () => {
      logger.info(
        { event: 'server.start', port: config.port, env: config.nodeEnv },
        `Nimbus API listening on http://localhost:${config.port}`,
      );
    });
  })
  .catch((err: unknown) => {
    logger.fatal(
      { event: 'server.start.failed', err: err instanceof Error ? err.stack : String(err) },
      'failed to seed/start — exiting',
    );
    process.exit(1);
  });

// Render (and most orchestrators) send SIGTERM before SIGKILL on every
// deploy. Without a handler Node exits immediately — in-flight requests
// are severed mid-response and sockets die without a disconnect frame.
// Drain instead: stop accepting new connections, finish what's in
// flight, then exit 0 so the platform reads it as a clean stop.
const SHUTDOWN_TIMEOUT_MS = 10_000;

function shutdown(signal: string): void {
  logger.info({ event: 'server.shutdown', signal }, 'received shutdown signal');

  // Backstop: if a connection refuses to drain, exit on our own terms
  // with a logged reason rather than waiting for the platform's SIGKILL.
  // unref() so this timer alone never keeps a finished process alive.
  const force = setTimeout(() => {
    logger.error(
      { event: 'server.shutdown.timeout', timeoutMs: SHUTDOWN_TIMEOUT_MS },
      'forced exit — drain timed out',
    );
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();

  // io.close() (not server.close()) — a bare server.close() waits for
  // long-lived WebSockets to end naturally, which could be hours.
  // Socket.IO disconnects its clients (they get a proper disconnect
  // frame and auto-reconnect to the new deploy), then closes the
  // underlying HTTP server, draining in-flight requests.
  io.close(() => {
    // Close the DB pool too, so the process exits without dangling
    // connections. Best-effort — exit regardless of the result.
    void disconnectDb().finally(() => {
      logger.info({ event: 'server.shutdown.complete' }, 'drained, exiting');
      clearTimeout(force);
      process.exit(0);
    });
  });
}

// once, not on: a second signal during drain shouldn't re-enter shutdown.
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
