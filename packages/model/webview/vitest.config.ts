import { defineConfig } from 'vitest/config';
import { sharedCoverage } from '../../../vitest.shared';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: sharedCoverage({ include: ['src/**/*.{ts,tsx}'] }),
  },
});
