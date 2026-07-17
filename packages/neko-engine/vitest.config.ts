import { defineConfig } from 'vitest/config';
import { sharedCoverage } from '../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/extension/src/**/*.test.ts'],
    fileParallelism: false,
    coverage: sharedCoverage({
      include: [
        'src/**/*.{ts,tsx}',
        'packages/extension/src/**/*.{ts,tsx}',
        'packages/host-napi/src/**/*.{ts,tsx}',
      ],
    }),
  },
});
