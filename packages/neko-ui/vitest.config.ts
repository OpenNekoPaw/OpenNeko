import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sharedCoverage } from '../../vitest.shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@neko/markdown': resolve(__dirname, '../neko-markdown/src/index.ts'),
      '@neko/shared/icons': resolve(__dirname, '../neko-types/src/icons/index.ts'),
      '@neko/shared': resolve(__dirname, '../neko-types/src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: sharedCoverage({ include: ['src/**/*.{ts,tsx}'] }),
  },
});
