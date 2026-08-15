import { describe, expect, it, vi } from 'vitest';
import { createEmptyCharacterDefinition, parseCharacterProject } from '@neko/chara/contracts';
import {
  CharacterGlobalCatalogService,
  type CharacterGlobalCatalogRepository,
} from './character-global-catalog-service';

describe('CharacterGlobalCatalogService', () => {
  it('creates a global Character and first version without a Workspace link', async () => {
    const repository = repositoryFixture();
    const receipt = await serviceFixture(repository).createGlobal({
      globalCharacterId: 'global-character-assistant',
      characterVersionId: 'character-version-assistant',
      displayName: 'Aster',
      label: 'v1',
      definition: createEmptyCharacterDefinition(),
    });

    expect(receipt.characterVersion.globalCharacterId).toBe('global-character-assistant');
    expect(repository.commitGlobalCatalog).toHaveBeenCalledWith(
      expect.not.objectContaining({ link: expect.anything() }),
      undefined,
    );
    expect(repository.commitCatalog).not.toHaveBeenCalled();
  });

  it('creates one global Character and exact immutable first version', async () => {
    const repository = repositoryFixture();
    const service = serviceFixture(repository);

    const receipt = await service.synchronize({
      characterProjectId: 'character-project-1',
      globalCharacterId: 'global-character-1',
      characterVersionId: 'character-version-1',
      label: 'v1',
    });

    expect(receipt.globalCharacter.characterVersionIds).toEqual(['character-version-1']);
    expect(receipt.link).toEqual({
      characterProjectId: 'character-project-1',
      globalCharacterId: 'global-character-1',
      lastSyncedCharacterVersionId: 'character-version-1',
    });
    expect(repository.commitCatalog).toHaveBeenCalledOnce();
  });

  it('rejects a stale base before any commit', async () => {
    const repository = repositoryFixture({
      characters: [
        {
          globalCharacterId: 'global-character-1',
          displayName: 'Neko',
          currentCharacterVersionId: 'character-version-2',
          characterVersionIds: ['character-version-2'],
          createdAt: '2026-08-15T00:00:00.000Z',
          updatedAt: '2026-08-15T00:00:00.000Z',
        },
      ],
      versions: [characterVersion('character-version-2')],
      links: [],
      diagnostics: [],
    });
    const service = serviceFixture(repository);

    await expect(
      service.synchronize({
        characterProjectId: 'character-project-1',
        globalCharacterId: 'global-character-1',
        characterVersionId: 'character-version-3',
        label: 'v3',
        lastSyncedCharacterVersionId: 'character-version-1',
      }),
    ).rejects.toMatchObject({ code: 'global-character-stale-base' });
    expect(repository.commitCatalog).not.toHaveBeenCalled();
  });

  it('allows an explicit new version based on current without changing old versions', async () => {
    const existingVersion = characterVersion('character-version-2');
    const repository = repositoryFixture({
      characters: [
        {
          globalCharacterId: 'global-character-1',
          displayName: 'Neko',
          currentCharacterVersionId: existingVersion.characterVersionId,
          characterVersionIds: [existingVersion.characterVersionId],
          createdAt: '2026-08-15T00:00:00.000Z',
          updatedAt: '2026-08-15T00:00:00.000Z',
        },
      ],
      versions: [existingVersion],
      links: [],
      diagnostics: [],
    });
    const service = serviceFixture(repository);

    const receipt = await service.synchronize({
      characterProjectId: 'character-project-1',
      globalCharacterId: 'global-character-1',
      characterVersionId: 'character-version-3',
      label: 'v3',
      lastSyncedCharacterVersionId: 'character-version-1',
      conflictChoice: 'base-on-current',
    });

    expect(receipt.globalCharacter.characterVersionIds).toEqual([
      'character-version-2',
      'character-version-3',
    ]);
    expect(existingVersion.characterVersionId).toBe('character-version-2');
  });

  it('prepares a fresh Workspace Character from one exact global version', async () => {
    const sourceVersion = characterVersion('character-version-2');
    const repository = repositoryFixture({
      characters: [
        {
          globalCharacterId: 'global-character-1',
          displayName: 'Neko',
          currentCharacterVersionId: sourceVersion.characterVersionId,
          characterVersionIds: [sourceVersion.characterVersionId],
          createdAt: '2026-08-15T00:00:00.000Z',
          updatedAt: '2026-08-15T00:00:00.000Z',
        },
      ],
      versions: [sourceVersion],
      links: [],
      diagnostics: [],
    });

    await expect(
      serviceFixture(repository).prepareWorkspaceCopy({
        globalCharacterId: 'global-character-1',
        characterVersionId: 'character-version-2',
        characterProjectId: 'character-project-copy',
      }),
    ).resolves.toMatchObject({
      characterProjectId: 'character-project-copy',
      displayName: 'Neko',
      draft: sourceVersion.definition,
      evidence: [],
      candidates: [],
    });
    expect(repository.commitCatalog).not.toHaveBeenCalled();
    expect(repository.commitGlobalCatalog).not.toHaveBeenCalled();
  });

  it('imports one exact version without creating a Workspace link', async () => {
    const repository = repositoryFixture();
    const service = serviceFixture(repository);

    const receipt = await service.importVersion({
      target: { kind: 'new', globalCharacterId: 'global-character-imported' },
      displayName: 'Imported Character',
      characterVersion: characterVersion('character-version-imported'),
    });

    expect(receipt.globalCharacter.characterVersionIds).toEqual(['character-version-imported']);
    expect(repository.commitGlobalCatalog).toHaveBeenCalledWith(
      expect.not.objectContaining({ link: expect.anything() }),
      undefined,
    );
    expect(repository.commitCatalog).not.toHaveBeenCalled();
  });

  it('rejects an unconfirmed existing import target before commit', async () => {
    const existingVersion = characterVersion('character-version-2');
    const repository = repositoryFixture({
      characters: [
        {
          globalCharacterId: 'global-character-1',
          displayName: 'Neko',
          currentCharacterVersionId: existingVersion.characterVersionId,
          characterVersionIds: [existingVersion.characterVersionId],
          createdAt: '2026-08-15T00:00:00.000Z',
          updatedAt: '2026-08-15T00:00:00.000Z',
        },
      ],
      versions: [existingVersion],
      links: [],
      diagnostics: [],
    });

    await expect(
      serviceFixture(repository).importVersion({
        target: {
          kind: 'existing',
          globalCharacterId: 'global-character-1',
          expectedCurrentCharacterVersionId: 'character-version-stale',
        },
        displayName: 'Imported Character',
        characterVersion: characterVersion('character-version-3'),
      }),
    ).rejects.toMatchObject({ code: 'global-character-import-target-mismatch' });
    expect(repository.commitGlobalCatalog).not.toHaveBeenCalled();
  });
});

function serviceFixture(repository: CharacterGlobalCatalogRepository) {
  return new CharacterGlobalCatalogService({
    repository,
    workspace: { readProject: async () => characterProject() },
    now: () => '2026-08-15T01:00:00.000Z',
  });
}

function repositoryFixture(
  catalog: Awaited<ReturnType<CharacterGlobalCatalogRepository['readCatalog']>> = {
    characters: [],
    versions: [],
    links: [],
    diagnostics: [],
  },
): CharacterGlobalCatalogRepository {
  return {
    readCatalog: vi.fn(async () => structuredClone(catalog)),
    commitCatalog: vi.fn(async () => undefined),
    commitGlobalCatalog: vi.fn(async () => undefined),
  };
}

function characterProject() {
  return parseCharacterProject({
    characterProjectId: 'character-project-1',
    displayName: 'Neko',
    draft: createEmptyCharacterDefinition(),
    evidence: [],
    candidates: [],
    reviewStatus: 'draft',
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
  });
}

function characterVersion(characterVersionId: string) {
  return {
    characterVersionId,
    globalCharacterId: 'global-character-1',
    label: characterVersionId,
    definition: createEmptyCharacterDefinition(),
    acceptedEvidenceIds: [],
    publishedAt: '2026-08-15T00:00:00.000Z',
  };
}
