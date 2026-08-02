import { defineConfig } from 'vitest/config';
import { sharedCoverage } from '../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    setupFiles: ['src/test/setupCanvasStoreScope.ts'],
    // 全仓并发测试时，这个包偶发 worker 启动超时，收敛为单文件串行执行以保证稳定性。
    fileParallelism: false,
    coverage: sharedCoverage({ include: ['src/**/*.{ts,tsx}'] }),
  },
});
