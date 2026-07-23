import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sharedCoverage } from '../../vitest.shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@neko/shared': resolve(__dirname, '../neko-types/src'),
      '@neko/ui': resolve(__dirname, '../neko-ui/src'),
      '@neko/neko-client': resolve(__dirname, '../neko-client/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/extension/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: sharedCoverage({
      include: ['src/**/*.{ts,tsx}', 'packages/extension/src/**/*.{ts,tsx}'],
    }),
  },
});
