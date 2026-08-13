import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { checkCanvasPlaybackBoundary } from '../check-canvas-playback-boundary.mjs';

const files = {
  'apps/neko-desktop/src/renderer/desktop-canvas-host-runtime.ts':
    'const bridge = window.openNekoDesktop.canvas;\n',
  'packages/canvas/webview/src/components/playback/PlaybackWorkspace.tsx':
    'const playback = usePlaybackStore();\n',
  'packages/canvas/webview/src/preview/PreviewRendererRegistry.tsx':
    "const preview = <LightweightPreview />;\npostMessage({ type: 'preview:resolveResource' });\n",
  'apps/neko-desktop/src/shared/canvas-bridge-contract.ts': 'export const bridge = {};\n',
  'packages/canvas/webview/src/host-runtime/canvas-webview-host.ts':
    'switch (message.type) { default: throw new Error("unsupported"); }\n',
};

test('accepts the canonical dynamic Canvas public-root import', async () => {
  await withFixture(
    "const root = await import('@neko/canvas-webview/root');\ncreateElectronCanvasHostRuntime(identity);\n",
    async (root) => {
      assert.deepEqual(await checkCanvasPlaybackBoundary(root), { status: 'passed', findings: [] });
    },
  );
});

test('rejects comment and similarly named package lookalikes', async () => {
  await withFixture(
    "// import('@neko/canvas-webview/root')\nconst root = \"from '@neko/canvas-webview/root'\";\ncreateElectronCanvasHostRuntime(identity);\n",
    async (root) => {
      const result = await checkCanvasPlaybackBoundary(root);
      assert.equal(result.status, 'failed');
      assert.match(result.findings[0] ?? '', /public Canvas Webview root/u);
    },
  );
});

test('rejects a Desktop-owned media contract and wildcard Webview delegation', async () => {
  await withFixture(
    "const root = await import('@neko/canvas-webview/root');\ncreateElectronCanvasHostRuntime(identity);\n",
    async (root) => {
      await writeFixture(
        root,
        'apps/neko-desktop/src/shared/canvas-bridge-contract.ts',
        'export type DesktopCanvasMediaRequest = {};\n',
      );
      await writeFixture(
        root,
        'packages/canvas/webview/src/host-runtime/canvas-webview-host.ts',
        'switch (message.type) { default: delegate.postMessage(value); }\n',
      );
      const result = await checkCanvasPlaybackBoundary(root);
      assert.equal(result.status, 'failed');
      assert.ok(
        result.findings.some((finding) => /package-local Canvas media contract/u.test(finding)),
      );
      assert.ok(result.findings.some((finding) => /must not delegate unknown/u.test(finding)));
    },
  );
});

test('rejects a Canvas-local media player path', async () => {
  await withFixture(
    "const root = await import('@neko/canvas-webview/root');\ncreateElectronCanvasHostRuntime(identity);\n",
    async (root) => {
      await writeFixture(
        root,
        'packages/canvas/webview/src/preview/PreviewRendererRegistry.tsx',
        "const preview = <InlineVideoPlayer />;\npostMessage({ type: 'media:prepare' });\n",
      );
      const result = await checkCanvasPlaybackBoundary(root);
      assert.equal(result.status, 'failed');
      assert.ok(result.findings.some((finding) => /shared Preview viewer/u.test(finding)));
      assert.ok(result.findings.some((finding) => /parallel media player/u.test(finding)));
    },
  );
});

async function withFixture(surface, run) {
  const root = await mkdtemp(join(tmpdir(), 'openneko-canvas-boundary-'));
  try {
    const sources = {
      ...files,
      'apps/neko-desktop/src/renderer/DesktopCanvasSurface.tsx': surface,
    };
    for (const [relativePath, source] of Object.entries(sources)) {
      await writeFixture(root, relativePath, source);
    }
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeFixture(root, relativePath, source) {
  const absolutePath = join(root, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, source);
}
