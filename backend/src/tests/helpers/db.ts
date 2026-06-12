import { getDb, disconnectDb } from '../../db';

// Wipes all rows between tests — simpler, and fast enough at this
// scale, compared to transaction-rollback isolation (which fights
// Prisma's transaction model). RESTART IDENTITY resets sequences;
// CASCADE covers the users → refresh_tokens FK.
export async function truncateAll(): Promise<void> {
  await getDb().$executeRawUnsafe(
    'TRUNCATE TABLE refresh_tokens, messages, users RESTART IDENTITY CASCADE',
  );
}

export { disconnectDb };
