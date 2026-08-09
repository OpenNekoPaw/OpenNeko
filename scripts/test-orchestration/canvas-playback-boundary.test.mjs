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

async function withFixture(surface, run) {
  const root = await mkdtemp(join(tmpdir(), 'openneko-canvas-boundary-'));
  try {
    const sources = {
      ...files,
      'apps/neko-desktop/src/renderer/DesktopCanvasSurface.tsx': surface,
    };
    for (const [relativePath, source] of Object.entries(sources)) {
      const absolutePath = join(root, relativePath);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, source);
    }
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
