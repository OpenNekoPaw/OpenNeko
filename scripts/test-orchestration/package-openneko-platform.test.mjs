import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  assertOpenNekoPayloadClosure,
  createComposedManifest,
  parseOpenNekoPackageArgs,
  resolveHostTarget,
} from '../package-openneko-platform.mjs';

const featureResourceStager = readFileSync(
  new URL('../../apps/neko-vscode/scripts/stage-feature-resources.mjs', import.meta.url),
  'utf8',
);

describe('OpenNeko platform assembler', () => {
  it('parses explicit platform payload arguments', () => {
    assert.deepEqual(
      parseOpenNekoPackageArgs(['--target', 'linux-x64']),
      {
        target: 'linux-x64',
      },
    );
    assert.equal(resolveHostTarget('darwin', 'arm64'), 'darwin-arm64');
    assert.throws(() => resolveHostTarget('darwin', 'x64'), /not a supported/u);
  });

  it('composes a runtime manifest from every retained owner', () => {
    const manifest = createComposedManifest();
    assert.equal(manifest.name, 'neko-suite');
    assert.equal(manifest.main, './dist/extension.js');
    assert.equal(manifest.extensionPack, undefined);
    assert.equal(manifest.dependencies, undefined);
    assert.deepEqual(manifest.files, [
      'dist/**',
      'package.nls.json',
      'package.nls.zh-cn.json',
      'l10n/**',
      'README.md',
      'LICENSE',
    ]);
    assert.ok(manifest.contributes.commands.length > 50);
  });

  it('rejects retired Engine and build-input files from the product payload', () => {
    assert.deepEqual(
      assertOpenNekoPayloadClosure(['/payload/dist/extension.js'], 'darwin-arm64'),
      { fileCount: 1 },
    );
    assert.throws(
      () =>
        assertOpenNekoPayloadClosure(
          ['/payload/dist/features/neko-engine/extension.js'],
          'darwin-arm64',
        ),
      /retired Engine files/u,
    );
    assert.throws(
      () =>
        assertOpenNekoPayloadClosure(
          [
            '/payload/deps/ffmpeg/lib/libavcodec.so.62',
          ],
          'linux-x64',
        ),
      /build-only dependency.*deps\/ffmpeg/u,
    );
  });

  it('builds and stages the Cut Webview without an internal VSIX', () => {
    assert.match(featureResourceStager, /packages\/neko-cut-webview.*run.*build/su);
    assert.match(featureResourceStager, /packages\/neko-cut-webview\/dist/u);
    assert.doesNotMatch(featureResourceStager, /\bvsce\b|\.vsix/u);
  });
});
