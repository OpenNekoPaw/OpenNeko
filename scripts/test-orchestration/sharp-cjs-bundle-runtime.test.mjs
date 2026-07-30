import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { build } from 'esbuild';

import { stageSharpRuntime } from '../stage-sharp-runtime.mjs';

const require = createRequire(import.meta.url);
const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('Sharp CommonJS bundle runtime', () => {
  it('keeps Sharp external in every owning bundle and executes from its staged closure', async () => {
    const desktopMainConfig = await readFile('apps/neko-desktop/vite.main.config.ts', 'utf8');
    assert.match(desktopMainConfig, /external:\s*\[['"]electron['"], ['"]sharp['"]\]/u);

    const root = await mkdtemp(join(tmpdir(), 'openneko-sharp-cjs-bundle-'));
    temporaryRoots.push(root);
    const outputRoot = join(root, 'dist');
    const bundlePath = join(outputRoot, 'extension.cjs');
    const transportPath = resolve(
      'packages/neko-ai-sdk/src/image-batch-transport.ts',
    );
    await build({
      stdin: {
        contents: `export { composeProviderImageBatches } from ${JSON.stringify(transportPath)};`,
        resolveDir: process.cwd(),
        sourcefile: 'sharp-contact-sheet-entry.ts',
      },
      bundle: true,
      external: ['sharp'],
      format: 'cjs',
      outfile: bundlePath,
      platform: 'node',
    });
    stageSharpRuntime({ outputRoot });

    const runtime = require(bundlePath);
    const sourceBytes = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#fff"/></svg>',
    );
    const results = await runtime.composeProviderImageBatches(
      [
        { assetId: 'page-1', bytes: sourceBytes, mimeType: 'image/svg+xml' },
        { assetId: 'page-2', bytes: sourceBytes, mimeType: 'image/svg+xml' },
      ],
      'overview',
    );

    assert.equal(results.length, 1);
    assert.equal(results[0].mimeType, 'image/jpeg');
    assert.deepEqual(results[0].sourceIndexes, [0, 1]);
    assert.deepEqual([...results[0].bytes.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  });
});
