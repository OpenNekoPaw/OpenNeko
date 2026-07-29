import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'node:path';
import { DESKTOP_VITE_CSP_NONCE } from './src/shared/vite-development-security';
import { createEpubJsPatchPlugin } from '../../packages/neko-preview/packages/webview/epubjs-vite-patch-plugin';

export default defineConfig({
  plugins: [react(), createEpubJsPatchPlugin()],
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
          '../../packages/neko-canvas/packages/webview/src/root.tsx',
        ),
      },
      {
        find: /^@neko\/webview\/root$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../../packages/neko-cut/packages/webview/src/root.tsx',
        ),
      },
      {
        find: /^@neko\/preview-webview\/root$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../../packages/neko-preview/packages/webview/src/root/index.tsx',
        ),
      },
      {
        find: /^@neko-agent\/webview\/root$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../../packages/neko-agent/packages/webview/src/root.tsx',
        ),
      },
      {
        find: /^@neko-agent\/types$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../../packages/neko-agent/packages/agent-types/src/index.ts',
        ),
      },
      {
        find: /^@neko-agent\/types\//,
        replacement: `${path.resolve(
          import.meta.dirname,
          '../../packages/neko-agent/packages/agent-types/src',
        )}/`,
      },
      {
        find: /^@neko\/shared$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../../packages/neko-types/src/index.ts',
        ),
      },
      {
        find: /^@neko\/shared\//,
        replacement: `${path.resolve(
          import.meta.dirname,
          '../../packages/neko-types/src',
        )}/`,
      },
      {
        find: /^@\//,
        replacement: `${path.resolve(
          import.meta.dirname,
          '../../packages/neko-agent/packages/webview/src',
        )}/`,
      },
    ],
  },
  optimizeDeps: {
    exclude: [
      '@neko-canvas/webview/root',
      '@neko/preview-webview/root',
      '@neko/webview/root',
    ],
    include: [
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
