import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  assertOpenNekoPayloadClosure,
  createComposedManifest,
  parseOpenNekoPackageArgs,
  resolveHostTarget,
} from '../package-openneko-platform.mjs';

const nekoCutManifest = JSON.parse(
  readFileSync(new URL('../../packages/neko-cut/package.json', import.meta.url), 'utf8'),
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

  it('builds the Cut Webview before copying its release payload', () => {
    assert.equal(nekoCutManifest.scripts['vscode:prepublish'], 'pnpm run compile');
    assert.equal(
      nekoCutManifest.scripts['compile:webview'],
      'cd packages/webview && pnpm run build',
    );
    assert.match(nekoCutManifest.scripts.compile, /compile:webview.*copy:webview/u);
  });
});
