import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import {
  fingerprintBuildRecipe,
  fingerprintGitRevision,
  hashFile,
  prepareIsolatedBuildTarget,
} from './isolated-build-target.mjs';

const exec = promisify(execFile);
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

async function repository() {
  const root = await fs.mkdtemp(join(os.tmpdir(), 'neko-isolated-build-repo-'));
  temporaryDirectories.push(root);
  await exec('git', ['init', '-q'], { cwd: root });
  await exec('git', ['config', 'user.email', 'eval@example.invalid'], { cwd: root });
  await exec('git', ['config', 'user.name', 'Evaluation'], { cwd: root });
  await fs.writeFile(join(root, 'source.txt'), 'base\n');
  await exec('git', ['add', 'source.txt'], { cwd: root });
  await exec('git', ['commit', '-qm', 'base'], { cwd: root });
  const { stdout } = await exec('git', ['rev-parse', 'HEAD'], { cwd: root });
  const revision = stdout.trim();
  return { root, revision };
}

function target(revision, overrides = {}) {
  const value = {
    sourceRevision: revision,
    sourceFingerprint: fingerprintGitRevision(revision),
    buildRecipeFingerprint: `sha256:${'0'.repeat(64)}`,
    buildCommands: [
      {
        command: process.execPath,
        args: [
          '-e',
          "const fs=require('node:fs');fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/cli.js',fs.readFileSync('source.txt'))",
        ],
        timeoutMs: 10_000,
      },
    ],
    executablePath: 'dist/cli.js',
    launchCommand: { command: process.execPath, args: ['{executable}'] },
    ...overrides,
  };
  value.buildRecipeFingerprint = fingerprintBuildRecipe(value);
  return value;
}

describe('isolated revision/worktree/build target', () => {
  it('builds base and patched Skill revisions without cross-run contamination', async () => {
    const repo = await repository();
    const patchFile = join(repo.root, 'variant.patch');
    await fs.writeFile(
      patchFile,
      [
        'diff --git a/source.txt b/source.txt',
        '--- a/source.txt',
        '+++ b/source.txt',
        '@@ -1 +1 @@',
        '-base',
        '+variant',
        '',
      ].join('\n'),
    );
    const base = await prepareIsolatedBuildTarget(target(repo.revision), {
      repositoryRoot: repo.root,
    });
    const variantTarget = target(repo.revision, {
      patchFile: 'variant.patch',
      patchFingerprint: await hashFile(patchFile),
    });
    variantTarget.buildRecipeFingerprint = fingerprintBuildRecipe(variantTarget);
    const variant = await prepareIsolatedBuildTarget(variantTarget, {
      repositoryRoot: repo.root,
    });

    expect(base.workspace).not.toBe(variant.workspace);
    expect(await fs.readFile(base.executablePath, 'utf8')).toBe('base\n');
    expect(await fs.readFile(variant.executablePath, 'utf8')).toBe('variant\n');
    expect(base.executableFingerprint).not.toBe(variant.executableFingerprint);
    expect(base.launch.args).toEqual([base.executablePath]);
    expect(JSON.stringify(base)).not.toContain('baseline');
    expect(JSON.stringify(variant)).not.toContain('__ablation');

    await fs.writeFile(join(base.workspace, 'base-only.txt'), 'isolated');
    await expect(fs.stat(join(variant.workspace, 'base-only.txt'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await base.cleanup();
    await variant.cleanup();
    await expect(fs.stat(base.workspace)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.stat(variant.workspace)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('cleans the worktree after a failed build', async () => {
    const repo = await repository();
    const workspaceParent = await fs.mkdtemp(join(os.tmpdir(), 'neko-isolated-build-fail-'));
    temporaryDirectories.push(workspaceParent);
    const failed = target(repo.revision, {
      buildCommands: [
        { command: process.execPath, args: ['-e', 'process.exit(7)'], timeoutMs: 10_000 },
      ],
    });
    failed.buildRecipeFingerprint = fingerprintBuildRecipe(failed);
    await expect(
      prepareIsolatedBuildTarget(failed, { repositoryRoot: repo.root, workspaceParent }),
    ).rejects.toMatchObject({ code: 'implementation-build-failed' });
    expect(await fs.readdir(workspaceParent)).toEqual([]);
    const { stdout } = await exec('git', ['worktree', 'list', '--porcelain'], { cwd: repo.root });
    expect(stdout).not.toContain('neko-agent-eval-build-');
  });

  it('kills timed-out builds and cleans their worktrees', async () => {
    const repo = await repository();
    const workspaceParent = await fs.mkdtemp(join(os.tmpdir(), 'neko-isolated-build-timeout-'));
    temporaryDirectories.push(workspaceParent);
    const timed = target(repo.revision, {
      buildCommands: [
        {
          command: process.execPath,
          args: ['-e', 'setTimeout(() => {}, 10000)'],
          timeoutMs: 20,
        },
      ],
    });
    timed.buildRecipeFingerprint = fingerprintBuildRecipe(timed);
    await expect(
      prepareIsolatedBuildTarget(timed, { repositoryRoot: repo.root, workspaceParent }),
    ).rejects.toThrow('timed out');
    expect(await fs.readdir(workspaceParent)).toEqual([]);
  });

  it('rejects source and recipe identity drift before a build can succeed', async () => {
    const repo = await repository();
    const sourceDrift = target(repo.revision, {
      sourceFingerprint: `sha256:${'f'.repeat(64)}`,
    });
    sourceDrift.buildRecipeFingerprint = fingerprintBuildRecipe(sourceDrift);
    await expect(
      prepareIsolatedBuildTarget(sourceDrift, { repositoryRoot: repo.root }),
    ).rejects.toThrow('source revision fingerprint');

    const recipeDrift = target(repo.revision);
    recipeDrift.buildRecipeFingerprint = `sha256:${'f'.repeat(64)}`;
    await expect(
      prepareIsolatedBuildTarget(recipeDrift, { repositoryRoot: repo.root }),
    ).rejects.toThrow('build recipe fingerprint');
  });

  it('fails visibly when Git worktree cleanup metadata cannot be pruned', async () => {
    const repo = await repository();
    const workspaceParent = await fs.mkdtemp(join(os.tmpdir(), 'neko-isolated-cleanup-fail-'));
    temporaryDirectories.push(workspaceParent);
    const value = target(repo.revision, {
      sourceFingerprint: `sha256:${'f'.repeat(64)}`,
    });
    value.buildRecipeFingerprint = fingerprintBuildRecipe(value);
    const runCommand = async (_command, args) => {
      if (args[0] === 'rev-parse') return { code: 0, stdout: `${repo.revision}\n`, stderr: '' };
      if (args[0] === 'worktree' && args[1] === 'prune') {
        return { code: 1, stdout: '', stderr: 'prune failed' };
      }
      return { code: 0, stdout: '', stderr: '' };
    };
    await expect(
      prepareIsolatedBuildTarget(value, {
        repositoryRoot: repo.root,
        workspaceParent,
        runCommand,
      }),
    ).rejects.toMatchObject({ code: 'implementation-cleanup-failed' });
    expect(await fs.readdir(workspaceParent)).toEqual([]);
  });
});
