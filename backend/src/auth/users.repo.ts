import type { Role, User } from '@prisma/client';

/** Thrown on a username collision — the register route maps it to 409. */
export class DuplicateUsernameError extends Error {
  constructor(username: string) {
    super(`Username already taken: ${username}`);
    this.name = 'DuplicateUsernameError';
  }
}

export interface CreateUserInput {
  username: string;
  passwordHash: string;
  displayName: string;
  role?: Role;
}

// Skeleton — the spec in tests/usersRepo.test.ts lands first (red);
// the next commit implements these over Prisma.
export const usersRepo = {
  async create(_input: CreateUserInput): Promise<User> {
    throw new Error('not implemented');
  },

  async findByUsername(_username: string): Promise<User | null> {
    throw new Error('not implemented');
  },

  async findById(_id: string): Promise<User | null> {
    throw new Error('not implemented');
  },
};
