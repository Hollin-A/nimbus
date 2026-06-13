import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { usersRepo, DuplicateUsernameError } from '../auth/users.repo';
import { truncateAll, disconnectDb } from './helpers/db';

// Repository tests run against the real schema in the nimbus_test
// database (see globalSetup) — they assert persistence behaviour, not
// mocks: unique constraints, column defaults, round-trips.

const VALID = {
  username: 'freya',
  passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
  displayName: 'Freya Tester',
};

beforeEach(truncateAll);
afterAll(disconnectDb);

describe('usersRepo.create', () => {
  it('returns the created user with a generated id and defaults', async () => {
    const user = await usersRepo.create(VALID);

    expect(user.id).toEqual(expect.any(String));
    expect(user.id).toHaveLength(36); // uuid
    expect(user.username).toBe('freya');
    expect(user.displayName).toBe('Freya Tester');
    expect(user.role).toBe('user'); // schema default
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  it('persists an explicit admin role (the seed path)', async () => {
    const user = await usersRepo.create({ ...VALID, role: 'admin' });
    expect(user.role).toBe('admin');
  });

  it('throws DuplicateUsernameError on a username collision', async () => {
    await usersRepo.create(VALID);
    await expect(
      usersRepo.create({ ...VALID, displayName: 'Someone Else' }),
    ).rejects.toBeInstanceOf(DuplicateUsernameError);
  });
});

describe('usersRepo.findByUsername', () => {
  it('returns the stored row', async () => {
    await usersRepo.create(VALID);
    const found = await usersRepo.findByUsername('freya');
    expect(found?.displayName).toBe('Freya Tester');
    expect(found?.passwordHash).toBe(VALID.passwordHash);
  });

  it('returns null for an unknown username', async () => {
    expect(await usersRepo.findByUsername('ghost')).toBeNull();
  });
});

describe('usersRepo.findById', () => {
  it('returns the stored row', async () => {
    const created = await usersRepo.create(VALID);
    const found = await usersRepo.findById(created.id);
    expect(found?.username).toBe('freya');
  });

  it('returns null for a valid-but-absent uuid', async () => {
    // randomUUID, not an arbitrary string — the column is a Postgres
    // uuid, so a malformed id is a driver error, not a miss.
    expect(await usersRepo.findById(randomUUID())).toBeNull();
  });
});

describe('usersRepo.updatePassword', () => {
  it('replaces the stored password hash', async () => {
    const created = await usersRepo.create(VALID);
    await usersRepo.updatePassword(created.id, '$2a$10$NEWHASHvalueXXXXXXXXXX');

    const found = await usersRepo.findById(created.id);
    expect(found?.passwordHash).toBe('$2a$10$NEWHASHvalueXXXXXXXXXX');
  });
});
