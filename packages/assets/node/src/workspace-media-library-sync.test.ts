import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  createWorkspaceLinkedMediaLibrary,
  removeWorkspaceLinkedMediaLibrary,
} from '@neko/assets-node';
import { describe, expect, it } from 'vitest';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import { createGlobalMediaLibraryConnection } from './global-media-library-files';
import {
  WorkspaceMediaLibrarySyncError,
  WorkspaceMediaLibrarySyncService,
} from './workspace-media-library-sync';

describe('Desktop Workspace Media Library sync', () => {
  it('projects required, incomplete, unavailable, conflict, and unreferenced link states', async () => {
    const fixture = await createFixture();
    const service = new WorkspaceMediaLibrarySyncService(fixture.globalRoot);

    await expect(service.inspect(fixture.workspace)).resolves.toMatchObject({
      portability: { state: 'sync-requires-relink' },
      statuses: [
        {
          libraryName: 'Footage',
          state: 'required-unlinked',
          referenceCount: 1,
          missingCount: 1,
        },
      ],
    });

    await mkdir(path.join(fixture.workspace.workspacePath, 'neko/assets/Footage'), {
      recursive: true,
    });
    await expect(service.inspect(fixture.workspace)).resolves.toMatchObject({
      statuses: [{ libraryName: 'Footage', state: 'entry-conflict' }],
    });
    await rm(path.join(fixture.workspace.workspacePath, 'neko/assets/Footage'), {
      recursive: true,
    });

    const partial = path.join(fixture.root, 'Footage');
    await mkdir(partial);
    await createWorkspaceLinkedMediaLibrary({
      workspaceRoot: fixture.workspace.workspacePath,
      name: 'Footage',
      targetDirectory: partial,
    });
    await expect(service.inspect(fixture.workspace)).resolves.toMatchObject({
      statuses: [{ libraryName: 'Footage', state: 'content-incomplete', missingCount: 1 }],
    });

    const unused = path.join(fixture.root, 'Unused');
    await mkdir(unused);
    await createWorkspaceLinkedMediaLibrary({
      workspaceRoot: fixture.workspace.workspacePath,
      name: 'Unused',
      targetDirectory: unused,
    });
    const withUnused = await service.inspect(fixture.workspace);
    expect(withUnused.statuses).toContainEqual(
      expect.objectContaining({
        libraryName: 'Unused',
        state: 'unreferenced-linked',
        referenceCount: 0,
      }),
    );
  });

  it('recovers only through an exact-name global alias and rejects stale apply', async () => {
    const fixture = await createFixture();
    await mkdir(path.join(fixture.physicalRoot, 'Footage'), { recursive: true });
    await writeFile(path.join(fixture.physicalRoot, 'Footage', 'shot.mov'), 'shot');
    await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: fixture.globalRoot,
      sourceDirectory: path.join(fixture.physicalRoot, 'Footage'),
      locationKind: 'local',
    });
    const service = new WorkspaceMediaLibrarySyncService(fixture.globalRoot);
    const plan = await service.planRecovery({
      workspace: fixture.workspace,
      libraryName: 'Footage',
    });
    expect(plan).toMatchObject({
      workspaceId: fixture.workspace.workspaceId,
      libraryName: 'Footage',
      candidate: { kind: 'global-alias', name: 'Footage', locationKind: 'local' },
      referencedCount: 1,
      validatedCount: 1,
    });
    expect(JSON.stringify(plan)).not.toContain(fixture.physicalRoot);

    const recovered = await service.applyRecovery({
      workspace: fixture.workspace,
      planId: plan.planId,
      expectedOperationFingerprint: plan.operationFingerprint,
    });
    expect(recovered.statuses).toContainEqual(
      expect.objectContaining({ libraryName: 'Footage', state: 'available' }),
    );

    await removeWorkspaceLinkedMediaLibrary({
      workspaceRoot: fixture.workspace.workspacePath,
      name: 'Footage',
    });
    const stalePlan = await service.planRecovery({
      workspace: fixture.workspace,
      libraryName: 'Footage',
    });
    await writeBindings(fixture.workspace.workspacePath, '2026-08-02T00:00:00.000Z');
    await expect(
      service.applyRecovery({
        workspace: fixture.workspace,
        planId: stalePlan.planId,
        expectedOperationFingerprint: stalePlan.operationFingerprint,
      }),
    ).rejects.toMatchObject({
      code: 'stale-recovery-plan',
    } satisfies Partial<WorkspaceMediaLibrarySyncError>);
  });

  it('cancels an immutable recovery plan without mutating a workspace link', async () => {
    const fixture = await createFixture();
    const service = new WorkspaceMediaLibrarySyncService(fixture.globalRoot);
    const plan = await service.planRecovery({
      workspace: fixture.workspace,
      libraryName: 'Footage',
    });
    expect(plan.candidate).toEqual({
      kind: 'directory-selection-required',
      name: 'Footage',
    });

    service.cancelRecovery({ workspace: fixture.workspace, planId: plan.planId });
    await expect(
      service.applyRecovery({
        workspace: fixture.workspace,
        planId: plan.planId,
        expectedOperationFingerprint: plan.operationFingerprint,
      }),
    ).rejects.toMatchObject({
      code: 'stale-recovery-plan',
    } satisfies Partial<WorkspaceMediaLibrarySyncError>);
    await expect(
      lstat(path.join(fixture.workspace.workspacePath, 'neko/assets/Footage')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('registers an exact selected directory globally before linking the workspace alias', async () => {
    const fixture = await createFixture();
    const selected = path.join(fixture.physicalRoot, 'Footage');
    await mkdir(selected, { recursive: true });
    await writeFile(path.join(selected, 'shot.mov'), 'shot');
    const service = new WorkspaceMediaLibrarySyncService(fixture.globalRoot);
    const plan = await service.planSelectedDirectory({
      workspace: fixture.workspace,
      libraryName: 'Footage',
      locationKind: 'local',
      sourceDirectory: selected,
    });
    const globalAlias = path.join(fixture.globalRoot, 'local', 'Footage');

    await service.applyRecovery({
      workspace: fixture.workspace,
      planId: plan.planId,
      expectedOperationFingerprint: plan.operationFingerprint,
    });

    expect(await readlink(path.join(fixture.workspace.workspacePath, 'neko/assets/Footage'))).toBe(
      globalAlias,
    );
    expect(await realpath(globalAlias)).toBe(await realpath(selected));
  });

  it('ignores fuzzy names and target-bearing JSON while planning recovery', async () => {
    const fixture = await createFixture();
    const similar = path.join(fixture.physicalRoot, 'Footage Copy');
    await mkdir(similar, { recursive: true });
    await writeFile(path.join(similar, 'shot.mov'), 'shot');
    await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: fixture.globalRoot,
      sourceDirectory: similar,
      locationKind: 'local',
    });
    const ignoredManifest = JSON.stringify({ Footage: similar });
    await writeFile(path.join(fixture.workspace.workspacePath, 'library.json'), ignoredManifest);
    const service = new WorkspaceMediaLibrarySyncService(fixture.globalRoot);

    await expect(
      service.planRecovery({ workspace: fixture.workspace, libraryName: 'Footage' }),
    ).resolves.toMatchObject({
      candidate: { kind: 'directory-selection-required', name: 'Footage' },
      validatedCount: 0,
    });
    expect(await readFile(path.join(fixture.workspace.workspacePath, 'library.json'), 'utf8')).toBe(
      ignoredManifest,
    );
    await expect(
      lstat(path.join(fixture.workspace.workspacePath, 'neko/assets/Footage')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rolls back an existing global alias when project relink cannot be published', async () => {
    const fixture = await createFixture();
    const original = path.join(fixture.root, 'original', 'Footage');
    const replacement = path.join(fixture.root, 'replacement', 'Footage');
    await Promise.all([
      mkdir(original, { recursive: true }),
      mkdir(replacement, { recursive: true }),
    ]);
    const service = new WorkspaceMediaLibrarySyncService(fixture.globalRoot);
    await service.addDirectoryLibrary({
      workspace: fixture.workspace,
      sourceDirectory: original,
      locationKind: 'local',
    });
    await removeWorkspaceLinkedMediaLibrary({
      workspaceRoot: fixture.workspace.workspacePath,
      name: 'Footage',
    });

    await expect(
      service.relinkDirectoryLibrary({
        workspace: fixture.workspace,
        libraryName: 'Footage',
        sourceDirectory: replacement,
        locationKind: 'local',
      }),
    ).rejects.toThrow();
    await expect(realpath(path.join(fixture.globalRoot, 'local', 'Footage'))).resolves.toBe(
      await realpath(original),
    );
  });

  it('distinguishes a missing global alias from an unavailable physical target', async () => {
    const fixture = await createFixture();
    const physical = path.join(fixture.physicalRoot, 'Footage');
    await mkdir(physical, { recursive: true });
    await writeFile(path.join(physical, 'shot.mov'), 'shot');
    await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: fixture.globalRoot,
      sourceDirectory: physical,
      locationKind: 'local',
    });
    const alias = path.join(fixture.globalRoot, 'local', 'Footage');
    await createWorkspaceLinkedMediaLibrary({
      workspaceRoot: fixture.workspace.workspacePath,
      name: 'Footage',
      targetDirectory: alias,
    });
    const service = new WorkspaceMediaLibrarySyncService(fixture.globalRoot);

    await rm(alias);
    await expect(service.inspect(fixture.workspace)).resolves.toMatchObject({
      statuses: [{ libraryName: 'Footage', state: 'global-connection-missing' }],
    });

    await symlink(physical, alias, process.platform === 'win32' ? 'junction' : 'dir');
    await rm(physical, { recursive: true });
    await expect(service.inspect(fixture.workspace)).resolves.toMatchObject({
      statuses: [{ libraryName: 'Footage', state: 'target-unavailable' }],
    });
  });

  it('fails closed when a referenced descendant escapes through a nested link', async () => {
    const fixture = await createFixture();
    const physical = path.join(fixture.physicalRoot, 'Footage');
    const outside = path.join(fixture.root, 'outside');
    await Promise.all([mkdir(physical, { recursive: true }), mkdir(outside, { recursive: true })]);
    await writeFile(path.join(outside, 'shot.mov'), 'private');
    await symlink(outside, path.join(physical, 'escape'), 'dir');
    await writeBindings(
      fixture.workspace.workspacePath,
      '2026-08-01T00:00:00.000Z',
      'neko/assets/Footage/escape/shot.mov',
    );
    await createWorkspaceLinkedMediaLibrary({
      workspaceRoot: fixture.workspace.workspacePath,
      name: 'Footage',
      targetDirectory: physical,
    });

    await expect(
      new WorkspaceMediaLibrarySyncService(fixture.globalRoot).inspect(fixture.workspace),
    ).rejects.toMatchObject({
      code: 'nested-link-escape',
    } satisfies Partial<WorkspaceMediaLibrarySyncError>);
  });
});

async function createFixture(): Promise<{
  readonly root: string;
  readonly globalRoot: string;
  readonly physicalRoot: string;
  readonly workspace: AssetWorkspaceResolution;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'neko-workspace-media-sync-'));
  const workspacePath = path.join(root, 'workspace');
  const globalRoot = path.join(root, 'global-media-libraries');
  const physicalRoot = path.join(root, 'physical');
  await Promise.all([
    mkdir(workspacePath, { recursive: true }),
    mkdir(globalRoot, { recursive: true }),
    mkdir(physicalRoot, { recursive: true }),
  ]);
  await writeBindings(workspacePath, '2026-08-01T00:00:00.000Z');
  return {
    root,
    globalRoot,
    physicalRoot,
    workspace: {
      workspaceId: 'workspace-a',
      workspacePath,
      displayName: 'workspace',
      locator: { kind: 'relative', value: 'workspace' },
    },
  };
}

async function writeBindings(
  workspacePath: string,
  updatedAt: string,
  locatorPath = 'neko/assets/Footage/shot.mov',
): Promise<void> {
  const nekoDirectory = path.join(workspacePath, 'neko');
  await mkdir(nekoDirectory, { recursive: true });
  await writeFile(
    path.join(nekoDirectory, 'entities.json'),
    `${JSON.stringify(
      {
        projectId: 'workspace-a',
        entities: [
          {
            entityId: 'character-a',
            kind: 'character',
            names: { canonical: 'Character A', aliases: [] },
            representations: [
              {
                bindingId: 'binding-a',
                target: { kind: 'workspace-file', path: locatorPath },
                role: 'portrait',
                source: 'user',
                acceptedAt: updatedAt,
              },
            ],
            lifecycle: { state: 'active' },
            createdAt: updatedAt,
            updatedAt,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
}
