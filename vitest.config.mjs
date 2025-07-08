import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'html'],
    },
  },
}); 