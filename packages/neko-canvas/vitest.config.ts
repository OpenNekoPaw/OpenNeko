import { defineConfig } from 'vitest/config';
import { resolveActVitestMaxWorkers, sharedCoverage } from '../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    maxWorkers: resolveActVitestMaxWorkers(),
    include: ['packages/extension/src/**/*.test.{ts,tsx}'],
    coverage: sharedCoverage({ include: ['packages/extension/src/**/*.{ts,tsx}'] }),
  },
});
