import jwt, { type SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { User } from '@prisma/client';
import { config } from '../config';
import type { PublicUser } from '../types';
import { usersRepo, toPublicUser } from './users.repo';

export interface AuthResult {
  token: string;
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
    token: signToken(user),
    user: toPublicUser(user),
  };
}

function signToken(user: User): string {
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
