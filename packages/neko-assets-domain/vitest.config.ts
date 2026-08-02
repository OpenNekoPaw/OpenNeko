import { defineConfig } from 'vitest/config';
import { sharedCoverage } from '../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: sharedCoverage({
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/extension.ts', 'packages/asset/src/**'],
      thresholds: {
        lines: 20,
        branches: 16,
        functions: 25,
        statements: 19,
      },
    }),
  },
});
