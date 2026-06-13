import type { PasswordResetToken } from '@prisma/client';
import { getDb } from '../db';

export interface CreatePasswordResetTokenInput {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
}

export const passwordResetTokensRepo = {
  async create(input: CreatePasswordResetTokenInput): Promise<PasswordResetToken> {
    return getDb().passwordResetToken.create({ data: input });
  },

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    return getDb().passwordResetToken.findUnique({ where: { tokenHash } });
  },

  async markUsed(id: string): Promise<void> {
    await getDb().passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  },
};
