import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CharacterAuthoringService,
  CharacterPortableImportWriteError,
  CharacterPortablePackageService,
  CharacterStorylineService,
} from '@neko/chara/application';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
} from '@neko/chara/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { createCharacterAuthoringFileRepository } from './character-authoring-file-repository';
import { createCharacterPortableArchivePort } from './character-portable-archive';

const NOW = '2026-08-12T00:00:00.000Z';
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Character portable package service', () => {
  it('exports, previews and installs an exact multi-branch Character snapshot', async () => {
    const source = createCharacterAuthoringFileRepository({
      workspaceRoot: await workspace(),
      scope: { kind: 'standalone-library' },
    });
    await seedCharacter(source);
    const archive = createCharacterPortableArchivePort();
    const exported = await new CharacterPortablePackageService(source, archive).exportPackage({
      characterProjectId: 'character-project-a',
      characterStorylineIds: ['storyline-a'],
      authoringTestSnapshotIds: [],
      embeddedAssets: [
        {
          representationId: 'live2d-main',
          kind: 'live2d',
          relativeAssetPath: 'live2d/model.model3.json',
          mediaType: 'application/json',
        },
      ],
      maxEmbeddedAssetBytes: 1024,
    });
    expect(exported.manifest.externalDependencies).toEqual([
      {
        representationId: 'voice-main',
        kind: 'voice',
        resourceRef: 'voice:provider-voice-a',
      },
    ]);

    const destination = createCharacterAuthoringFileRepository({
      workspaceRoot: await workspace(),
      scope: { kind: 'standalone-library' },
    });
    const imports = new CharacterPortablePackageService(destination, archive);
    const preview = await imports.previewImport({
      archiveBytes: exported.archiveBytes,
      destination: { kind: 'standalone-library' },
    });
    expect(preview).toMatchObject({
      characterProjectId: 'character-project-a',
      characterVersionIds: [
        'character-version-left',
        'character-version-right',
        'character-version-root',
      ],
      branchHeadCharacterVersionIds: ['character-version-left', 'character-version-right'],
      characterStorylineIds: ['storyline-a'],
      canCommit: true,
      conflicts: [],
    });

    await expect(
      imports.commitImport({
        archiveBytes: exported.archiveBytes,
        destination: { kind: 'standalone-library' },
      }),
    ).resolves.toEqual({ characterProjectId: 'character-project-a' });
    await expect(destination.readProject('character-project-a')).resolves.toMatchObject({
      displayName: 'Lin',
    });
    await expect(destination.readStorylineVersion('storyline-version-a')).resolves.toMatchObject({
      characterVersionId: 'character-version-left',
    });
    await expect(
      destination.readLocalizedAsset('character-project-a', 'live2d/model.model3.json', 1024),
    ).resolves.toEqual(new TextEncoder().encode('{"model":true}\n'));
  });

  it('reports exact mutable identity conflicts and does not overwrite the destination', async () => {
    const source = createCharacterAuthoringFileRepository({
      workspaceRoot: await workspace(),
      scope: { kind: 'standalone-library' },
    });
    await seedCharacter(source);
    const archive = createCharacterPortableArchivePort();
    const exported = await new CharacterPortablePackageService(source, archive).exportPackage({
      characterProjectId: 'character-project-a',
      characterStorylineIds: [],
      authoringTestSnapshotIds: [],
      embeddedAssets: [],
      maxEmbeddedAssetBytes: 1024,
    });
    const destination = createCharacterAuthoringFileRepository({
      workspaceRoot: await workspace(),
      scope: { kind: 'standalone-library' },
    });
    await new CharacterAuthoringService({
      repository: destination,
      lineage: destination,
      now: () => NOW,
    }).createProject({
      characterProjectId: 'character-project-a',
      displayName: 'Different',
      draft: definition(),
    });
    const imports = new CharacterPortablePackageService(destination, archive);

    await expect(
      imports.previewImport({
        archiveBytes: exported.archiveBytes,
        destination: { kind: 'standalone-library' },
      }),
    ).resolves.toMatchObject({
      canCommit: false,
      conflicts: [{ kind: 'character-project', recordId: 'character-project-a' }],
    });
    await expect(
      imports.commitImport({
        archiveBytes: exported.archiveBytes,
        destination: { kind: 'standalone-library' },
      }),
    ).rejects.toMatchObject({ code: 'character-package-identity-conflict' });
    await expect(destination.readProject('character-project-a')).resolves.toMatchObject({
      displayName: 'Different',
    });
  });

  it('returns an exact partial-install diagnostic and supports idempotent retry', async () => {
    const source = createCharacterAuthoringFileRepository({
      workspaceRoot: await workspace(),
      scope: { kind: 'standalone-library' },
    });
    await seedCharacter(source);
    const archive = createCharacterPortableArchivePort();
    const exported = await new CharacterPortablePackageService(source, archive).exportPackage({
      characterProjectId: 'character-project-a',
      characterStorylineIds: ['storyline-a'],
      authoringTestSnapshotIds: [],
      embeddedAssets: [
        {
          representationId: 'live2d-main',
          kind: 'live2d',
          relativeAssetPath: 'live2d/model.model3.json',
          mediaType: 'application/json',
        },
      ],
      maxEmbeddedAssetBytes: 1024,
    });
    const destination = createCharacterAuthoringFileRepository({
      workspaceRoot: await workspace(),
      scope: { kind: 'standalone-library' },
    });
    const interrupted = new CharacterPortablePackageService(
      {
        ...destination,
        storeLocalizedAsset: async () => {
          throw new Error('simulated asset write interruption');
        },
      },
      archive,
    );
    const input = {
      archiveBytes: exported.archiveBytes,
      destination: { kind: 'standalone-library' as const },
    };

    const failure = await interrupted.commitImport(input).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CharacterPortableImportWriteError);
    expect(failure).toMatchObject({
      code: 'character-package-install-partial',
      characterProjectId: 'character-project-a',
    });
    await expect(destination.readProject('character-project-a')).resolves.toBeDefined();
    await expect(
      new CharacterPortablePackageService(destination, archive).commitImport(input),
    ).resolves.toEqual({ characterProjectId: 'character-project-a' });
  });

  it('rejects a destination that does not match the authorized repository scope', async () => {
    const source = createCharacterAuthoringFileRepository({
      workspaceRoot: await workspace(),
      scope: { kind: 'standalone-library' },
    });
    await seedCharacter(source);
    const archive = createCharacterPortableArchivePort();
    const exported = await new CharacterPortablePackageService(source, archive).exportPackage({
      characterProjectId: 'character-project-a',
      characterStorylineIds: [],
      authoringTestSnapshotIds: [],
      embeddedAssets: [],
      maxEmbeddedAssetBytes: 1024,
    });

    await expect(
      new CharacterPortablePackageService(source, archive).previewImport({
        archiveBytes: exported.archiveBytes,
        destination: { kind: 'content-project', contentProjectId: 'content-project-a' },
      }),
    ).rejects.toMatchObject({ code: 'character-package-destination-mismatch' });
  });
});

async function seedCharacter(
  repository: ReturnType<typeof createCharacterAuthoringFileRepository>,
): Promise<void> {
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
    characterVersionId: 'character-version-root',
    label: 'Root',
  });
  await authoring.continueFromVersion({
    characterProjectId: 'character-project-a',
    characterVersionId: 'character-version-root',
    replaceWorkingDraft: true,
  });
  await authoring.setReviewStatus({
    characterProjectId: 'character-project-a',
    reviewStatus: 'ready',
  });
  await authoring.publish({
    characterProjectId: 'character-project-a',
    characterVersionId: 'character-version-left',
    label: 'Left',
  });
  await authoring.continueFromVersion({
    characterProjectId: 'character-project-a',
    characterVersionId: 'character-version-root',
    replaceWorkingDraft: true,
  });
  await authoring.setReviewStatus({
    characterProjectId: 'character-project-a',
    reviewStatus: 'ready',
  });
  await authoring.publish({
    characterProjectId: 'character-project-a',
    characterVersionId: 'character-version-right',
    label: 'Right',
  });
  const storylines = new CharacterStorylineService(repository, { now: () => NOW });
  await storylines.create({
    characterStorylineId: 'storyline-a',
    characterProjectId: 'character-project-a',
    displayName: 'Opening',
    draft: storylineDraft('character-version-left'),
  });
  await storylines.publish({
    characterStorylineId: 'storyline-a',
    characterStorylineVersionId: 'storyline-version-a',
    label: 'Opening',
  });
  await repository.storeLocalizedAsset(
    'character-project-a',
    'live2d/model.model3.json',
    new TextEncoder().encode('{"model":true}\n'),
  );
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
        representationId: 'voice-main',
        kind: 'voice' as const,
        resourceRef: 'voice:provider-voice-a',
      },
    ],
  };
}

function storylineDraft(characterVersionId: string) {
  return {
    characterVersionId,
    premise: 'An old promise returns.',
    constraints: [],
    nodeOrder: ['node-a'],
    nodes: [
      {
        storylineNodeId: 'node-a',
        title: 'Arrival',
        spoilerVisibility: 'visible' as const,
        context: {
          situation: 'The gate opens.',
          allowedStoryFacts: [],
          forbiddenStoryFacts: [],
          narrativeMemories: [],
          knowledgeBoundary: [],
          behaviorConstraints: [],
          expressionConstraints: [],
          authorOnlyNotes: [],
        },
      },
    ],
    edges: [],
  };
}
