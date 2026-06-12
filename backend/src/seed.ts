import bcrypt from 'bcryptjs';
import { usersRepo } from './auth/users.repo';
import { logger } from './logger';

const BCRYPT_COST = 10;

// Two demo accounts whose usernames signal their role, so the
// role-restricted experience is demonstrable straight from the README:
// `admin` gets the full experience (can broadcast); `viewer` shows what
// a plain user sees once broadcasting is admin-only (workstream 2.4).
const SEED_ACCOUNTS = [
  { username: 'admin', password: 'admin123', displayName: 'Admin', role: 'admin' as const },
  { username: 'viewer', password: 'viewer123', displayName: 'Viewer', role: 'user' as const },
];

// Idempotent — safe to run on every boot. Hashing is sync here because
// seeding is a one-off at startup, not a per-request path (async bcrypt
// for the request paths lands in workstream 2.2).
export async function seed(): Promise<void> {
  for (const account of SEED_ACCOUNTS) {
    if (await usersRepo.findByUsername(account.username)) continue;
    await usersRepo.create({
      username: account.username,
      passwordHash: bcrypt.hashSync(account.password, BCRYPT_COST),
      displayName: account.displayName,
      role: account.role,
    });
    logger.info({ event: 'seed.user', username: account.username, role: account.role }, 'seeded account');
  }
}
