import { config } from './config';

// Thin console wrapper that goes silent under NODE_ENV=test so the suite's
// expected failure-path cases (502s, retries) don't clutter test output.
// Not a logging framework — just a single place to gate the noise.
const enabled = config.nodeEnv !== 'test';

export const logger = {
  warn(...args: unknown[]): void {
    if (enabled) console.warn(...args);
  },
  error(...args: unknown[]): void {
    if (enabled) console.error(...args);
  },
};
