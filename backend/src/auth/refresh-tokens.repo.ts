import type { RefreshToken } from '@prisma/client';
import { getDb } from '../db';

// Backs the session lifecycle: create (issue a refresh token at login),
// findByTokenHash (the /refresh lookup; only hashes are stored, never the
// token itself), revoke (rotation + logout), revokeAllForUser (the
// reuse-detection response: a revoked token presented again kills the
// whole family).

export interface CreateRefreshTokenInput {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
}

export const refreshTokensRepo = {
  async create(input: CreateRefreshTokenInput): Promise<RefreshToken> {
    return getDb().refreshToken.create({ data: input });
  },

  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return getDb().refreshToken.findUnique({ where: { tokenHash } });
  },

  async revoke(id: string): Promise<void> {
    await getDb().refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  },

  async revokeAllForUser(userId: string): Promise<void> {
    // Only active tokens — don't overwrite an existing revocation
    // timestamp on already-revoked rows.
    await getDb().refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
