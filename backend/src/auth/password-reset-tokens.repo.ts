import type { PasswordResetToken } from '@prisma/client';

export interface CreatePasswordResetTokenInput {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
}

// Skeleton — the spec in tests/passwordResetTokensRepo.test.ts lands
// first (red); the next commit implements these over Prisma.
export const passwordResetTokensRepo = {
  async create(_input: CreatePasswordResetTokenInput): Promise<PasswordResetToken> {
    throw new Error('not implemented');
  },

  async findByTokenHash(_tokenHash: string): Promise<PasswordResetToken | null> {
    throw new Error('not implemented');
  },

  async markUsed(_id: string): Promise<void> {
    throw new Error('not implemented');
  },
};
