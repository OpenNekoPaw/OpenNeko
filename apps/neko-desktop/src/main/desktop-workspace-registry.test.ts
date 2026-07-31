import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDesktopWorkspaceRegistry } from './desktop-workspace-registry';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe('Desktop workspace registry', () => {
  it('migrates every local metadata namespace required by project portability', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'neko-desktop-workspace-registry-'));
    const homedir = path.join(root, 'home');
    const workspacePath = path.join(root, 'workspace');
    await Promise.all([
      mkdir(homedir, { recursive: true }),
      mkdir(workspacePath, { recursive: true }),
    ]);
    const registry = await createDesktopWorkspaceRegistry({ homedir });
    cleanups.push(async () => {
      await registry.dispose();
      await rm(root, { recursive: true, force: true });
    });
    const workspace = await registry.resolve(workspacePath);
    const repositories = registry.metadataRepositories;
    if (!repositories) throw new Error('Desktop workspace registry did not expose repositories.');

    await expect(
      repositories.tasks.list({ workspaceId: workspace.workspaceId, statuses: null }),
    ).resolves.toEqual([]);
    await expect(repositories.taskCheckpoints.list(workspace.workspaceId)).resolves.toEqual([]);
    await expect(
      repositories.mediaMetadata.list({
        scope: 'workspace',
        workspaceId: workspace.workspaceId,
        domain: 'media-metadata',
      }),
    ).resolves.toEqual([]);
  });
});
