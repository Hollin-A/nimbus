import { describe, it, expect } from 'vitest';
import pino from 'pino';
import { redactOptions } from '../logger';

// Redaction is a security invariant, not a tautology: if someone edits the
// redact paths and breaks password/token scrubbing, secrets start leaking
// to logs. This guards the *real* config (imported, not a copy) by piping a
// fresh logger through it and asserting the sensitive value never reaches
// the output while the censor token does.
function capture(logFn: (log: pino.Logger) => void): string {
  const lines: string[] = [];
  const stream = { write: (s: string) => void lines.push(s) };
  const log = pino({ level: 'info', redact: redactOptions, base: undefined }, stream);
  logFn(log);
  return lines.join('');
}

describe('logger redaction', () => {
  it('censors a nested request authorization header', () => {
    const line = capture((log) =>
      log.info({ req: { headers: { authorization: 'Bearer SECRET-TOKEN' } } }, 'x'),
    );
    expect(line).not.toContain('SECRET-TOKEN');
    expect(line).toContain('[redacted]');
  });

  it('censors a nested request body password', () => {
    const line = capture((log) => log.info({ req: { body: { password: 'hunter2' } } }, 'x'));
    expect(line).not.toContain('hunter2');
    expect(line).toContain('[redacted]');
  });

  it('censors top-level password and token fields', () => {
    const line = capture((log) =>
      log.info({ password: 'pw-leak', token: 'tok-leak' }, 'x'),
    );
    expect(line).not.toContain('pw-leak');
    expect(line).not.toContain('tok-leak');
    expect(line).toContain('[redacted]');
  });
});
