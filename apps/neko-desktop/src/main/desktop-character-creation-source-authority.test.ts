import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { NodeProjectEntityAuthoringService } from '@neko/entity-node';
import { ProjectCompositionService } from '@neko/project/application';
import { createProjectCompositionFileRepository } from '@neko/project-node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDesktopCharacterCreationSourceAuthority } from './desktop-character-creation-source-authority';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe('Desktop Character creation source authority', () => {
  it('authorizes current Content and confirmed Character Entity sources by exact grant identities', async () => {
    const workspacePath = await workspaceFixture();
    await mkdir(path.join(workspacePath, 'evidence'), { recursive: true });
    await writeFile(path.join(workspacePath, 'evidence', 'lin.md'), '# Lin\n');
    await new ProjectCompositionService(
      createProjectCompositionFileRepository({ workspaceRoot: workspacePath }),
    ).create('content-project:story');
    await new NodeProjectEntityAuthoringService({
      workspace: { workspaceId: 'workspace:story', workspacePath },
    }).createCharacterEntity({
      entityId: 'entity:lin',
      semantic: {
        kind: 'character',
        names: { canonical: 'Lin', display: 'Lin', aliases: [] },
        representations: [],
      },
      createdAt: '2026-08-12T00:00:00.000Z',
    });
    const resolveAuthorizedWorkspace = vi.fn(async () => ({
      workspace: { workspaceId: 'workspace:story', workspacePath },
    }));
    const assets = { requireRepresentation: vi.fn(async () => undefined) };
    const authority = createDesktopCharacterCreationSourceAuthority({
      workspaces: { resolveAuthorizedWorkspace },
      assets,
    });

    await expect(
      authority.content.requireReadable({
        sourceWorkspaceId: 'workspace:story',
        sourceWorkspaceGrantId: 'grant:story',
        locator: { kind: 'workspace-file', path: 'evidence/lin.md' },
      }),
    ).resolves.toBeUndefined();
    await expect(
      authority.projectEntities.requireConfirmedCharacter({
        sourceWorkspaceId: 'workspace:story',
        sourceWorkspaceGrantId: 'grant:story',
        contentProjectId: 'content-project:story',
        entityId: 'entity:lin',
      }),
    ).resolves.toBeUndefined();
    expect(resolveAuthorizedWorkspace).toHaveBeenNthCalledWith(1, 'grant:story', 'workspace:story');
    expect(resolveAuthorizedWorkspace).toHaveBeenNthCalledWith(2, 'grant:story', 'workspace:story');
    expect(assets.requireRepresentation).not.toHaveBeenCalled();
  });

  it('fails locally for missing Content, missing Entity and unavailable Asset resolver', async () => {
    const workspacePath = await workspaceFixture();
    await new ProjectCompositionService(
      createProjectCompositionFileRepository({ workspaceRoot: workspacePath }),
    ).create('content-project:story');
    await new NodeProjectEntityAuthoringService({
      workspace: { workspaceId: 'workspace:story', workspacePath },
    }).createCharacterEntity({
      entityId: 'entity:other',
      semantic: {
        kind: 'character',
        names: { canonical: 'Other', aliases: [] },
        representations: [],
      },
      createdAt: '2026-08-12T00:00:00.000Z',
    });
    const assets = {
      requireRepresentation: vi.fn(async () => {
        throw new Error('manifest-backed Asset representation resolver is unavailable');
      }),
    };
    const authority = createDesktopCharacterCreationSourceAuthority({
      workspaces: {
        resolveAuthorizedWorkspace: async () => ({
          workspace: { workspaceId: 'workspace:story', workspacePath },
        }),
      },
      assets,
    });

    await expect(
      authority.content.requireReadable({
        sourceWorkspaceId: 'workspace:story',
        sourceWorkspaceGrantId: 'grant:story',
        locator: { kind: 'workspace-file', path: 'missing.md' },
      }),
    ).rejects.toThrow('content-missing');
    await expect(
      authority.projectEntities.requireConfirmedCharacter({
        sourceWorkspaceId: 'workspace:story',
        sourceWorkspaceGrantId: 'grant:story',
        contentProjectId: 'content-project:story',
        entityId: 'entity:missing',
      }),
    ).rejects.toThrow("Project Entity 'entity:missing' does not exist");
    await expect(
      authority.assets.requireRepresentation({
        assetId: 'asset:live2d',
        resource: {
          kind: 'package-resource',
          packageId: 'asset:live2d',
          revision: 'publication:one',
          resourcePath: 'avatar/model.model3.json',
        },
        representationId: 'representation:avatar',
        representationKind: 'live2d',
      }),
    ).rejects.toThrow('manifest-backed Asset representation resolver is unavailable');
  });
});

async function workspaceFixture(): Promise<string> {
  const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-character-source-'));
  temporaryRoots.push(workspacePath);
  return workspacePath;
}
