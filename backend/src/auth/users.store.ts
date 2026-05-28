import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { PublicUser } from '../types';

export interface User {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
}

// In-memory user table, keyed by user id. See docs/adr/0002 for the rationale
// behind in-memory storage and the migration path to a real database.
const users = new Map<string, User>();

const BCRYPT_COST = 10;

/**
 * Seeds the in-memory store with the demo account expected by the challenge
 * brief. Idempotent — safe to call from createApp() on every app boot and
 * from tests.
 */
export function seedUsers(): void {
  if (findByUsername('demo')) return;
  const user: User = {
    id: randomUUID(),
    username: 'demo',
    displayName: 'Demo User',
    passwordHash: bcrypt.hashSync('demo123', BCRYPT_COST),
  };
  users.set(user.id, user);
}

export function findByUsername(username: string): User | undefined {
  for (const user of users.values()) {
    if (user.username === username) return user;
  }
  return undefined;
}

export function findById(id: string): User | undefined {
  return users.get(id);
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
  };
}
