import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeAuthorizedWorkspaceDirectoryCreator } from './workspace-directory-creator';

describe('NodeAuthorizedWorkspaceDirectoryCreator', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('creates exactly one contained directory and refuses conflicts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-workspace-directory-'));
    roots.push(root);
    await mkdir(path.join(root, 'references'));
    const creator = new NodeAuthorizedWorkspaceDirectoryCreator({ workspaceRoot: root });

    await expect(creator.create('references/Images')).resolves.toEqual({
      status: 'created',
      path: 'references/Images',
    });
    expect((await stat(path.join(root, 'references', 'Images'))).isDirectory()).toBe(true);
    await expect(creator.create('references/Images')).resolves.toEqual({
      status: 'unavailable',
      path: 'references/Images',
      diagnostic: { code: 'content-conflict' },
    });
  });

  it('does not create a missing parent or escape the Workspace', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-workspace-directory-'));
    roots.push(root);
    const creator = new NodeAuthorizedWorkspaceDirectoryCreator({ workspaceRoot: root });

    await expect(creator.create('missing/child')).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'content-missing' },
    });
    await expect(creator.create('../outside')).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'content-unauthorized' },
    });
  });
});
