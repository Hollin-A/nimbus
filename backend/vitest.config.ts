import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/tests/**/*.test.ts'],
    globals: false,
    clearMocks: true,
    restoreMocks: true,
  },
});
