import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareFixture } from './fixture.mjs';

describe('webview functional fixtures', () => {
  it('copies the fixture into an isolated mutable workspace', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'neko-functional-fixture-owner-'));
    const debugWorkspace = join(repoRoot, 'debug-workspace');
    const sourceRoot = join(repoRoot, 'fixture');
    await Promise.all([mkdir(sourceRoot), mkdir(debugWorkspace)]);
    await writeFile(join(sourceRoot, 'notes.md'), 'original\n');

    const prepared = await prepareFixture(repoRoot, {
      workspace: 'fixture',
      digestFiles: ['notes.md'],
    }, { workspaceRoot: debugWorkspace });
    try {
      await writeFile(join(prepared.fixtureRoot, 'notes.md'), 'changed\n');
      assert.equal(await readFile(join(sourceRoot, 'notes.md'), 'utf8'), 'original\n');
      const realWorkspace = await realpath(debugWorkspace);
      assert.equal(prepared.runRoot.startsWith(join(realWorkspace, '.neko', '.functional')), true);
      assert.match(prepared.digest, /^sha256:/u);
    } finally {
      await rm(prepared.runRoot, { recursive: true, force: true });
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
