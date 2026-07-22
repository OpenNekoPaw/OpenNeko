import { defineConfig } from 'tsup';
import { cp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  clean: true,
  splitting: true,
  removeNodeProtocol: false,
  target: 'node24',
  outDir: 'dist',
  onSuccess: async () => {
    const target = resolve('dist/skills');
    await rm(target, { recursive: true, force: true });
    await cp(resolve('../../packages/neko-skills/skills'), target, { recursive: true });
  },
  noExternal: [
    '@neko-agent/types',
    '@neko-canvas/domain',
    '@neko/agent',
    '@neko/ai-sdk',
    '@neko/content',
    '@neko/entity',
    '@neko/host',
    '@neko/markdown',
    '@neko/platform',
    '@neko/search',
    '@neko/shared',
  ],
  external: ['ink', 'react', 'yoga-wasm-web', 'mermaid', 'ajv', 'bun:sqlite', 'node:sqlite'],
  esbuildOptions(options) {
    options.loader = { ...options.loader, '.md': 'text' };
  },
  banner: {
    js: [
      '#!/usr/bin/env node',
      "import { createRequire as createNekoTuiRequire } from 'node:module';",
      'const require = createNekoTuiRequire(import.meta.url);',
    ].join('\n'),
  },
});
