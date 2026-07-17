import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { sharedCoverage } from '../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: sharedCoverage({ include: ['src/**/*.{ts,tsx}'] }),
  },
  resolve: {
    alias: {
      '@neko/shared': path.resolve(__dirname, '../neko-types/src'),
      'vscode': path.resolve(__dirname, 'src/testing/vscode.ts'),
    },
  },
});
