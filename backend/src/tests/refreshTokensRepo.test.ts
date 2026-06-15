import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { refreshTokensRepo } from '../auth/refresh-tokens.repo';
import { usersRepo } from '../auth/users.repo';
import { getDb } from '../db';
import { truncateAll, disconnectDb } from './helpers/db';

// Persistence-behaviour tests against the real schema (nimbus_test).
// Refresh tokens have a foreign key to users, so each test seeds a real
// user first.

const USER = {
  username: 'freya',
  passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
  displayName: 'Freya Tester',
};

function tokenInput(userId: string, tokenHash: string) {
  return {
    tokenHash,
    userId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days out
  };
}

beforeEach(truncateAll);
afterAll(disconnectDb);

describe('refreshTokensRepo.create', () => {
  it('returns the stored token, not yet revoked', async () => {
    const user = await usersRepo.create(USER);
    const token = await refreshTokensRepo.create(tokenInput(user.id, 'hash-1'));

    expect(token.id).toEqual(expect.any(String));
    expect(token.id).toHaveLength(36); // uuid
    expect(token.tokenHash).toBe('hash-1');
    expect(token.userId).toBe(user.id);
    expect(token.revokedAt).toBeNull();
    expect(token.createdAt).toBeInstanceOf(Date);
  });
});

describe('refreshTokensRepo.findByTokenHash', () => {
  it('returns the stored token', async () => {
    const user = await usersRepo.create(USER);
    await refreshTokensRepo.create(tokenInput(user.id, 'hash-1'));

    const found = await refreshTokensRepo.findByTokenHash('hash-1');
    expect(found?.userId).toBe(user.id);
  });

  it('returns null for an unknown hash', async () => {
    expect(await refreshTokensRepo.findByTokenHash('nope')).toBeNull();
  });
});

describe('refreshTokensRepo.revoke', () => {
  it('sets revokedAt on the token', async () => {
    const user = await usersRepo.create(USER);
    const token = await refreshTokensRepo.create(tokenInput(user.id, 'hash-1'));

    await refreshTokensRepo.revoke(token.id);

    const found = await refreshTokensRepo.findByTokenHash('hash-1');
    expect(found?.revokedAt).toBeInstanceOf(Date);
  });
});

describe('refreshTokensRepo.revokeAllForUser', () => {
  it('revokes every token for the user and leaves other users untouched', async () => {
    const freya = await usersRepo.create(USER);
    const otto = await usersRepo.create({ ...USER, username: 'otto' });
    await refreshTokensRepo.create(tokenInput(freya.id, 'freya-1'));
    await refreshTokensRepo.create(tokenInput(freya.id, 'freya-2'));
    await refreshTokensRepo.create(tokenInput(otto.id, 'otto-1'));

    await refreshTokensRepo.revokeAllForUser(freya.id);

    expect((await refreshTokensRepo.findByTokenHash('freya-1'))?.revokedAt).toBeInstanceOf(Date);
    expect((await refreshTokensRepo.findByTokenHash('freya-2'))?.revokedAt).toBeInstanceOf(Date);
    expect((await refreshTokensRepo.findByTokenHash('otto-1'))?.revokedAt).toBeNull();
  });
});

describe('refresh token schema', () => {
  it('cascades deletes — removing a user removes their refresh tokens', async () => {
    const user = await usersRepo.create(USER);
    await refreshTokensRepo.create(tokenInput(user.id, 'hash-1'));

    // Raw client: testing the schema's onDelete: Cascade, not a repo
    // method (usersRepo has no delete — no consumer needs one yet).
    await getDb().user.delete({ where: { id: user.id } });

    expect(await refreshTokensRepo.findByTokenHash('hash-1')).toBeNull();
  });
});
