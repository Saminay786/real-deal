import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so tests run without the extension plugin.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Parsing 2 MB saved Amazon pages takes > 5 s when all test files run in parallel (DECISIONS #51).
    testTimeout: 20_000,
  },
});
