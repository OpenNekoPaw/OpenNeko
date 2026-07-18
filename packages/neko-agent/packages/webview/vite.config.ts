import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { createRequire } from 'module';

// Resolve d3 dist bundle to avoid pnpm sub-package resolution issues.
// d3's main entry is src/index.js (unbundled), which imports d3-array etc.
// as bare specifiers. In pnpm strict mode these are not accessible via the
// standard node_modules lookup. Using the self-contained dist bundle avoids
// the problem entirely.
const require = createRequire(import.meta.url);
// d3 main entry is src/index.js (unbundled). Navigate up two dirs to find the
// package root and use the self-contained dist bundle instead.
const d3Main = require.resolve('d3'); // → .../d3/src/index.js
const d3Dist = path.join(d3Main, '../../dist/d3.min.js');

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@neko-agent/types': path.resolve(__dirname, '../agent-types/src'),
      '@neko/shared': path.resolve(__dirname, '../../../neko-types/src'),
      d3: d3Dist,
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
    manifest: 'asset-manifest.json',
    rollupOptions: {
      input: {
        assistant: path.resolve(__dirname, 'index.html'),
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          // Rename style.css to assistant-style.css to avoid conflicts
          if (assetInfo.name === 'style.css') {
            return 'assets/assistant-style-[hash].css';
          }
          return 'assets/[name]-[hash].[ext]';
        },
        // Entry and imported chunks share content-addressed paths so the
        // VSCode resource proxy cannot mix assets from different builds.
      },
    },
    modulePreload: false,
  },
  optimizeDeps: {
    include: ['@neko/shared', 'mermaid'],
  },
});
