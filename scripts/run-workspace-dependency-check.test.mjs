import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  discoverDependencyRoots,
  inspectWorkspaceDependencies,
} from './run-workspace-dependency-check.mjs';

describe('workspace dependency source discovery', () => {
  it('includes every catalog package with a source root and skips content-only packages', async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-dependency-roots-'));
    t.after(() => rm(root, { recursive: true, force: true }));
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

  it('scans real TypeScript dependencies, reports cycles, and rejects unscanned roots', async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-dependency-scan-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(path.join(root, 'src'));
    await writeFile(
      path.join(root, '.dependency-cruiser.cjs'),
      'module.exports = { forbidden: [{ name: "no-circular", severity: "error", from: {}, to: { circular: true } }] };',
    );
    await writeFile(path.join(root, 'src/a.ts'), "import { b } from './b'; export const a = b;");
    await writeFile(path.join(root, 'src/b.ts'), 'export const b: number = 1;');
    const valid = inspectWorkspaceDependencies(['src'], root);
    assert.equal(valid.status, 'passed');
    assert.equal(valid.summary.totalCruised, 2);
    await writeFile(path.join(root, 'src/b.ts'), "import { a } from './a'; export const b = a;");
    const invalid = inspectWorkspaceDependencies(['src'], root);
    assert.equal(invalid.status, 'failed');
    assert.ok(
      invalid.summary.violations.some((violation) => violation.rule.name === 'no-circular'),
    );
    await mkdir(path.join(root, 'empty'));
    assert.throws(
      () => inspectWorkspaceDependencies(['src', 'empty'], root),
      /did not inspect empty/u,
    );
  });
});
