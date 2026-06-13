import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app';
import { config } from '../config';
import { seed } from '../seed';
import { usersRepo } from '../auth/users.repo';
import { refreshTokensRepo } from '../auth/refresh-tokens.repo';
import { getDb } from '../db';
import { truncateAll, disconnectDb } from './helpers/db';

const app = createApp();

// Per-test isolation: the register specs create users, so each test
// starts from a clean DB re-seeded with just the admin/viewer accounts.
beforeEach(async () => {
  await truncateAll();
  await seed();
});
afterAll(disconnectDb);

describe('POST /api/auth/login', () => {
  it('returns 200 with an access token, a refresh token and a public user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });

    expect(res.status).toBe(200);
    // Access token: a JWT (three dot-separated segments).
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.accessToken.split('.')).toHaveLength(3);
    // Refresh token: a non-empty opaque string, distinct from the access token.
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.refreshToken.length).toBeGreaterThan(20);
    expect(res.body.refreshToken).not.toBe(res.body.accessToken);
    expect(res.body.user).toMatchObject({ username: 'admin' });
    // Never leak the password hash to clients.
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.user).not.toHaveProperty('password');
  });

  it('returns 401 on an incorrect password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error).toEqual(expect.any(String));
    expect(res.body).not.toHaveProperty('token');
  });

  it('returns 401 on an unknown username', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ghost', password: 'admin123' });

    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('token');
  });

  it('returns 400 when username is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'admin123' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin' });

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
      username: 'admin',
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
      .send({ username: 'admin', password: 'admin123' });
    return res.body.accessToken;
  }

  it('returns the current user with a valid bearer token', async () => {
    const token = await loginAndGetToken();

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ username: 'admin' });
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

  it('returns 401 for a token signed with HS512 instead of HS256 (algorithm-confusion guard)', async () => {
    // jsonwebtoken v9 defaults to accepting HS256/HS384/HS512 — so a
    // token signed with HS512 using our secret verifies just as well
    // as HS256. Pinning verify to algorithms: ['HS256'] closes that.
    // Today this returns 404 (token verifies, sub doesn't match a
    // user) — proves the verifier accepts the wrong algorithm.
    const hs512Token = jwt.sign(
      { sub: 'irrelevant', username: 'attacker' },
      config.jwtSecret,
      { algorithm: 'HS512' },
    );

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${hs512Token}`);

    expect(res.status).toBe(401);
  });

  it("returns 401 for a hand-crafted alg:'none' token", async () => {
    // jsonwebtoken v9 already rejects alg:none by default; pinning to
    // algorithms:['HS256'] makes that guarantee independent of future
    // library defaults. Regression guard — green today and after.
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url',
    );
    const payload = Buffer.from(
      JSON.stringify({ sub: 'attacker', username: 'attacker' }),
    ).toString('base64url');
    const noneToken = `${header}.${payload}.`;

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${noneToken}`);

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/register', () => {
  const VALID = { username: 'newbie', password: 'password123', displayName: 'New Bie' };

  it('returns 201 with the public user on a valid body', async () => {
    const res = await request(app).post('/api/auth/register').send(VALID);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ username: 'newbie', displayName: 'New Bie' });
    expect(res.body.user.id).toEqual(expect.any(String));
    // Never leak the hash; register issues no token (login is a separate step).
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body).not.toHaveProperty('token');
  });

  it('lets a newly registered user log in', async () => {
    await request(app).post('/api/auth/register').send(VALID);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'newbie', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('returns 409 on a duplicate username', async () => {
    await request(app).post('/api/auth/register').send(VALID);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...VALID, displayName: 'Someone Else' });

    expect(res.status).toBe(409);
  });

  it('returns 400 when the username is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ password: 'password123', displayName: 'New Bie' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when the password is shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'shorty', password: 'short', displayName: 'Shorty' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when displayName is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'nodisplay', password: 'password123' });
    expect(res.status).toBe(400);
  });

  it('ignores a role in the body — registration cannot self-elevate', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...VALID, username: 'sneaky', role: 'admin' });

    expect(res.status).toBe(201);
    const stored = await usersRepo.findByUsername('sneaky');
    expect(stored?.role).toBe('user');
  });
});

describe('POST /api/auth/password-reset/request', () => {
  it('returns a token + expiry for a known user', async () => {
    const res = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ username: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.expiresAt).toEqual(expect.any(String));
  });

  it('returns 404 for an unknown user', async () => {
    const res = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ username: 'nobody' });

    // Assert the specific message so this is genuinely red against the
    // generic 404 fallback ("Not found") before the route exists.
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no account/i);
  });

  it('returns 400 when username is missing', async () => {
    const res = await request(app).post('/api/auth/password-reset/request').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/password-reset/confirm', () => {
  async function requestToken(username = 'admin'): Promise<string> {
    const res = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ username });
    return res.body.token as string;
  }

  it('resets the password end-to-end: new password works, old fails', async () => {
    const token = await requestToken();

    const confirm = await request(app)
      .post('/api/auth/password-reset/confirm')
      .send({ token, password: 'brand-new-pass' });
    expect(confirm.status).toBe(200);

    const withNew = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'brand-new-pass' });
    expect(withNew.status).toBe(200);

    const withOld = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    expect(withOld.status).toBe(401);
  });

  it('returns 400 for an unknown token', async () => {
    const res = await request(app)
      .post('/api/auth/password-reset/confirm')
      .send({ token: 'not-a-real-token', password: 'brand-new-pass' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when reusing an already-used token (single-use)', async () => {
    const token = await requestToken();
    await request(app)
      .post('/api/auth/password-reset/confirm')
      .send({ token, password: 'brand-new-pass' });

    const reuse = await request(app)
      .post('/api/auth/password-reset/confirm')
      .send({ token, password: 'another-new-pass' });
    expect(reuse.status).toBe(400);
  });

  it('returns 400 for an expired token', async () => {
    const token = await requestToken();
    // Expire it directly — avoids coupling the test to the hash scheme.
    await getDb().passwordResetToken.updateMany({
      where: { usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app)
      .post('/api/auth/password-reset/confirm')
      .send({ token, password: 'brand-new-pass' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when the new password is too short', async () => {
    const token = await requestToken();
    const res = await request(app)
      .post('/api/auth/password-reset/confirm')
      .send({ token, password: 'short' });
    expect(res.status).toBe(400);
  });

  it('revokes the user’s refresh tokens on a successful reset', async () => {
    const admin = await usersRepo.findByUsername('admin');
    await refreshTokensRepo.create({
      tokenHash: 'rt-hash',
      userId: admin!.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const token = await requestToken();
    await request(app)
      .post('/api/auth/password-reset/confirm')
      .send({ token, password: 'brand-new-pass' });

    const rt = await refreshTokensRepo.findByTokenHash('rt-hash');
    expect(rt?.revokedAt).toBeInstanceOf(Date);
  });
});

describe('case-insensitive usernames', () => {
  it('stores a registered username in lowercase', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'NewBie', password: 'password123', displayName: 'New Bie' });

    expect(await usersRepo.findByUsername('newbie')).not.toBeNull();
    expect(await usersRepo.findByUsername('NewBie')).toBeNull();
  });

  it('lets a user log in regardless of username casing', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'newbie', password: 'password123', displayName: 'New Bie' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'NEWBIE', password: 'password123' });

    expect(res.status).toBe(200);
  });

  it('treats a differently-cased username as a duplicate (admin is seeded)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'ADMIN', password: 'password123', displayName: 'Impostor' });

    expect(res.status).toBe(409);
  });

  it('finds the account for a reset request regardless of casing', async () => {
    const res = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ username: 'ADMIN' });

    expect(res.status).toBe(200);
  });
});
