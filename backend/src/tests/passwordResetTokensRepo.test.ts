import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { passwordResetTokensRepo } from '../auth/password-reset-tokens.repo';
import { usersRepo } from '../auth/users.repo';
import { getDb } from '../db';
import { truncateAll, disconnectDb } from './helpers/db';

const USER = {
  username: 'freya',
  passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
  displayName: 'Freya Tester',
};

function tokenInput(userId: string, tokenHash: string) {
  return {
    tokenHash,
    userId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1h out
  };
}

beforeEach(truncateAll);
afterAll(disconnectDb);

describe('passwordResetTokensRepo.create', () => {
  it('returns the stored token, not yet used', async () => {
    const user = await usersRepo.create(USER);
    const token = await passwordResetTokensRepo.create(tokenInput(user.id, 'hash-1'));

    expect(token.id).toHaveLength(36); // uuid
    expect(token.tokenHash).toBe('hash-1');
    expect(token.userId).toBe(user.id);
    expect(token.usedAt).toBeNull();
    expect(token.createdAt).toBeInstanceOf(Date);
  });
});

describe('passwordResetTokensRepo.findByTokenHash', () => {
  it('returns the stored token', async () => {
    const user = await usersRepo.create(USER);
    await passwordResetTokensRepo.create(tokenInput(user.id, 'hash-1'));

    const found = await passwordResetTokensRepo.findByTokenHash('hash-1');
    expect(found?.userId).toBe(user.id);
  });

  it('returns null for an unknown hash', async () => {
    expect(await passwordResetTokensRepo.findByTokenHash('nope')).toBeNull();
  });
});

describe('passwordResetTokensRepo.markUsed', () => {
  it('stamps usedAt on the token', async () => {
    const user = await usersRepo.create(USER);
    const token = await passwordResetTokensRepo.create(tokenInput(user.id, 'hash-1'));

    await passwordResetTokensRepo.markUsed(token.id);

    const found = await passwordResetTokensRepo.findByTokenHash('hash-1');
    expect(found?.usedAt).toBeInstanceOf(Date);
  });
});

describe('password reset token schema', () => {
  it('cascades deletes — removing a user removes their reset tokens', async () => {
    const user = await usersRepo.create(USER);
    await passwordResetTokensRepo.create(tokenInput(user.id, 'hash-1'));

    await getDb().user.delete({ where: { id: user.id } });

    expect(await passwordResetTokensRepo.findByTokenHash('hash-1')).toBeNull();
  });
});
