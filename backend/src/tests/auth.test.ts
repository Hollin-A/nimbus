import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';

// Outside-in TDD: these specs describe the HTTP contract first. The next
// commit adds users.store, auth.service, auth.middleware and auth.routes
// to make them pass. Until then, every endpoint hits the 404 fallback —
// that is the intended red state.

const app = createApp();

describe('POST /api/auth/login', () => {
  it('returns 200 with a token and a public user on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'demo', password: 'demo123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.token.length).toBeGreaterThan(20);
    expect(res.body.user).toMatchObject({ username: 'demo' });
    // Never leak the password hash to clients.
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.user).not.toHaveProperty('password');
  });

  it('returns 401 on an incorrect password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'demo', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error).toEqual(expect.any(String));
    expect(res.body).not.toHaveProperty('token');
  });

  it('returns 401 on an unknown username', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ghost', password: 'demo123' });

    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('token');
  });

  it('returns 400 when username is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'demo123' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'demo' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when the body is empty', async () => {
    const res = await request(app).post('/api/auth/login').send({});

    expect(res.status).toBe(400);
  });

  it('returns 413 when the request body exceeds the per-route limit', async () => {
    // ~340-byte body; the per-route limit will be 256B so this exceeds
    // it. Without the limit the request would reach bcrypt before being
    // rejected with 401 — the 413 guard short-circuits that work.
    const oversized = JSON.stringify({
      username: 'demo',
      password: 'x'.repeat(300),
    });
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(oversized);

    expect(res.status).toBe(413);
  });
});

describe('GET /api/auth/me', () => {
  async function loginAndGetToken(): Promise<string> {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'demo', password: 'demo123' });
    return res.body.token;
  }

  it('returns the current user with a valid bearer token', async () => {
    const token = await loginAndGetToken();

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ username: 'demo' });
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('returns 401 when no Authorization header is sent', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
  });

  it('returns 401 when the Authorization scheme is not Bearer', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Basic dXNlcjpwYXNz');

    expect(res.status).toBe(401);
  });

  it('returns 401 when the token is malformed', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.real.token');

    expect(res.status).toBe(401);
  });

  it('returns 401 when the token is signed with the wrong secret', async () => {
    // A token shaped like a JWT but signed by a different issuer. Should be
    // rejected as invalid, not accepted.
    const foreignToken =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.s8VmIWxIfAYsh-rqGY1xV0Pq2WfWBC_2WhqfBOQjJsM';

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${foreignToken}`);

    expect(res.status).toBe(401);
  });
});
