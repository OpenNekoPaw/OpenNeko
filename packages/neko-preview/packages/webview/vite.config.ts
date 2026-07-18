import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Patch epubjs Navigation.load bug: json.map() fails when json is not an array.
// Patch epubjs qs/qsa bug: getElementsByTagName called on non-DOM objects.
// Both are known issues with certain EPUBs in epubjs 0.3.x.
function epubjsPatchPlugin() {
  return {
    name: 'epubjs-patch',
    transform(code: string, id: string) {
      if (!id.includes('epubjs')) return null;
      let patched = code;

      // Fix 1: Navigation.load(json) — guard against non-array json
      patched = patched.replace(
        /load\(json\)\s*\{\s*return json\.map\(/,
        'load(json) { return (Array.isArray(json) ? json : []).map(',
      );

      // Fix 2: qsa fallback — guard against missing getElementsByTagName
      patched = patched.replace(
        /return el\.getElementsByTagName\(sel\);\s*\}/,
        'return typeof el.getElementsByTagName === "function" ? el.getElementsByTagName(sel) : []; }',
      );

      // Fix 3: qs fallback — guard against missing getElementsByTagName
      patched = patched.replace(
        /elements = el\.getElementsByTagName\(sel\);/,
        'if (typeof el.getElementsByTagName !== "function") return; elements = el.getElementsByTagName(sel);',
      );

      // Fix 4: qsp fallback — guard against missing getElementsByTagName
      patched = patched.replace(
        /q = el\.getElementsByTagName\(sel\);/,
        'if (typeof el.getElementsByTagName !== "function") return; q = el.getElementsByTagName(sel);',
      );

      // Fix 5: injectIdentifier — guard against this.book being undefined after rendition.destroy().
      // rendition.destroy() sets this.book = undefined synchronously but in-flight serialize hooks
      // may still call injectIdentifier, causing "Cannot read properties of undefined (reading 'packaging')".
      patched = patched.replace(
        /injectIdentifier\(doc,\s*section\)\s*\{/,
        'injectIdentifier(doc, section) { if (!this.book || !this.book.packaging) return;',
      );

      if (patched !== code) return { code: patched, map: null };
      return null;
    },
  };
}

export default defineConfig({
  plugins: [react(), epubjsPatchPlugin()],
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
      allow: [path.resolve(__dirname, '../../..'), path.resolve(__dirname, '../../../..')],
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
        model: path.resolve(__dirname, 'model.html'),
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
