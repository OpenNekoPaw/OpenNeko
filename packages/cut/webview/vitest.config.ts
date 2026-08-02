import { defineConfig } from 'vitest/config';
import { sharedCoverage } from '../../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: sharedCoverage({
      include: ['src/**/*.{ts,tsx}'],
      thresholds: {
        lines: 21,
        branches: 20,
        functions: 23,
        statements: 22,
      },
    }),
  },
});
