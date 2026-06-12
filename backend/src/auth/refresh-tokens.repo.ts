import type { RefreshToken } from '@prisma/client';
import { getDb } from '../db';

// Dormant until workstream 2.3 (refresh tokens & session lifecycle) —
// every method has a named consumer there: create (issue at login),
// findByTokenHash (the /refresh lookup; only hashes are stored, never
// the token itself), revoke (rotation + logout), revokeAllForUser (the
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
