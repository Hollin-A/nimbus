import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/tests/**/*.test.ts'],
    globals: false,
    clearMocks: true,
    restoreMocks: true,
    // Test-database lifecycle: globalSetup creates nimbus_test and
    // applies migrations once per run; setupEnv repoints every worker's
    // DATABASE_URL at it before any application code loads.
    globalSetup: ['src/tests/globalSetup.ts'],
    setupFiles: ['src/tests/setupEnv.ts'],
    // Files share the one nimbus_test database and repo tests truncate
    // between cases — parallel files would wipe each other's rows
    // mid-test. Serial files cost a few seconds at this suite size;
    // revisit with per-worker databases if that ever hurts.
    fileParallelism: false,
  },
});
