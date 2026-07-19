import { defineConfig } from 'vitest/config';
import { resolveActVitestMaxWorkers, sharedCoverage } from '../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    maxWorkers: resolveActVitestMaxWorkers(2),
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/**/*.bun.test.ts', 'dist/**', 'node_modules/**'],
    coverage: sharedCoverage({ include: ['src/**/*.{ts,tsx}'] }),
  },
});
