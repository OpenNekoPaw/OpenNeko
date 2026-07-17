import { defineConfig } from 'vitest/config';
import { sharedCoverage } from '../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.test.{ts,tsx}',
      'packages/extension/src/**/*.test.{ts,tsx}',
      'packages/webview/src/**/*.test.{ts,tsx}',
    ],
    coverage: sharedCoverage({
      include: [
        'src/**/*.{ts,tsx}',
        'packages/extension/src/**/*.{ts,tsx}',
        'packages/webview/src/**/*.{ts,tsx}',
      ],
      thresholds: {
        lines: 13,
        branches: 11,
        functions: 16,
        statements: 12,
      },
    }),
  },
});
