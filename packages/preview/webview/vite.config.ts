import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { createEpubJsPatchPlugin } from './epubjs-vite-patch-plugin';

export default defineConfig({
  plugins: [react(), createEpubJsPatchPlugin()],
  base: './',
  resolve: {
    preserveSymlinks: true,
  },
  server: {
    port: 5174,
    strictPort: true,
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5174,
    },
    fs: {
      allow: [path.resolve(__dirname, '..'), path.resolve(__dirname, '../..')],
    },
  },
  build: {
    outDir: 'dist',
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        video: path.resolve(__dirname, 'video.html'),
        audio: path.resolve(__dirname, 'audio.html'),
        pdf: path.resolve(__dirname, 'pdf.html'),
        cbz: path.resolve(__dirname, 'cbz.html'),
        epub: path.resolve(__dirname, 'epub.html'),
        docx: path.resolve(__dirname, 'docx.html'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
    modulePreload: false,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@neko/ui'],
  },
});
