import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  build: {
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      external: ['electron', 'sharp'],
      output: {
        entryFileNames: 'main.cjs',
      },
    },
  },
}));
