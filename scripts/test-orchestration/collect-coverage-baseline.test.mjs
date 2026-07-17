import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { collectCoverageBaseline } from './collect-coverage-baseline.mjs';

const cleanupPaths = [];

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('coverage baseline collection', () => {
  it('records owner metrics and never-imported production files', async () => {
    const root = await createFixture();
    const baseline = await collectCoverageBaseline({
      repoRoot: root,
      generatedAt: '2026-07-13T00:00:00.000Z',
    });

    assert.equal(baseline.ownerCount, 1);
    assert.equal(baseline.ownersBelowDefault, 1);
    assert.equal(baseline.zeroCoveredSourceFileCount, 1);
    assert.deepEqual(baseline.owners[0].belowDefault, ['lines', 'functions', 'statements']);
    assert.deepEqual(baseline.owners[0].zeroCoveredSourceFiles, ['packages/example/src/unused.ts']);
  });

  it('fails visibly when a canonical owner has no summary', async () => {
    const root = await createFixture({ writeSummary: false });
    await assert.rejects(
      collectCoverageBaseline({ repoRoot: root }),
      /Coverage summary is missing or invalid for packages\/example/u,
    );
  });
});

async function createFixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'neko-coverage-baseline-'));
  cleanupPaths.push(root);
  await mkdir(join(root, 'quality'), { recursive: true });
  await mkdir(join(root, 'packages/example/coverage'), { recursive: true });
  await writeFile(
    join(root, 'quality/test-ownership.json'),
    JSON.stringify({
      schemaVersion: 'neko.test-ownership.v1',
      workspaces: [
        {
          path: 'packages/example',
          owner: 'packages/example',
          mode: 'self',
        },
      ],
    }),
  );
  if (options.writeSummary !== false) {
    await writeFile(
      join(root, 'packages/example/coverage/coverage-summary.json'),
      JSON.stringify({
        total: {
          lines: { pct: 12 },
          branches: { pct: 22 },
          functions: { pct: 14 },
          statements: { pct: 10 },
        },
        [join(root, 'packages/example/src/unused.ts')]: {
          lines: { total: 8, covered: 0 },
        },
      }),
    );
  }
  return root;
}
