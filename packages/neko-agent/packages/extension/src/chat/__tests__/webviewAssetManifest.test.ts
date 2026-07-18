import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readAgentWebviewAssetPaths } from '../webviewAssetManifest';

describe('Agent Webview asset manifest', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('resolves existing content-addressed entry assets', () => {
    const root = createBuild({
      'index.html': {
        file: 'assets/assistant-scriptHash.js',
        isEntry: true,
      },
      'style.css': {
        file: 'assets/assistant-style-styleHash.css',
      },
    });

    expect(readAgentWebviewAssetPaths(root)).toEqual({
      script: 'assets/assistant-scriptHash.js',
      style: 'assets/assistant-style-styleHash.css',
    });
  });

  it('rejects fixed-path assets instead of falling back to a stale bundle', () => {
    const root = createBuild({
      'index.html': { file: 'assets/assistant.js', isEntry: true },
      'style.css': { file: 'assets/assistant-style.css' },
    });

    expect(() => readAgentWebviewAssetPaths(root)).toThrow(
      'must use a content-addressed asset path',
    );
  });

  it('fails visibly when the manifest points to a missing build asset', () => {
    const root = createBuild(
      {
        'index.html': {
          file: 'assets/assistant-missingHash.js',
          isEntry: true,
        },
        'style.css': {
          file: 'assets/assistant-style-styleHash.css',
        },
      },
      ['assets/assistant-style-styleHash.css'],
    );

    expect(() => readAgentWebviewAssetPaths(root)).toThrow(
      'Agent Webview build asset is missing: assets/assistant-missingHash.js.',
    );
  });

  function createBuild(
    manifest: Readonly<Record<string, unknown>>,
    assets = Object.values(manifest).flatMap((entry) =>
      isManifestEntry(entry) ? [entry.file] : [],
    ),
  ): string {
    const root = mkdtempSync(path.join(tmpdir(), 'neko-agent-webview-manifest-'));
    roots.push(root);
    const dist = path.join(root, 'dist', 'webview');
    mkdirSync(path.join(dist, 'assets'), { recursive: true });
    writeFileSync(path.join(dist, 'asset-manifest.json'), JSON.stringify(manifest));
    for (const asset of assets) {
      writeFileSync(path.join(dist, asset), 'fixture');
    }
    return root;
  }
});

function isManifestEntry(value: unknown): value is { readonly file: string } {
  return (
    typeof value === 'object' && value !== null && 'file' in value && typeof value.file === 'string'
  );
}
