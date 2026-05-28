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
