import { PrismaClient } from '@prisma/client';

// Lazy singleton — the client (and its connection pool) is only created
// on first use, so importing app code never opens a database connection
// for paths that don't touch persistence. DATABASE_URL is read at first
// call, which lets the test setup repoint it before anything connects.
let client: PrismaClient | null = null;

export function getDb(): PrismaClient {
  if (!client) {
    client = new PrismaClient();
  }
  return client;
}

export async function disconnectDb(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}
