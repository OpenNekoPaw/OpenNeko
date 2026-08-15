import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CharacterAuthoringService,
  CharacterGlobalCatalogService,
  CharacterPortablePackageService,
} from '@neko/chara/application';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
} from '@neko/chara/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { createCharacterAuthoringFileRepository } from './character-authoring-file-repository';
import { CharacterGlobalCatalogFileRepository } from './character-global-catalog-file-repository';
import { createCharacterPortableArchivePort } from './character-portable-archive';

const NOW = '2026-08-12T00:00:00.000Z';
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Character portable package service', () => {
  it('exports one exact Character version and imports it directly into the global catalog', async () => {
    const source = await sourceRepository();
    const archive = createCharacterPortableArchivePort();
    const service = new CharacterPortablePackageService(source, archive);

    const exported = await service.exportPackage({
      characterProjectId: 'character-project-a',
      characterVersionId: 'character-version-a',
      embeddedRepresentationIds: ['live2d-main'],
      maxEmbeddedAssetBytes: 1024,
    });
    expect(exported.manifest.records).toMatchObject([
      { kind: 'character-project', recordId: 'character-project-a' },
      { kind: 'character-version', recordId: 'character-version-a' },
    ]);
    expect(exported.manifest.embeddedAssets).toMatchObject([
      { archivePath: 'assets/live2d/model.model3.json', entry: true },
      { archivePath: 'assets/live2d/texture_00.png', entry: false },
    ]);

    const globalCatalog = await globalCatalogService(source);
    await expect(
      service.importIntoGlobal({
        archiveBytes: exported.archiveBytes,
        globalCatalog,
      }),
    ).resolves.toMatchObject({
      globalCharacter: {
        globalCharacterId: 'character-project-a',
        currentCharacterVersionId: 'character-version-a',
      },
      characterVersion: {
        characterVersionId: 'character-version-a',
        globalCharacterId: 'character-project-a',
      },
    });
    await expect(globalCatalog.readCatalog()).resolves.toMatchObject({
      characters: [{ globalCharacterId: 'character-project-a' }],
      versions: [{ characterVersionId: 'character-version-a' }],
      links: [],
    });
  });

  it('rejects a repeated global import without creating another object or version', async () => {
    const source = await sourceRepository();
    const service = new CharacterPortablePackageService(
      source,
      createCharacterPortableArchivePort(),
    );
    const exported = await service.exportPackage({
      characterProjectId: 'character-project-a',
      characterVersionId: 'character-version-a',
      embeddedRepresentationIds: [],
      maxEmbeddedAssetBytes: 1024,
    });
    const globalCatalog = await globalCatalogService(source);

    await service.importIntoGlobal({ archiveBytes: exported.archiveBytes, globalCatalog });
    await expect(
      service.importIntoGlobal({ archiveBytes: exported.archiveBytes, globalCatalog }),
    ).rejects.toMatchObject({ code: 'global-character-version-conflict' });
    await expect(globalCatalog.readCatalog()).resolves.toMatchObject({
      characters: [{ characterVersionIds: ['character-version-a'] }],
      versions: [{ characterVersionId: 'character-version-a' }],
    });
  });

  it('rejects one invalid archive while preserving a valid global sibling', async () => {
    const source = await sourceRepository();
    const globalCatalog = await globalCatalogService(source);
    await globalCatalog.createGlobal({
      globalCharacterId: 'global-character-sibling',
      characterVersionId: 'character-version-sibling',
      displayName: 'Sibling',
      label: 'v1',
      definition: definition(),
    });

    await expect(
      new CharacterPortablePackageService(
        source,
        createCharacterPortableArchivePort(),
      ).importIntoGlobal({
        archiveBytes: new Uint8Array([1, 2, 3, 4]),
        globalCatalog,
      }),
    ).rejects.toMatchObject({ code: 'character-package-invalid' });
    await expect(globalCatalog.readCatalog()).resolves.toMatchObject({
      characters: [{ globalCharacterId: 'global-character-sibling' }],
      versions: [{ characterVersionId: 'character-version-sibling' }],
    });
  });

  it('rejects embedding a representation without a complete exact localized binding', async () => {
    const source = await sourceRepository();
    await expect(
      new CharacterPortablePackageService(
        source,
        createCharacterPortableArchivePort(),
      ).exportPackage({
        characterProjectId: 'character-project-a',
        characterVersionId: 'character-version-a',
        embeddedRepresentationIds: ['vrm-main'],
        maxEmbeddedAssetBytes: 1024,
      }),
    ).rejects.toMatchObject({ code: 'character-package-selection-invalid' });
  });
});

async function sourceRepository() {
  const repository = createCharacterAuthoringFileRepository({
    workspaceRoot: await workspace(),
    scope: { kind: 'project', projectId: 'project-source' },
  });
  const authoring = new CharacterAuthoringService({
    repository,
    lineage: repository,
    now: () => NOW,
  });
  await authoring.createProject({
    characterProjectId: 'character-project-a',
    displayName: 'Lin',
    draft: definition(),
  });
  await authoring.setReviewStatus({
    characterProjectId: 'character-project-a',
    reviewStatus: 'ready',
  });
  await authoring.publish({
    characterProjectId: 'character-project-a',
    characterVersionId: 'character-version-a',
    label: 'v1',
  });
  await repository.storeLocalizedAsset(
    'character-project-a',
    'live2d/model.model3.json',
    new TextEncoder().encode('{"model":true}\n'),
  );
  await repository.storeLocalizedAsset(
    'character-project-a',
    'live2d/texture_00.png',
    new Uint8Array([1, 2, 3, 4]),
  );
  await repository.saveLocalizedAssetBindingCatalog({
    characterProjectId: 'character-project-a',
    bindings: [
      {
        representationId: 'live2d-main',
        kind: 'live2d',
        resourceRef: 'asset:live2d-source',
        entryRelativeAssetPath: 'live2d/model.model3.json',
        files: [
          {
            relativeAssetPath: 'live2d/model.model3.json',
            mediaType: 'application/json',
            byteLength: new TextEncoder().encode('{"model":true}\n').byteLength,
          },
          {
            relativeAssetPath: 'live2d/texture_00.png',
            mediaType: 'image/png',
            byteLength: 4,
          },
        ],
      },
    ],
  });
  return repository;
}

async function globalCatalogService(
  workspaceRepository: ReturnType<typeof createCharacterAuthoringFileRepository>,
) {
  return new CharacterGlobalCatalogService({
    repository: new CharacterGlobalCatalogFileRepository(await workspace()),
    workspace: workspaceRepository,
    now: () => NOW,
  });
}

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'openneko-character-package-service-'));
  roots.push(root);
  return root;
}

function definition() {
  return {
    summary: 'A careful archivist.',
    backgroundStory: createEmptyCharacterBackgroundStory(),
    originSetting: createEmptyCharacterOriginSetting(),
    canon: ['Keeps promises.'],
    knowledgeBoundary: [],
    behaviorPolicy: [],
    expressionPolicy: [],
    representationRefs: [
      {
        representationId: 'live2d-main',
        kind: 'live2d' as const,
        resourceRef: 'asset:live2d-source',
      },
      {
        representationId: 'vrm-main',
        kind: 'vrm' as const,
        resourceRef: 'asset:vrm-source',
      },
    ],
  };
}
