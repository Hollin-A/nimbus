import jwt, { type SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config';
import type { PublicUser } from '../types';
import { findByUsername, toPublicUser, type User } from './users.store';

export interface AuthResult {
  token: string;
  user: PublicUser;
}

export interface AuthClaims {
  sub: string; // user id
  username: string;
}

// A real-format bcrypt hash for a value nobody knows. Used to keep the
// "unknown username" code path roughly the same wall-clock cost as the
// "wrong password" path — a cheap defence against username enumeration
// via timing. Hashed at module load (one-off ~80ms cost).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-timing-shim', 10);

export async function authenticate(
  username: string,
  password: string,
): Promise<AuthResult | null> {
  const user = findByUsername(username);
  if (!user) {
    bcrypt.compareSync(password, DUMMY_HASH);
    return null;
  }
  const ok = bcrypt.compareSync(password, user.passwordHash);
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
    const decoded = jwt.verify(token, config.jwtSecret);
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
