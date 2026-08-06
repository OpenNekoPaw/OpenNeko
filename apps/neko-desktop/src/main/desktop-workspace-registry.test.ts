import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDesktopWorkspaceRegistry,
  createRestoringDesktopWorkspaceResolver,
  type DesktopWorkspaceRegistry,
} from './desktop-workspace-registry';
import { WORKSPACE_IDENTITY_RELATIVE_PATH } from '@neko/local-metadata';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe('Desktop workspace registry', () => {
  it('restores package-owned project state before returning resolved workspaces', async () => {
    const workspace = {
      workspaceId: 'workspace-1',
      workspacePath: '/workspace',
      displayName: 'Workspace',
      locator: { kind: 'relative' as const, value: 'workspace' },
    };
    const operations: string[] = [];
    const registry: DesktopWorkspaceRegistry = {
      listProjects: vi.fn(async () => []),
      removeProject: vi.fn(async () => false),
      resolve: vi.fn(async () => {
        operations.push('resolve');
        return workspace;
      }),
      restore: vi.fn(async () => {
        operations.push('restore-resolution');
        return workspace;
      }),
      dispose: vi.fn(async () => undefined),
    };
    const resolver = createRestoringDesktopWorkspaceResolver(registry, async (resolved) => {
      expect(resolved).toBe(workspace);
      operations.push('restore-project');
    });

    await expect(resolver.resolve('/workspace')).resolves.toBe(workspace);
    await expect(resolver.restore?.('workspace-1')).resolves.toBe(workspace);
    expect(operations).toEqual([
      'resolve',
      'restore-project',
      'restore-resolution',
      'restore-project',
    ]);
  });

  it('initializes local metadata and projects stable Workspace records independently from availability', async () => {
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

    await expect(registry.listProjects()).resolves.toEqual([
      expect.objectContaining({
        projectId: `content:${workspace.workspaceId}`,
        workspaceId: workspace.workspaceId,
        displayName: 'workspace',
      }),
    ]);
    await rm(path.join(workspacePath, WORKSPACE_IDENTITY_RELATIVE_PATH));
    await expect(registry.listProjects()).resolves.toEqual([
      expect.objectContaining({
        projectId: `content:${workspace.workspaceId}`,
        unavailable: expect.objectContaining({ fieldNames: ['identity'] }),
      }),
    ]);
    await rm(workspacePath, { recursive: true });
    await expect(registry.listProjects()).resolves.toEqual([
      expect.objectContaining({
        projectId: `content:${workspace.workspaceId}`,
        unavailable: expect.objectContaining({ fieldNames: ['currentLocator'] }),
      }),
    ]);
    await expect(registry.removeProject(workspace.workspaceId)).resolves.toBe(true);
    await expect(registry.listProjects()).resolves.toEqual([]);
  });
});
