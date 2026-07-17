import { defineConfig } from 'vitest/config';
import path from 'path';
import { sharedCoverage } from '../../../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // 全仓并发测试时，这个包偶发 worker 启动超时，收敛为单文件串行执行以保证稳定性。
    fileParallelism: false,
    coverage: sharedCoverage({ include: ['src/**/*.{ts,tsx}'] }),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@neko/shared/icons': path.resolve(__dirname, '../../../neko-types/src/icons/index.ts'),
      '@neko/shared': path.resolve(__dirname, '../../../neko-types/src'),
      '@neko/ui': path.resolve(__dirname, '../../../neko-ui/src'),
    },
  },
});
