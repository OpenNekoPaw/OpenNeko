import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { resolveActVitestMaxWorkers, sharedCoverage } from '../../vitest.shared';

export default defineConfig({
  resolve: {
    alias: {
      vscode: resolve(import.meta.dirname, 'src/features/agent/__mocks__/vscode.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    maxWorkers: resolveActVitestMaxWorkers(),
    include: ['src/{adapters,features}/**/*.test.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'src/features/agent/ai/**/*.test.ts',
      'src/features/agent/chat/chatProvider.test.ts',
    ],
    coverage: sharedCoverage({
      include: ['src/{adapters,features}/**/*.{ts,tsx}'],
    }),
  },
});
