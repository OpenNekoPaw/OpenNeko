import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

export function createSandboxPreloadBoundaryPlugin(
  readBundle: () => string = () =>
    readFileSync(path.resolve(import.meta.dirname, '.vite/build/preload.cjs'), 'utf8'),
): Plugin {
  return {
    name: 'openneko:desktop:sandbox-preload-boundary',
    closeBundle() {
      assertSandboxPreloadBundle(readBundle());
    },
  };
}

export function assertSandboxPreloadBundle(bundle: string): void {
  const nodeBuiltin = bundle.match(/require\(["']node:[^"']+["']\)/u)?.[0];
  if (nodeBuiltin) {
    throw new Error(
      `Desktop sandbox preload bundle contains unsupported Node builtin ${nodeBuiltin}.`,
    );
  }
}

export default defineConfig({
  plugins: [createSandboxPreloadBoundaryPlugin()],
  build: {
    sourcemap: true,
    rollupOptions: {
      external: ['electron'],
      output: {
        entryFileNames: 'preload.cjs',
      },
    },
  },
});
