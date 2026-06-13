import jwt, { type SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import type { User } from '@prisma/client';
import { config } from '../config';
import type { PublicUser } from '../types';
import { usersRepo, toPublicUser } from './users.repo';
import { passwordResetTokensRepo } from './password-reset-tokens.repo';
import { refreshTokensRepo } from './refresh-tokens.repo';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

export interface AuthClaims {
  sub: string; // user id
  username: string;
}

const BCRYPT_COST = 10;

// A real-format bcrypt hash for a value nobody knows. Used to keep the
// "unknown username" code path roughly the same wall-clock cost as the
// "wrong password" path — a cheap defence against username enumeration
// via timing. Hashed at module load (one-off ~80ms cost).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-timing-shim', BCRYPT_COST);

// Creates a user with the default `user` role — privilege is never
// self-assigned. Propagates DuplicateUsernameError (the route maps it
// to 409). Returns the client-safe shape; registration issues no
// session, so the caller logs in separately.
export async function registerUser(
  username: string,
  password: string,
  displayName: string,
): Promise<PublicUser> {
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const user = await usersRepo.create({ username, passwordHash, displayName });
  return toPublicUser(user);
}

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Reset and refresh tokens are high-entropy random values, so a fast
// sha256 is enough to store them safely (unlike low-entropy passwords,
// which need bcrypt). Only the hash is ever persisted.
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// Issues an opaque refresh token for a user, persists only its hash with
// a 30-day expiry, and returns the raw token for the client. The refresh
// token is database-backed (not a JWT) precisely so it can be revoked —
// on logout, rotation, or reuse detection.
async function issueRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await refreshTokensRepo.create({
    tokenHash: sha256(token),
    userId,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  return token;
}

export interface PasswordResetIssued {
  token: string;
  expiresAt: Date;
}

// Issues a single-use reset token for a known user, or null if no such
// user (the route turns null into a 404).
//
// Deliberately NOT enumeration-resistant, unlike authenticate(): the
// 404 reveals whether an account exists. That's unavoidable once we
// return the raw token in the response — an enumeration-safe design
// needs a constant response and an out-of-band channel (email). With no
// mail service and no private data in this demo, we accept the leak and
// surface the trade-off in the UI. Production would email the token and
// return a constant 200. Only the hash is persisted.
export async function requestPasswordReset(
  username: string,
): Promise<PasswordResetIssued | null> {
  const user = await usersRepo.findByUsername(username);
  if (!user) return null;

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await passwordResetTokensRepo.create({
    tokenHash: sha256(token),
    userId: user.id,
    expiresAt,
  });
  return { token, expiresAt };
}

// Consumes a reset token: returns false if it's unknown, already used or
// expired; otherwise updates the password, marks the token used, and
// revokes the user's refresh tokens (a password change ends other
// sessions). Single-use is enforced by markUsed + the usedAt check.
export async function confirmPasswordReset(
  token: string,
  newPassword: string,
): Promise<boolean> {
  const row = await passwordResetTokensRepo.findByTokenHash(sha256(token));
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) return false;

  await usersRepo.updatePassword(row.userId, await bcrypt.hash(newPassword, BCRYPT_COST));
  await passwordResetTokensRepo.markUsed(row.id);
  await refreshTokensRepo.revokeAllForUser(row.userId);
  return true;
}

export async function authenticate(
  username: string,
  password: string,
): Promise<AuthResult | null> {
  const user = await usersRepo.findByUsername(username);
  if (!user) {
    // Async compare against a dummy hash so the unknown-username path
    // costs the same wall-clock as the wrong-password path (anti-
    // enumeration), without blocking the event loop the way compareSync
    // would for ~80ms per attempt.
    await bcrypt.compare(password, DUMMY_HASH);
    return null;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return {
    accessToken: signAccessToken(user),
    refreshToken: await issueRefreshToken(user.id),
    user: toPublicUser(user),
  };
}

function signAccessToken(user: User): string {
  const claims: AuthClaims = { sub: user.id, username: user.username };
  const options: SignOptions = {
    expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'],
  };
  return jwt.sign(claims, config.jwtSecret, options);
}

export function verifyToken(token: string): AuthClaims | null {
  try {
    // Pin to HS256 explicitly. jsonwebtoken v9's default accepts the
    // whole HMAC family (HS256/HS384/HS512) when the secret is a
    // string, so a token forged with HS512 against our secret would
    // verify just as well — algorithm-confusion attack. Pinning closes
    // that and documents intent against future library defaults.
    const decoded = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
    });
    if (typeof decoded !== 'object' || decoded === null) return null;
    const payload = decoded as Record<string, unknown>;
    if (typeof payload.sub !== 'string' || typeof payload.username !== 'string') {
      return null;
    }
    return { sub: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}
