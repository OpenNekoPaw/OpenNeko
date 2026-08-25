import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptyCharacterDefinition } from '@neko/chara-domain/contracts';
import { CharacterGlobalCatalogFileRepository } from './character-global-catalog-file-repository';

describe('CharacterGlobalCatalogFileRepository', () => {
  it('atomically creates and appends immutable versions with an exact Workspace link', async () => {
    const repository = new CharacterGlobalCatalogFileRepository(await root());
    await repository.commitCatalog(commit('version-1'));
    await repository.commitCatalog({
      ...commit('version-2', ['version-1', 'version-2']),
      expectedCurrentCharacterVersionId: 'version-1',
    });

    const catalog = await repository.readCatalog();
    expect(catalog.characters[0]).toMatchObject({
      currentCharacterVersionId: 'version-2',
      characterVersionIds: ['version-1', 'version-2'],
    });
    expect(catalog.versions.map((version) => version.characterVersionId)).toEqual([
      'version-1',
      'version-2',
    ]);
    expect(catalog.links[0]?.lastSyncedCharacterVersionId).toBe('version-2');
  });

  it('rejects stale CAS and isolates a damaged sibling aggregate', async () => {
    const workspace = await root();
    const repository = new CharacterGlobalCatalogFileRepository(workspace);
    await repository.commitCatalog(commit('version-1'));
    await expect(
      repository.commitCatalog({
        ...commit('version-2', ['version-1', 'version-2']),
        expectedCurrentCharacterVersionId: 'wrong-version',
      }),
    ).rejects.toThrow('changed before commit');
    const directory = join(workspace, 'neko/global-characters');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'damaged.json'), '{', 'utf8');
    const catalog = await repository.readCatalog();
    expect(catalog.characters).toHaveLength(1);
    expect(catalog.diagnostics).toHaveLength(1);
  });
});

function commit(versionId: string, history: readonly string[] = [versionId]) {
  return {
    character: {
      globalCharacterId: 'global-character-1',
      displayName: 'Aster',
      currentCharacterVersionId: versionId,
      characterVersionIds: history,
      createdAt: '2026-08-15T00:00:00.000Z',
      updatedAt: '2026-08-15T00:00:00.000Z',
    },
    version: {
      characterVersionId: versionId,
      globalCharacterId: 'global-character-1',
      label: versionId,
      definition: createEmptyCharacterDefinition(),
      acceptedEvidenceIds: [],
      publishedAt: '2026-08-15T00:00:00.000Z',
    },
    link: {
      characterProjectId: 'character-project-1',
      globalCharacterId: 'global-character-1',
      lastSyncedCharacterVersionId: versionId,
    },
  };
}

async function root(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'neko-global-character-'));
}
