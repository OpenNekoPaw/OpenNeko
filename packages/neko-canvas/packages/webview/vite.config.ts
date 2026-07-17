import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@neko/shared': path.resolve(__dirname, '../../../neko-types/src'),
      '@neko/neko-client': path.resolve(__dirname, '../../../neko-client/src'),
      '@neko/ui': path.resolve(__dirname, '../../../neko-ui/src'),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, '..'), path.resolve(__dirname, '../..')],
    },
  },
  build: {
    outDir: 'dist',
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'index.html'),
        'narrative-preview-media-runtime': path.resolve(
          __dirname,
          'src/preview/narrativePreviewMediaRuntime.ts',
        ),
      },
      output: {
        entryFileNames: (chunkInfo) =>
          chunkInfo.name === 'index' ? 'assets/index.js' : 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css') {
            return 'assets/index.css';
          }
          return 'assets/[name].[ext]';
        },
      },
    },
    modulePreload: false,
  },
  optimizeDeps: {
    include: ['@neko/shared', '@neko/ui'],
  },
});
