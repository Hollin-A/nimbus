import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';

const app = createApp();

describe('app middleware', () => {
  it('GET /api/health returns status + uptime', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('returns a JSON 404 for an unknown route', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.error).toEqual(expect.any(String));
  });

  it('error handler returns a JSON body (not HTML) for a malformed JSON request', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ not valid json');

    // express.json throws a SyntaxError with status 400; the error handler
    // echoes that status with our JSON shape rather than Express's default
    // HTML error page.
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.error).toEqual(expect.any(String));
  });
});

describe('request correlation', () => {
  // Every response carries an X-Request-ID so a client can quote it from a
  // failed response and we can grep every log line for that one request.
  // The id is minted by middleware that runs before routing, so even 404s
  // and rate-limited responses carry it.
  it('returns an X-Request-ID header on a normal response', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-request-id']).toEqual(expect.any(String));
    expect(res.headers['x-request-id']).not.toBe('');
  });

  it('returns a distinct X-Request-ID for each request', async () => {
    const a = await request(app).get('/api/health');
    const b = await request(app).get('/api/health');
    expect(a.headers['x-request-id']).not.toBe(b.headers['x-request-id']);
  });

  it('sets X-Request-ID even on a 404 (minted before routing)', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.headers['x-request-id']).toEqual(expect.any(String));
    expect(res.headers['x-request-id']).not.toBe('');
  });
});

describe('security response headers', () => {
  // Each header maps to a specific risk: clickjacking (X-Frame-Options +
  // CSP frame-ancestors), MIME-sniffing (X-Content-Type-Options),
  // HTTPS-downgrade (HSTS with long max-age + preload), referrer leakage.
  // We assert the explicit overrides; helmet's defaults supply the rest.
  it('blocks framing with X-Frame-Options: DENY', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('blocks MIME-sniffing with X-Content-Type-Options: nosniff', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets HSTS with max-age=31536000, includeSubDomains, preload', async () => {
    const res = await request(app).get('/api/health');
    const hsts = res.headers['strict-transport-security'];
    expect(hsts).toContain('max-age=31536000');
    expect(hsts).toContain('includeSubDomains');
    expect(hsts).toContain('preload');
  });

  it('sets Referrer-Policy: strict-origin-when-cross-origin', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it("CSP includes frame-ancestors 'none' (defence-in-depth with X-Frame-Options)", async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });
});
