import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { sharedCoverage } from '../../vitest.shared';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: sharedCoverage({ include: ['src/**/*.{ts,tsx}'] }),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@neko-agent/types': resolve(__dirname, '../neko-agent-types/src'),
      '@neko/markdown': resolve(__dirname, '../neko-markdown/src'),
      '@neko/shared': resolve(__dirname, '../neko-types/src'),
    },
  },
});
