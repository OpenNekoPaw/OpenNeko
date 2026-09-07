import react from '@vitejs/plugin-react';
import { createEpubJsPatchPlugin } from '@neko/preview-webview/epubjs-vite-patch-plugin';
import { defineConfig, type Plugin } from 'vite';
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { DESKTOP_RENDERER_CSP_NONCE } from './src/shared/vite-development-security';

const workspacePackagesRoot = path.resolve(import.meta.dirname, '../../packages');
export const DESKTOP_RENDERER_CANONICAL_WORKSPACE_ENTRIES =
  discoverWorkspacePublicEntries(workspacePackagesRoot);

const canonicalWorkspacePublicEntries = new Set<string>(
  DESKTOP_RENDERER_CANONICAL_WORKSPACE_ENTRIES,
);

export function discoverWorkspacePublicEntries(packagesRoot: string): readonly string[] {
  const entries = new Set<string>();

  for (const manifestPath of findWorkspacePackageManifests(packagesRoot)) {
    const manifest = parseWorkspacePackageManifest(manifestPath);
    for (const exportKey of manifest.exportKeys) {
      const publicEntry =
        exportKey === '.' ? manifest.name : `${manifest.name}/${exportKey.slice(2)}`;
      if (entries.has(publicEntry)) {
        throw new Error(`Duplicate workspace public entry '${publicEntry}'.`);
      }
      entries.add(publicEntry);
    }
  }

  return Object.freeze([...entries].sort());
}

export function canonicalizeWorkspacePublicEntryId(resolvedId: string): string {
  const suffixIndex = resolvedId.search(/[?#]/u);
  const filePath = suffixIndex >= 0 ? resolvedId.slice(0, suffixIndex) : resolvedId;
  const suffix = suffixIndex >= 0 ? resolvedId.slice(suffixIndex) : '';
  return `${realpathSync(filePath)}${removeDependencyVersionQuery(suffix)}`;
}

function removeDependencyVersionQuery(suffix: string): string {
  const hashIndex = suffix.indexOf('#');
  const hash = hashIndex >= 0 ? suffix.slice(hashIndex) : '';
  const search = hashIndex >= 0 ? suffix.slice(0, hashIndex) : suffix;
  if (!search.startsWith('?')) return suffix;

  const parameters = search
    .slice(1)
    .split('&')
    .filter((parameter) => !parameter.startsWith('v='));
  return `${parameters.length > 0 ? `?${parameters.join('&')}` : ''}${hash}`;
}

export function createWorkspacePublicEntryCanonicalizationPlugin(): Plugin {
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

      return { ...resolved, id: canonicalizeWorkspacePublicEntryId(resolved.id) };
    },
  };
}

function findWorkspacePackageManifests(directory: string): readonly string[] {
  const manifests: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      manifests.push(...findWorkspacePackageManifests(entryPath));
    } else if (entry.isFile() && entry.name === 'package.json') {
      manifests.push(entryPath);
    }
  }
  return manifests.sort();
}

function parseWorkspacePackageManifest(manifestPath: string): {
  readonly name: string;
  readonly exportKeys: readonly string[];
} {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    readonly name?: unknown;
    readonly exports?: unknown;
  };
  if (typeof manifest.name !== 'string' || !manifest.name.startsWith('@neko/')) {
    throw new Error(`Workspace package manifest '${manifestPath}' has no canonical @neko name.`);
  }
  if (manifest.exports === undefined) {
    return { name: manifest.name, exportKeys: [] };
  }
  if (typeof manifest.exports === 'string') {
    return { name: manifest.name, exportKeys: ['.'] };
  }
  if (
    manifest.exports === null ||
    Array.isArray(manifest.exports) ||
    typeof manifest.exports !== 'object'
  ) {
    throw new Error(`Workspace package manifest '${manifestPath}' has invalid exports.`);
  }
  const exportKeys = Object.keys(manifest.exports);
  const invalidKey = exportKeys.find((key) => key !== '.' && !key.startsWith('./'));
  if (invalidKey) {
    throw new Error(
      `Workspace package manifest '${manifestPath}' has non-public export key '${invalidKey}'.`,
    );
  }
  return { name: manifest.name, exportKeys: exportKeys.sort() };
}

export default defineConfig({
  plugins: [createWorkspacePublicEntryCanonicalizationPlugin(), react(), createEpubJsPatchPlugin()],
  html: {
    cspNonce: DESKTOP_RENDERER_CSP_NONCE,
  },
  resolve: {
    dedupe: [
      '@neko/agent-contracts',
      '@neko/agent-webview',
      '@neko/assets-webview',
      '@neko/canvas-webview',
      '@neko/chara-webview',
      '@neko/cut-webview',
      '@neko/model-webview',
      '@neko/preview-webview',
      '@neko/text-editor-webview',
      '@neko/ui',
      '@codemirror/autocomplete',
      '@codemirror/commands',
      '@codemirror/language',
      '@codemirror/state',
      '@codemirror/view',
      'react',
      'react-dom',
      'zustand',
      'use-sync-external-store',
    ],
  },
  optimizeDeps: {
    exclude: [...DESKTOP_RENDERER_CANONICAL_WORKSPACE_ENTRIES],
    include: [
      '@codemirror/autocomplete',
      '@codemirror/commands',
      '@codemirror/lang-css',
      '@codemirror/lang-html',
      '@codemirror/lang-javascript',
      '@codemirror/lang-json',
      '@codemirror/lang-markdown',
      '@codemirror/lang-xml',
      '@codemirror/lang-yaml',
      '@codemirror/language',
      '@codemirror/state',
      '@codemirror/view',
      '@milkdown/core',
      '@milkdown/preset-commonmark',
      '@milkdown/preset-gfm',
      '@milkdown/prose/history',
      '@milkdown/prose/keymap',
      '@milkdown/prose/state',
      '@lezer/highlight',
      '@zip.js/zip.js',
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
