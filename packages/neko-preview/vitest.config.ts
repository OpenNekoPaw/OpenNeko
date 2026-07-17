import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sharedCoverage } from '../../vitest.shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@neko/shared/icons': resolve(__dirname, '../neko-types/src/icons/index.ts'),
      '@neko/shared': resolve(__dirname, '../neko-types/src'),
      '@neko/neko-client': resolve(__dirname, '../neko-client/src'),
      '@neko/ui': resolve(__dirname, '../neko-ui/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/extension/src/**/*.test.ts',
      'packages/webview/src/**/*.test.ts',
      'packages/webview/src/**/*.test.tsx',
    ],
    // 全仓 Turbo 并发测试时，这个包的 worker 启动容易超时，收敛为单文件串行执行以提升稳定性。
    fileParallelism: false,
    coverage: sharedCoverage({
      include: [
        'src/**/*.{ts,tsx}',
        'packages/extension/src/**/*.{ts,tsx}',
        'packages/webview/src/**/*.{ts,tsx}',
      ],
    }),
  },
});
