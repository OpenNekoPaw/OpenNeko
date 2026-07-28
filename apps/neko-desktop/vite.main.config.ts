import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    sourcemap: true,
    rollupOptions: {
      external: ['electron'],
      output: {
        entryFileNames: 'main.cjs',
      },
    },
  },
});
