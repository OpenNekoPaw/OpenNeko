import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkEngineRetirementBoundary } from '../check-engine-retirement-boundary.mjs';

describe('Engine product retirement boundary', () => {
  it('accepts the Desktop-only production tree', async () => {
    assert.deepEqual(await checkEngineRetirementBoundary(undefined, async () => []), {
      productionFileCount: 0,
      prohibitedSurfaceCount: 5,
    });
  });

  it('rejects production imports of the retired Engine client', async () => {
    const files = new Map([
      [
        'packages/preview/webview/src/preview.ts',
        "import { EngineClient } from '@neko/neko-client';",
      ],
    ]);

    await assert.rejects(
      checkEngineRetirementBoundary(
        (file) => Promise.resolve(files.get(file)),
        async () => [...files.keys()],
      ),
      /preview\.ts: @neko\/neko-client import/u,
    );
  });

  it('rejects retired Engine commands in Desktop production code', async () => {
    const files = new Map([
      ['apps/neko-desktop/src/main/media.ts', "const command = 'neko.engine.probeInternal';"],
    ]);

    await assert.rejects(
      checkEngineRetirementBoundary(
        (file) => Promise.resolve(files.get(file)),
        async () => [...files.keys()],
      ),
      /media\.ts: retired Engine command/u,
    );
  });
});
