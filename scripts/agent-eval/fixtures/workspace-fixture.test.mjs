import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { computeFixtureDigest, prepareWorkspaceFixture } from './workspace-fixture.mjs';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe('Agent Evaluation workspace fixtures', () => {
  it('computes a deterministic relative-path and content digest', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'neko-agent-eval-fixture-hash-'));
    temporaryDirectories.push(root);
    await fs.mkdir(join(root, 'nested'));
    await fs.writeFile(join(root, 'b.txt'), 'two');
    await fs.writeFile(join(root, 'nested', 'a.txt'), 'one');
    const first = await computeFixtureDigest(root);
    const second = await computeFixtureDigest(root);
    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(second).toBe(first);
    await fs.writeFile(join(root, 'nested', 'a.txt'), 'changed');
    await expect(computeFixtureDigest(root)).resolves.not.toBe(first);
  });

  it('copies each run into an isolated workspace and cleans it explicitly', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'neko-agent-eval-fixture-source-'));
    temporaryDirectories.push(root);
    await fs.mkdir(join(root, 'fixtures', 'sample'), { recursive: true });
    await fs.writeFile(join(root, 'fixtures', 'sample', 'marker.txt'), 'source');
    const digest = await computeFixtureDigest(join(root, 'fixtures', 'sample'));
    const prepared = await prepareWorkspaceFixture(
      { id: 'sample', root: 'fixtures/sample', digest },
      { agentEvalRoot: root },
    );
    await expect(fs.readFile(join(prepared.workspace, 'marker.txt'), 'utf8')).resolves.toBe('source');
    await fs.writeFile(join(prepared.workspace, 'marker.txt'), 'mutated');
    await expect(fs.readFile(join(root, 'fixtures', 'sample', 'marker.txt'), 'utf8')).resolves.toBe('source');
    await prepared.cleanup();
    await expect(fs.stat(prepared.workspace)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects digest drift and symlink fixtures', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'neko-agent-eval-fixture-reject-'));
    temporaryDirectories.push(root);
    await fs.mkdir(join(root, 'fixtures', 'sample'), { recursive: true });
    await fs.writeFile(join(root, 'fixtures', 'sample', 'marker.txt'), 'source');
    await expect(
      prepareWorkspaceFixture(
        { id: 'sample', root: 'fixtures/sample', digest: `sha256:${'0'.repeat(64)}` },
        { agentEvalRoot: root },
      ),
    ).rejects.toThrow('digest mismatch');
    await fs.symlink(join(root, 'fixtures', 'sample', 'marker.txt'), join(root, 'fixtures', 'sample', 'link'));
    await expect(computeFixtureDigest(join(root, 'fixtures', 'sample'))).rejects.toThrow(
      'fixture contains a symlink',
    );
  });
});
