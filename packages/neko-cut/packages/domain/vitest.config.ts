import { defineConfig } from 'vitest/config';
import { sharedCoverage } from '../../../../vitest.shared';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: sharedCoverage({ include: ['src/**/*.ts'] }),
  },
});
