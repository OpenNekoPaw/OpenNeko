import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  assertEmbeddedNativeClosure,
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
      parseOpenNekoPackageArgs([
        '--target',
        'linux-x64',
        '--engine-vsix',
        'packages/neko-engine/engine.vsix',
      ]),
      {
        target: 'linux-x64',
        engineVsix: 'packages/neko-engine/engine.vsix',
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

  it('accepts only one target binding plus FFmpeg runtime libraries', () => {
    assert.deepEqual(
      assertEmbeddedNativeClosure(
        [
          '/payload/neko-engine.darwin-arm64.node',
          '/payload/libavcodec.dylib',
          '/payload/libavformat.dylib',
        ],
        'darwin-arm64',
      ),
      {
        nativeFile: '/payload/neko-engine.darwin-arm64.node',
        runtimeLibraryCount: 2,
      },
    );
    assert.deepEqual(
      assertEmbeddedNativeClosure(
        [
          '/payload/neko-engine.linux-x64-gnu.node',
          '/payload/libavcodec.so.62',
          '/payload/libavformat.so.62',
        ],
        'linux-x64',
      ),
      {
        nativeFile: '/payload/neko-engine.linux-x64-gnu.node',
        runtimeLibraryCount: 2,
      },
    );
    assert.throws(
      () =>
        assertEmbeddedNativeClosure(
          [
            '/payload/neko-engine.darwin-arm64.node',
            '/payload/neko-engine.linux-x64.node',
            '/payload/libavcodec.dylib',
          ],
          'darwin-arm64',
        ),
      /native closure must contain only/u,
    );
    assert.throws(
      () =>
        assertEmbeddedNativeClosure(
          ['/payload/neko-engine.linux-x64.node', '/payload/libavcodec.so.62'],
          'linux-x64',
        ),
      /neko-engine\.linux-x64-gnu\.node/u,
    );
    assert.throws(
      () =>
        assertEmbeddedNativeClosure(
          [
            '/payload/packages/host-napi/neko-engine.linux-x64-gnu.node',
            '/payload/packages/host-napi/libavcodec.so.62',
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
