import 'dotenv/config';
import { testDatabaseUrl } from './helpers/testDatabaseUrl';

// Runs in every test worker before any test imports application code.
// Repointing DATABASE_URL at the test database means the lazily-created
// Prisma client (src/db.ts) can never touch the dev database from a
// test, no matter what a test file does.
if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = testDatabaseUrl(process.env.DATABASE_URL);
}
