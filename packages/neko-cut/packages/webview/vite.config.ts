import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(({ command }) => {
  const isBuild = command === 'build';

  return {
  plugins: [
    react(),
    // Copy static assets
    viteStaticCopy({
      targets: [],
    }),
  ],
  // Use relative paths for VSCode webview compatibility
  base: './',
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@neko/shared': path.resolve(__dirname, '../../../neko-types/src'),
      '@neko/ui': path.resolve(__dirname, '../../../neko-ui/src'),
      '@neko/neko-client': path.resolve(__dirname, '../../../../packages/neko-client/src'),
      '@neko/effects-core': path.resolve(__dirname, '../../../neko-engine/packages/effects-core/src'),
      '@neko/effects-core/shaders/common': path.resolve(__dirname, '../../../neko-engine/packages/effects-core/src/shaders/common.wgsl.ts'),
      '@neko/effects-core/shaders/colorCorrection': path.resolve(__dirname, '../../../neko-engine/packages/effects-core/src/shaders/colorCorrection.wgsl.ts'),
      '@neko/effects-core/shaders/blendModes': path.resolve(__dirname, '../../../neko-engine/packages/effects-core/src/shaders/blendModes.wgsl.ts'),
      '@neko/effects-core/shaders/transitions': path.resolve(__dirname, '../../../neko-engine/packages/effects-core/src/shaders/transitions.wgsl.ts'),
      '@neko/effects-core/shaders/effects': path.resolve(__dirname, '../../../neko-engine/packages/effects-core/src/shaders/effects.wgsl.ts'),
      '@neko/effects-core/shaders': path.resolve(__dirname, '../../../neko-engine/packages/effects-core/src/shaders'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Allow CORS for VSCode Webview (vscode-webview:// origin)
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
    },
    fs: {
      // 允许通过 workspace 依赖访问 monorepo 内其它包（例如 @neko/shared）
      allow: [path.resolve(__dirname, '../../..'), path.resolve(__dirname, '../../../..')],
    },
  },
  worker: {
    // Inline workers as base64 data URLs to avoid cross-origin issues in VSCode WebView
    format: 'es',
    rollupOptions: {
      output: {
        // Use inline format for workers
        entryFileNames: 'assets/[name].js',
      },
    },
    plugins: () => [
      {
        name: 'worker-alias',
        resolveId(source) {
          const aliasMap: Record<string, string> = {
            '@neko/effects-core/shaders/common': path.resolve(__dirname, '../../../neko-engine/packages/effects-core/src/shaders/common.wgsl.ts'),
            '@neko/effects-core/shaders/colorCorrection': path.resolve(__dirname, '../../../neko-engine/packages/effects-core/src/shaders/colorCorrection.wgsl.ts'),
            '@neko/effects-core/shaders/blendModes': path.resolve(__dirname, '../../../neko-engine/packages/effects-core/src/shaders/blendModes.wgsl.ts'),
            '@neko/effects-core/shaders/transitions': path.resolve(__dirname, '../../../neko-engine/packages/effects-core/src/shaders/transitions.wgsl.ts'),
            '@neko/effects-core/shaders/effects': path.resolve(__dirname, '../../../neko-engine/packages/effects-core/src/shaders/effects.wgsl.ts'),
            '@neko/effects-core/shaders': path.resolve(__dirname, '../../../neko-engine/packages/effects-core/src/shaders/index.ts'),
            '@neko/effects-core': path.resolve(__dirname, '../../../neko-engine/packages/effects-core/src/index.ts'),
            '@neko/shared': path.resolve(__dirname, '../../../neko-types/src/index.ts'),
          };
          if (aliasMap[source]) {
            return aliasMap[source];
          }
          // Handle subpath imports
          for (const [alias, target] of Object.entries(aliasMap)) {
            if (source.startsWith(alias + '/')) {
              const subpath = source.slice(alias.length);
              return target.replace(/\/index\.ts$/, '') + subpath + '.ts';
            }
          }
          return null;
        },
      },
    ],
  },
  build: {
    outDir: 'dist',
    // Disable CSS code splitting to avoid preload issues in VSCode webview
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'index.html'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name].[ext]',
      },
      // Externalize dynamically imported modules that are not available in webview
      external: isBuild ? [] : [],
    },
    // Disable module preload polyfill which causes issues in VSCode webview
    modulePreload: false,
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['@neko/shared'],
  },
};
});
