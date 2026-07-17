import { defineConfig } from 'vitest/config';
import { sharedCoverage } from '../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/extension/src/**/*.test.{ts,tsx}'],
    coverage: sharedCoverage({ include: ['packages/extension/src/**/*.{ts,tsx}'] }),
  },
});
