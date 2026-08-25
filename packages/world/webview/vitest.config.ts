import { defineConfig } from 'vitest/config';
import { sharedCoverage } from '../../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: sharedCoverage({
      include: ['src/**/*.{ts,tsx}'],
      thresholds: { lines: 20, branches: 15, functions: 20, statements: 20 },
    }),
  },
});
