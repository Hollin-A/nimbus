import { Prisma, type Role, type User } from '@prisma/client';
import { getDb } from '../db';

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

export const usersRepo = {
  async create(input: CreateUserInput): Promise<User> {
    try {
      return await getDb().user.create({ data: input });
    } catch (err) {
      // P2002 = unique constraint violation. The only unique column on
      // users is username, so the mapping is unambiguous.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new DuplicateUsernameError(input.username);
      }
      throw err;
    }
  },

  async findByUsername(username: string): Promise<User | null> {
    return getDb().user.findUnique({ where: { username } });
  },

  async findById(id: string): Promise<User | null> {
    return getDb().user.findUnique({ where: { id } });
  },
};
