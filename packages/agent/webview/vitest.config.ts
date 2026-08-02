import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { sharedCoverage } from '../../../vitest.shared';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: sharedCoverage({ include: ['src/**/*.{ts,tsx}'] }),
  },
});
