import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: {
        'global-library': resolve(import.meta.dirname, 'src/global-library/root.tsx'),
        'asset-center-main': resolve(import.meta.dirname, 'src/global-library/main-root.tsx'),
        'resource-browser': resolve(import.meta.dirname, 'src/resource-browser/root.tsx'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        'react',
        'react/jsx-runtime',
        '@neko/assets-domain/global-library/contract',
        '@neko/assets-domain/global-library/controller',
        '@neko/assets-domain/asset-center/contract',
        '@neko/assets-domain/asset-center/controller',
        '@neko/assets-domain/resource-browser/contract',
        '@neko/shared',
        '@neko/ui/icons',
      ],
    },
  },
});
