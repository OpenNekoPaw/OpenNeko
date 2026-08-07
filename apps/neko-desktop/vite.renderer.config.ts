import react from '@vitejs/plugin-react';
import { createEpubJsPatchPlugin } from '@neko/preview-webview/epubjs-vite-patch-plugin';
import { defineConfig, type Plugin } from 'vite';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { DESKTOP_VITE_CSP_NONCE } from './src/shared/vite-development-security';

const functionalFixtureHome = process.env['OPENNEKO_DESKTOP_FUNCTIONAL_HOME'];
export const DESKTOP_RENDERER_CANONICAL_WORKSPACE_ENTRIES = Object.freeze([
  '@neko/agent-contracts',
  '@neko/agent-webview/root',
  '@neko/canvas-webview/root',
  '@neko/cut-webview/root',
  '@neko/cut-webview/runtime-bridge',
  '@neko/preview-webview/root',
] as const);

const canonicalWorkspacePublicEntries = new Set<string>(
  DESKTOP_RENDERER_CANONICAL_WORKSPACE_ENTRIES,
);

function createWorkspacePublicEntryCanonicalizationPlugin(): Plugin {
  return {
    name: 'openneko-workspace-public-entry-canonicalization',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!canonicalWorkspacePublicEntries.has(source)) {
        return null;
      }

      const resolved = await this.resolve(source, importer, { skipSelf: true });
      if (!resolved) {
        throw new Error(`Unable to resolve workspace public entry: ${source}`);
      }

      const suffixIndex = resolved.id.search(/[?#]/u);
      const filePath = suffixIndex >= 0 ? resolved.id.slice(0, suffixIndex) : resolved.id;
      const suffix = suffixIndex >= 0 ? resolved.id.slice(suffixIndex) : '';
      return { ...resolved, id: `${realpathSync(filePath)}${suffix}` };
    },
  };
}

export default defineConfig({
  plugins: [createWorkspacePublicEntryCanonicalizationPlugin(), react(), createEpubJsPatchPlugin()],
  ...(functionalFixtureHome
    ? { cacheDir: path.join(functionalFixtureHome, 'vite-renderer-cache') }
    : {}),
  html: {
    cspNonce: DESKTOP_VITE_CSP_NONCE,
  },
  resolve: {
    dedupe: [
      '@neko/agent-contracts',
      '@neko/agent-webview',
      '@neko/assets-webview',
      '@neko/canvas-webview',
      '@neko/cut-webview',
      '@neko/preview-webview',
      '@neko/ui',
      'react',
      'react-dom',
      'zustand',
      'use-sync-external-store',
    ],
  },
  optimizeDeps: {
    exclude: [
      '@neko/agent-contracts',
      '@neko/agent-webview/root',
      '@neko/assets-webview/resource-browser/presentation-snapshot',
      '@neko/assets-webview/resource-browser/root',
      '@neko/assets-domain/asset-center/contract',
      '@neko/assets-domain/asset-center/host-contract',
      '@neko/assets-domain/contracts',
      '@neko/assets-domain/global-library/contract',
      '@neko/assets-domain/resource-browser/contract',
      '@neko/canvas-domain',
      '@neko/canvas-webview/root',
      '@neko/cut-webview/root',
      '@neko/cut-webview/runtime-bridge',
      '@neko/host/application-settings',
      '@neko/host/desktop-scene-contract',
      '@neko/host/desktop-shell-contract',
      '@neko/host/desktop-workbench-contract',
      '@neko/host/desktop-window-composition-contract',
      '@neko/preview-webview/presentation-snapshot',
      '@neko/preview-webview/root',
      '@neko/media',
      '@neko/media/browser',
      '@neko/ui',
      '@neko/ui/creative',
      '@neko/ui/hooks',
      '@neko/ui/icons',
      '@neko/ui/keyboard',
      '@neko/ui/markdown',
      '@neko/ui/primitives',
      '@neko/ui/utils',
      '@neko/ui/workbench',
    ],
    include: [
      '@zip.js/zip.js',
      '@neko/content/project-file-io',
      '@neko/generation',
      '@neko/markdown',
      '@neko/search-domain',
      '@neko/shared',
      '@neko/shared/job-lifecycle',
      '@tanstack/react-virtual',
      'clsx',
      'docx-preview',
      'epubjs',
      'mermaid',
      'pdfjs-dist',
      'prism-react-renderer',
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
