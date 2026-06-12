import 'dotenv/config';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { TEST_DB_NAME, testDatabaseUrl } from './helpers/testDatabaseUrl';

// Runs once per vitest invocation, in the runner process (the per-worker
// DATABASE_URL override lives in setupEnv.ts). Creates the test database
// if missing and brings its schema up to date with the committed
// migrations. Requires a reachable Postgres — locally:
// `docker compose up postgres`.
export default async function setup(): Promise<void> {
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error(
      'DATABASE_URL is not set — backend tests need Postgres. ' +
        'Run `docker compose up -d postgres` and set DATABASE_URL in backend/.env.',
    );
  }

  const admin = new PrismaClient({ datasourceUrl: base });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE ${TEST_DB_NAME}`);
  } catch (err) {
    // 42P04 duplicate_database — fine, reuse it (migrate deploy below
    // is idempotent and brings it up to date).
    if (!String(err).includes('already exists')) throw err;
  } finally {
    await admin.$disconnect();
  }

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl(base) },
    stdio: 'pipe',
  });
}
