import assert from 'node:assert/strict';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { discoverDependencyRoots } from './run-workspace-dependency-check.mjs';

describe('workspace dependency source discovery', () => {
  it('includes every catalog package with a source root and skips content-only packages', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-dependency-roots-'));
    await mkdir(path.join(root, 'packages/alpha/src'), { recursive: true });
    await mkdir(path.join(root, 'packages/beta/src'), { recursive: true });
    await mkdir(path.join(root, 'packages/content'), { recursive: true });

    assert.deepEqual(
      await discoverDependencyRoots(
        {
          packages: [
            { path: 'packages/beta' },
            { path: 'packages/content' },
            { path: 'packages/alpha' },
          ],
        },
        root,
      ),
      ['packages/alpha/src', 'packages/beta/src'],
    );
  });
});
