import react from '@vitejs/plugin-react';
import { createEpubJsPatchPlugin } from '@neko/preview-webview/epubjs-vite-patch-plugin';
import { defineConfig } from 'vite';
import path from 'node:path';
import { DESKTOP_VITE_CSP_NONCE } from './src/shared/vite-development-security';

const functionalFixtureHome = process.env['OPENNEKO_DESKTOP_FUNCTIONAL_HOME'];

export default defineConfig({
  plugins: [react(), createEpubJsPatchPlugin()],
  ...(functionalFixtureHome
    ? { cacheDir: path.join(functionalFixtureHome, 'vite-renderer-cache') }
    : {}),
  html: {
    cspNonce: DESKTOP_VITE_CSP_NONCE,
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'zustand', 'use-sync-external-store'],
    alias: [
      {
        find: /^@neko-canvas\/webview\/root$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../../packages/neko-canvas-webview/src/root.tsx',
        ),
      },
      {
        find: /^@neko\/webview\/root$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../../packages/neko-cut-webview/src/root.tsx',
        ),
      },
      {
        find: /^@neko\/preview-webview\/root$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../../packages/neko-preview-webview/src/root/index.tsx',
        ),
      },
      {
        find: /^neko-assets\/resource-browser\/root$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../../packages/neko-assets/src/resource-browser/root.tsx',
        ),
      },
      {
        find: /^neko-assets\/resource-browser\/contract$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../../packages/neko-assets/src/resource-browser/contract.ts',
        ),
      },
      {
        find: /^neko-assets\/global-library\/root$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../../packages/neko-assets/src/global-library/root.tsx',
        ),
      },
      {
        find: /^@neko-agent\/webview\/root$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../../packages/neko-agent-webview/src/root.tsx',
        ),
      },
      {
        find: /^@neko-agent\/types$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../../packages/neko-agent-types/src/index.ts',
        ),
      },
      {
        find: /^@neko-agent\/types\//,
        replacement: `${path.resolve(import.meta.dirname, '../../packages/neko-agent-types/src')}/`,
      },
      {
        find: /^@neko\/shared$/,
        replacement: path.resolve(import.meta.dirname, '../../packages/neko-types/src/index.ts'),
      },
      {
        find: /^@neko\/shared\//,
        replacement: `${path.resolve(import.meta.dirname, '../../packages/neko-types/src')}/`,
      },
      {
        find: /^@\//,
        replacement: `${path.resolve(
          import.meta.dirname,
          '../../packages/neko-agent-webview/src',
        )}/`,
      },
    ],
  },
  optimizeDeps: {
    exclude: [
      '@neko-canvas/domain',
      '@neko-canvas/webview/root',
      '@neko/media',
      '@neko/media/browser',
      '@neko/preview-webview/root',
      '@neko/webview/root',
    ],
    include: [
      '@zip.js/zip.js',
      '@neko/ui/creative',
      '@neko/ui/hooks',
      '@neko/ui/icons',
      '@neko/ui/keyboard',
      '@neko/ui/markdown',
      '@neko/ui/primitives',
      '@neko/ui/workbench',
      'clsx',
      'docx-preview',
      'epubjs',
      'pdfjs-dist',
      'three',
      'three/addons/controls/DragControls.js',
      'three/addons/controls/OrbitControls.js',
      'three/addons/controls/TransformControls.js',
      'three/addons/loaders/EXRLoader.js',
      'three/addons/loaders/GLTFLoader.js',
      'three/addons/loaders/MTLLoader.js',
      'three/addons/loaders/OBJLoader.js',
      'three/addons/loaders/PLYLoader.js',
      'three/addons/loaders/RGBELoader.js',
      'three/addons/loaders/STLLoader.js',
      'zustand',
      'zustand/vanilla',
      'use-sync-external-store/shim/with-selector.js',
    ],
  },
  build: {
    sourcemap: true,
  },
});
