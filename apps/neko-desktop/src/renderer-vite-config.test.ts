import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { describe, expect, it } from 'vitest';
import rendererConfig, {
  canonicalizeWorkspacePublicEntryId,
  DESKTOP_RENDERER_CANONICAL_WORKSPACE_ENTRIES,
  discoverWorkspacePublicEntries,
} from '../vite.renderer.config';

describe('Desktop renderer Vite workspace resolution', () => {
  it('derives exact internal public entries from package manifests', () => {
    expect(DESKTOP_RENDERER_CANONICAL_WORKSPACE_ENTRIES).toContain('@neko/agent-contracts');
    expect(DESKTOP_RENDERER_CANONICAL_WORKSPACE_ENTRIES).toContain('@neko/canvas-domain');
    expect(DESKTOP_RENDERER_CANONICAL_WORKSPACE_ENTRIES).toContain(
      '@neko/canvas-domain/project-file-io',
    );
    expect(DESKTOP_RENDERER_CANONICAL_WORKSPACE_ENTRIES).not.toContain('@neko/canvas-domain/src');
    expect(DESKTOP_RENDERER_CANONICAL_WORKSPACE_ENTRIES).not.toContain('react');
    expect(rendererConfig.resolve?.dedupe).toContain('@neko/agent-contracts');
    expect(rendererConfig.optimizeDeps?.exclude).toEqual([
      ...DESKTOP_RENDERER_CANONICAL_WORKSPACE_ENTRIES,
    ]);
    expect(
      rendererConfig.optimizeDeps?.include?.filter((entry) => entry.startsWith('@neko/')),
    ).toEqual([]);
    expect(rendererConfig.optimizeDeps?.include).toContain('@tanstack/react-virtual');
    expect(rendererConfig.optimizeDeps?.include).toContain('zustand');
  });

  it('does not manufacture undeclared package subpaths', () => {
    const packagesRoot = mkdtempSync(path.join(tmpdir(), 'openneko-vite-manifests-'));
    const packageRoot = path.join(packagesRoot, 'example');
    mkdirSync(packageRoot);
    writeFileSync(
      path.join(packageRoot, 'package.json'),
      JSON.stringify({
        name: '@neko/example',
        exports: {
          '.': './src/index.ts',
          './public': './src/public.ts',
        },
      }),
    );

    expect(discoverWorkspacePublicEntries(packagesRoot)).toEqual([
      '@neko/example',
      '@neko/example/public',
    ]);
  });

  it('collapses a consumer-local workspace symlink to one canonical source identity', () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'openneko-vite-realpath-'));
    const packageRoot = path.join(fixtureRoot, 'packages', 'domain');
    const consumerDependencyRoot = path.join(
      fixtureRoot,
      'packages',
      'webview',
      'node_modules',
      '@neko',
      'domain',
    );
    mkdirSync(path.join(packageRoot, 'src'), { recursive: true });
    mkdirSync(path.dirname(consumerDependencyRoot), { recursive: true });
    writeFileSync(path.join(packageRoot, 'src', 'index.ts'), 'export const value = true;\n');
    symlinkSync(packageRoot, consumerDependencyRoot, 'dir');

    const symlinkEntry = path.join(consumerDependencyRoot, 'src', 'index.ts');
    expect(
      canonicalizeWorkspacePublicEntryId(`${symlinkEntry}?raw&v=stale-browser-hash#entry`),
    ).toBe(`${realpathSync(path.join(packageRoot, 'src', 'index.ts'))}?raw#entry`);
    expect(canonicalizeWorkspacePublicEntryId(`${symlinkEntry}?v=stale-browser-hash`)).toBe(
      realpathSync(path.join(packageRoot, 'src', 'index.ts')),
    );
  });

  it('keeps live Canvas source out of immutable dependency URLs', async () => {
    const desktopRoot = path.resolve(import.meta.dirname, '..');
    const repositoryRoot = path.resolve(desktopRoot, '../..');
    const cacheDir = mkdtempSync(path.join(tmpdir(), 'openneko-vite-cache-'));
    const server = await createServer({
      cacheDir,
      configFile: false,
      logLevel: 'silent',
      optimizeDeps: {
        exclude: ['@neko/canvas-domain'],
        holdUntilCrawlEnd: false,
        include: ['react'],
        noDiscovery: true,
      },
      plugins: rendererConfig.plugins,
      resolve: rendererConfig.resolve,
      root: desktopRoot,
      server: { middlewareMode: true },
    });

    try {
      const toolbarPath = path.join(
        repositoryRoot,
        'packages/canvas/webview/src/components/selection/SelectionContextToolbar.tsx',
      );
      const result = await server.transformRequest(`/@fs/${toolbarPath}`);
      if (!result) throw new Error('Vite did not transform the Canvas selection toolbar fixture.');

      expect(result.code).toContain('/packages/canvas/domain/src/index.ts');
      expect(result.code).not.toMatch(/canvas\/domain\/src\/index\.ts\?v=/u);
      expect(result.code).not.toContain('node_modules/@neko/canvas-domain');
      expect(result.code).toMatch(/\/deps\/react\.js\?v=/u);
    } finally {
      await server.close();
      rmSync(cacheDir, { force: true, recursive: true });
    }
  }, 30_000);
});
