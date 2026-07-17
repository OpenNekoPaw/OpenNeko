import { defineConfig } from 'vitest/config';
import path from 'path';
import { sharedCoverage } from '../../../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: sharedCoverage({ include: ['src/**/*.{ts,tsx}'] }),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@neko/shared': path.resolve(__dirname, '../../../neko-types/src'),
      '@neko/ui': path.resolve(__dirname, '../../../neko-ui/src'),
      '@neko/neko-client': path.resolve(__dirname, '../../../neko-client/src'),
    },
  },
});
