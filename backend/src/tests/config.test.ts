import { describe, it, expect, vi, afterEach } from 'vitest';

// config.ts evaluates its production guards at module load. To exercise
// each guard we have to: stub the env vars first, reset the module cache,
// then re-import so the top-level code runs with the new env. afterEach
// resets both so tests don't leak state into each other.

describe('config — production guards', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('throws when NODE_ENV=production and JWT_SECRET is the dev default', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'dev-only-change-me');
    vi.stubEnv('CORS_ORIGIN', 'https://prod.example.com');
    vi.resetModules();

    await expect(import('../config')).rejects.toThrow(/JWT_SECRET/);
  });

  it('throws when NODE_ENV=production and CORS_ORIGIN is the dev default', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'a-real-non-default-secret');
    vi.stubEnv('CORS_ORIGIN', 'http://localhost:5173');
    vi.resetModules();

    await expect(import('../config')).rejects.toThrow(/CORS_ORIGIN/);
  });

  it('loads without throwing when both JWT_SECRET and CORS_ORIGIN are non-default in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'a-real-non-default-secret');
    vi.stubEnv('CORS_ORIGIN', 'https://prod.example.com');
    vi.resetModules();

    const { config } = await import('../config');
    expect(config.nodeEnv).toBe('production');
  });
});
