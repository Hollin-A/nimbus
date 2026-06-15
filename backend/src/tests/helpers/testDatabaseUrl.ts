// Derives the test database URL from the dev DATABASE_URL by swapping
// the database name. Used by both the global setup (create + migrate)
// and the per-worker env setup, so the two can never drift.
export const TEST_DB_NAME = 'nimbus_test';

export function testDatabaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${TEST_DB_NAME}`;
  return url.toString();
}
