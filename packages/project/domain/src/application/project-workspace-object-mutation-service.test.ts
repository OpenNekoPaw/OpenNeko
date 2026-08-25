import { describe, expect, it, vi } from 'vitest';
import { ProjectWorkspaceObjectMutationService } from './project-workspace-object-mutation-service';

describe('ProjectWorkspaceObjectMutationService', () => {
  it('routes copy and synchronization through the exact owner commands', async () => {
    const copyCharacter = vi.fn(async () => ({
      project: {} as never,
      target: { kind: 'character-project' as const, characterProjectId: 'character-copy' },
    }));
    const copyWorld = vi.fn(async () => ({
      project: {} as never,
      target: { kind: 'world-project' as const, worldProjectId: 'world-copy' },
    }));
    const synchronizeCharacter = vi.fn(async () => ({}) as never);
    const synchronizeWorld = vi.fn(async () => ({}) as never);
    const service = new ProjectWorkspaceObjectMutationService({
      localAuthoring: { copyCharacter, copyWorld },
      characters: { synchronize: synchronizeCharacter },
      worlds: { synchronize: synchronizeWorld },
    });
    const authority = { workspaceId: 'workspace-1', projectId: 'project-1' };

    await service.execute(authority, {
      kind: 'copy-character-reference',
      reference: {
        kind: 'character-version',
        globalCharacterId: 'global-character-1',
        characterVersionId: 'character-version-1',
      },
      characterProjectId: 'character-copy',
      entity: { kind: 'create', entityId: 'entity-copy', name: 'Copy' },
    });
    await service.execute(authority, {
      kind: 'copy-world-reference',
      reference: {
        kind: 'world-version',
        globalWorldId: 'global-world-1',
        worldVersionId: 'world-version-1',
      },
      worldProjectId: 'world-copy',
    });
    await service.execute(authority, {
      kind: 'synchronize-character',
      characterProjectId: 'character-local',
      globalCharacterId: 'global-character-1',
      characterVersionId: 'character-version-2',
      lastSyncedCharacterVersionId: 'character-version-1',
      conflictChoice: 'base-on-current',
      label: 'v2',
    });
    await service.execute(authority, {
      kind: 'synchronize-world',
      worldProjectId: 'world-local',
      globalWorldId: 'global-world-1',
      worldVersionId: 'world-version-2',
      lastSyncedWorldVersionId: 'world-version-1',
      conflictChoice: 'base-on-current',
      label: 'v2',
    });

    expect(copyCharacter).toHaveBeenCalledWith(
      authority,
      {
        globalCharacterId: 'global-character-1',
        characterVersionId: 'character-version-1',
        characterProjectId: 'character-copy',
      },
      { kind: 'create', entityId: 'entity-copy', name: 'Copy' },
      undefined,
    );
    expect(copyWorld).toHaveBeenCalledWith(
      authority,
      {
        globalWorldId: 'global-world-1',
        worldVersionId: 'world-version-1',
        worldProjectId: 'world-copy',
      },
      undefined,
    );
    expect(synchronizeCharacter).toHaveBeenCalledWith(
      {
        characterProjectId: 'character-local',
        globalCharacterId: 'global-character-1',
        characterVersionId: 'character-version-2',
        lastSyncedCharacterVersionId: 'character-version-1',
        conflictChoice: 'base-on-current',
        label: 'v2',
      },
      undefined,
    );
    expect(synchronizeWorld).toHaveBeenCalledWith(
      {
        worldProjectId: 'world-local',
        globalWorldId: 'global-world-1',
        worldVersionId: 'world-version-2',
        lastSyncedWorldVersionId: 'world-version-1',
        conflictChoice: 'base-on-current',
        label: 'v2',
      },
      undefined,
    );
  });
});
