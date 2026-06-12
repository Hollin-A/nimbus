import type { RefreshToken } from '@prisma/client';

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

// Skeleton — the spec in tests/refreshTokensRepo.test.ts lands first
// (red); the next commit implements these over Prisma.
export const refreshTokensRepo = {
  async create(_input: CreateRefreshTokenInput): Promise<RefreshToken> {
    throw new Error('not implemented');
  },

  async findByTokenHash(_tokenHash: string): Promise<RefreshToken | null> {
    throw new Error('not implemented');
  },

  async revoke(_id: string): Promise<void> {
    throw new Error('not implemented');
  },

  async revokeAllForUser(_userId: string): Promise<void> {
    throw new Error('not implemented');
  },
};
