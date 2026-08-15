import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeHostContentReadService } from './content-read-service';
import { NodeAuthorizedWorkspaceWriter } from './workspace-content-writer';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('NodeAuthorizedWorkspaceWriter', () => {
  it('creates missing parent directories and returns durable freshness without lock residue', async () => {
    const root = await createWorkspace();
    const writer = new NodeAuthorizedWorkspaceWriter({ workspaceRoot: root });
    const locator = { kind: 'workspace-file' as const, path: 'drafts/chapter/one.md' };

    const result = await writer.write(locator, new TextEncoder().encode('# One\n'), {
      conflict: 'fail-if-exists',
    });

    expect(result).toMatchObject({
      status: 'written',
      locator,
      fingerprint: { strategy: 'mtime-size' },
    });
    expect(await readFile(path.join(root, 'drafts/chapter/one.md'), 'utf8')).toBe('# One\n');
    expect(await readdir(path.join(root, 'drafts/chapter'))).toEqual(['one.md']);
  });

  it('rejects stale replacement and preserves the externally changed bytes', async () => {
    const root = await createWorkspace('notes/story.md', 'observed\n');
    const writer = new NodeAuthorizedWorkspaceWriter({ workspaceRoot: root });
    const reader = createNodeHostContentReadService({ workspaceRoot: root });
    const locator = { kind: 'workspace-file' as const, path: 'notes/story.md' };
    const observed = await reader.read(locator);
    if (observed.status !== 'ready') throw new Error('Expected readable fixture content.');
    await writeFile(path.join(root, 'notes/story.md'), 'external content changed\n');

    const result = await writer.write(locator, new TextEncoder().encode('stale replacement\n'), {
      conflict: 'replace',
      expectedFingerprint: observed.fingerprint,
    });

    expect(result).toEqual({
      status: 'unavailable',
      locator,
      diagnostic: { code: 'content-changed' },
    });
    expect(await readFile(path.join(root, 'notes/story.md'), 'utf8')).toBe(
      'external content changed\n',
    );
  });

  it('allows only one concurrent replacement for one observed fingerprint', async () => {
    const root = await createWorkspace('notes/story.md', 'observed\n');
    const reader = createNodeHostContentReadService({ workspaceRoot: root });
    const locator = { kind: 'workspace-file' as const, path: 'notes/story.md' };
    const observed = await reader.read(locator);
    if (observed.status !== 'ready') throw new Error('Expected readable fixture content.');

    const results = await Promise.all([
      new NodeAuthorizedWorkspaceWriter({ workspaceRoot: root }).write(
        locator,
        new TextEncoder().encode('first\n'),
        { conflict: 'replace', expectedFingerprint: observed.fingerprint },
      ),
      new NodeAuthorizedWorkspaceWriter({ workspaceRoot: root }).write(
        locator,
        new TextEncoder().encode('second\n'),
        { conflict: 'replace', expectedFingerprint: observed.fingerprint },
      ),
    ]);

    expect(results.filter((result) => result.status === 'written')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'unavailable')).toHaveLength(1);
    expect(['first\n', 'second\n']).toContain(
      await readFile(path.join(root, 'notes/story.md'), 'utf8'),
    );
  });
});

describe('Node workspace content path ownership', () => {
  it('reads a managed neko/assets link through workspace-file', async () => {
    const root = await createWorkspace();
    const externalRoot = await mkdtemp(path.join(tmpdir(), 'openneko-linked-content-'));
    roots.push(externalRoot);
    await writeFile(path.join(externalRoot, 'shot.mov'), 'retired-link');
    await mkdir(path.join(root, 'neko', 'assets'), { recursive: true });
    await symlink(
      externalRoot,
      path.join(root, 'neko', 'assets', 'Footage'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const locator = {
      kind: 'workspace-file' as const,
      path: 'neko/assets/Footage/shot.mov',
    };

    const result = await createNodeHostContentReadService({ workspaceRoot: root }).read(locator);
    expect(result).toMatchObject({ status: 'ready', locator });
    if (result.status !== 'ready') throw new Error('Expected managed linked content to be ready.');
    expect(new TextDecoder().decode(result.bytes)).toBe('retired-link');
  });

  it('rejects a real directory in the managed media-library namespace', async () => {
    const root = await createWorkspace('neko/assets/Footage/shot.mov', 'project-owned-directory');
    const locator = {
      kind: 'workspace-file' as const,
      path: 'neko/assets/Footage/shot.mov',
    };

    await expect(
      createNodeHostContentReadService({ workspaceRoot: root }).read(locator),
    ).resolves.toEqual({
      status: 'unavailable',
      locator,
      diagnostic: { code: 'content-unauthorized' },
    });
    await expect(
      new NodeAuthorizedWorkspaceWriter({ workspaceRoot: root }).write(
        locator,
        new TextEncoder().encode('replacement'),
        { conflict: 'replace' },
      ),
    ).resolves.toEqual({
      status: 'unavailable',
      locator,
      diagnostic: { code: 'content-unauthorized' },
    });
    expect(await readFile(path.join(root, ...locator.path.split('/')), 'utf8')).toBe(
      'project-owned-directory',
    );
  });

  it('rejects a nested link that escapes the managed library target', async () => {
    const root = await createWorkspace();
    const externalRoot = await mkdtemp(path.join(tmpdir(), 'openneko-linked-content-'));
    const outsideRoot = await mkdtemp(path.join(tmpdir(), 'openneko-nested-escape-'));
    roots.push(externalRoot, outsideRoot);
    await writeFile(path.join(outsideRoot, 'secret.txt'), 'secret');
    await symlink(
      outsideRoot,
      path.join(externalRoot, 'escape'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await mkdir(path.join(root, 'neko', 'assets'), { recursive: true });
    await symlink(
      externalRoot,
      path.join(root, 'neko', 'assets', 'Footage'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const locator = {
      kind: 'workspace-file' as const,
      path: 'neko/assets/Footage/escape/secret.txt',
    };

    await expect(
      createNodeHostContentReadService({ workspaceRoot: root }).read(locator),
    ).resolves.toEqual({
      status: 'unavailable',
      locator,
      diagnostic: { code: 'content-unauthorized' },
    });
  });
});

async function createWorkspace(relativePath?: string, source?: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'openneko-content-writer-'));
  roots.push(root);
  if (relativePath !== undefined && source !== undefined) {
    const target = path.join(root, ...relativePath.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, source);
  }
  return root;
}
