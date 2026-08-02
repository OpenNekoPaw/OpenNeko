import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureWorkspaceGitHygiene } from '../node-workspace-git-hygiene';

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Workspace Git hygiene', () => {
  it('adds the workspace-local ignore rule while keeping project facts trackable', async () => {
    const workDir = await createGitWorkspace();
    await writeFile(join(workDir, '.gitignore'), 'dist/\n', 'utf8');

    const report = await ensureWorkspaceGitHygiene({ workDir, updateGitignore: true });

    expect(report).toMatchObject({
      updated: true,
      workspaceLocal: { ignored: true, matchedRule: '.neko/' },
      projectFacts: { ignored: false, matchedRule: null },
      diagnostics: [],
    });
    expect(await readFile(join(workDir, '.gitignore'), 'utf8')).toBe(
      'dist/\n\n# Neko workspace-local state and cache\n.neko/\n',
    );

    const repeated = await ensureWorkspaceGitHygiene({ workDir, updateGitignore: true });
    expect(repeated.updated).toBe(false);
    expect((await readFile(join(workDir, '.gitignore'), 'utf8')).match(/\.neko\//gu)).toHaveLength(
      1,
    );
  });

  it('diagnoses a missing .neko rule and an existing rule that hides project facts', async () => {
    const workDir = await createGitWorkspace();
    await writeFile(join(workDir, '.gitignore'), 'neko/\n', 'utf8');

    const report = await ensureWorkspaceGitHygiene({ workDir, updateGitignore: false });

    expect(report).toMatchObject({
      updated: false,
      workspaceLocal: { ignored: false, matchedRule: null },
      projectFacts: { ignored: true, matchedRule: 'neko/' },
      diagnostics: [
        expect.objectContaining({ code: 'workspace-local-not-gitignored', severity: 'warning' }),
        expect.objectContaining({ code: 'project-facts-gitignored', severity: 'error' }),
      ],
    });
    expect(await readFile(join(workDir, '.gitignore'), 'utf8')).toBe('neko/\n');
  });
});

async function createGitWorkspace(): Promise<string> {
  const workDir = await mkdtemp(join(tmpdir(), 'neko-git-hygiene-'));
  temporaryDirectories.push(workDir);
  await execFileAsync('git', ['init', '--quiet', workDir]);
  return workDir;
}
