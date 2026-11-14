import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so tests run without the extension plugin.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
