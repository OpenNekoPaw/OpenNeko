import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
} from '@neko/chara-domain/contracts';
import {
  CharacterAuthoringService,
  CharacterStorylineService,
} from '@neko/chara-domain/application';
import { afterEach, describe, expect, it } from 'vitest';
import {
  characterAuthoringTestPath,
  characterLocalizedAssetBindingCatalogPath,
  characterLocalizedAssetPath,
  characterLineagePath,
  characterProjectPath,
  characterStorylineDraftPath,
  characterStorylinePath,
  characterStorylineVersionPath,
  characterVersionPath,
  createCharacterAuthoringFileRepository,
} from './character-authoring-file-repository';

const NOW = '2026-08-11T00:00:00.000Z';
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Character authoring file repository', () => {
  it('uses the canonical service and file shape for exact Project placement', async () => {
    const root = await workspace();
    const scope = { kind: 'project' as const, projectId: 'project-1' };
    const repository = createCharacterAuthoringFileRepository({ workspaceRoot: root, scope });
    const service = new CharacterAuthoringService({
      repository,
      lineage: repository,
      now: () => NOW,
    });
    await service.createProject({
      characterProjectId: 'character-project-1',
      displayName: 'Lin',
      draft: {
        ...definition(),
        representationRefs: [
          {
            representationId: 'live2d-main',
            kind: 'live2d',
            resourceRef: 'asset:live2d-source',
          },
        ],
      },
    });
    await service.setReviewStatus({
      characterProjectId: 'character-project-1',
      reviewStatus: 'ready',
    });
    const publication = await service.publish({
      characterProjectId: 'character-project-1',
      characterVersionId: 'character-version-1',
      label: 'Opening',
    });
    const snapshot = await service.captureAuthoringTest({
      characterProjectId: 'character-project-1',
      authoringTestSnapshotId: 'authoring-test-1',
    });
    const storylines = new CharacterStorylineService(repository, { now: () => NOW });
    await storylines.create({
      characterStorylineId: 'storyline-1',
      characterProjectId: 'character-project-1',
      displayName: 'Opening arc',
      draft: storylineDraft('character-version-1'),
    });
    const storylineVersion = await storylines.publish({
      characterStorylineId: 'storyline-1',
      characterStorylineVersionId: 'storyline-version-1',
      label: 'Opening arc',
    });
    const localizedAsset = new Uint8Array([1, 2, 3, 4]);
    await repository.storeLocalizedAsset(
      'character-project-1',
      'live2d/model/model3.json',
      localizedAsset,
    );
    const localizedAssetBindings = {
      characterProjectId: 'character-project-1',
      bindings: [
        {
          representationId: 'live2d-main',
          kind: 'live2d' as const,
          resourceRef: 'asset:live2d-source',
          entryRelativeAssetPath: 'live2d/model/model3.json',
          files: [
            {
              relativeAssetPath: 'live2d/model/model3.json',
              mediaType: 'application/json',
              byteLength: localizedAsset.byteLength,
            },
          ],
        },
      ],
    };
    await repository.saveLocalizedAssetBindingCatalog(localizedAssetBindings);

    await expect(repository.readProject('character-project-1')).resolves.toMatchObject({
      displayName: 'Lin',
    });
    await expect(repository.readPublication('character-version-1')).resolves.toEqual(publication);
    await expect(repository.readStoryline('storyline-1')).resolves.toMatchObject({
      characterProjectId: 'character-project-1',
    });
    await expect(repository.readStorylineVersion('storyline-version-1')).resolves.toEqual(
      storylineVersion,
    );
    await expect(repository.listLocalizedAssets('character-project-1')).resolves.toEqual([
      {
        characterProjectId: 'character-project-1',
        relativeAssetPath: 'live2d/model/model3.json',
        byteLength: 4,
      },
    ]);
    await expect(
      repository.readLocalizedAsset('character-project-1', 'live2d/model/model3.json', 4),
    ).resolves.toEqual(localizedAsset);
    await expect(
      repository.readLocalizedAssetBindingCatalog('character-project-1'),
    ).resolves.toEqual(localizedAssetBindings);
    await expect(
      readFile(join(root, characterProjectPath('character-project-1')), 'utf8'),
    ).resolves.toContain('"characterProjectId": "character-project-1"');
    await expect(
      readFile(
        join(root, characterVersionPath('character-project-1', 'character-version-1')),
        'utf8',
      ),
    ).resolves.toContain('"characterVersionId": "character-version-1"');
    await expect(
      readFile(
        join(root, characterAuthoringTestPath('character-project-1', 'authoring-test-1')),
        'utf8',
      ),
    ).resolves.toContain(snapshot.authoringTestSnapshotId);
    await expect(
      readFile(join(root, characterStorylinePath('character-project-1', 'storyline-1')), 'utf8'),
    ).resolves.toContain('Opening arc');
    await expect(
      readFile(
        join(root, characterStorylineDraftPath('character-project-1', 'storyline-1')),
        'utf8',
      ),
    ).resolves.toContain('storyline-node-1');
    await expect(
      readFile(
        join(
          root,
          characterStorylineVersionPath(
            'character-project-1',
            'storyline-1',
            'storyline-version-1',
          ),
        ),
        'utf8',
      ),
    ).resolves.toContain('storyline-version-1');
    await expect(
      readFile(
        join(root, characterLocalizedAssetPath('character-project-1', 'live2d/model/model3.json')),
      ),
    ).resolves.toEqual(Buffer.from(localizedAsset));
    await expect(
      readFile(
        join(root, characterLocalizedAssetBindingCatalogPath('character-project-1')),
        'utf8',
      ),
    ).resolves.toContain('asset:live2d-source');
    await expect(repository.readProject('character-project-1')).resolves.toMatchObject({
      draft: {
        representationRefs: [expect.objectContaining({ resourceRef: 'asset:live2d-source' })],
      },
    });
    await expect(repository.readAuthoringCatalog()).resolves.toMatchObject({ scope });
    expect('createDialogue' in repository).toBe(false);
    expect('createRun' in repository).toBe(false);
  });

  it('isolates one malformed Project while preserving valid siblings', async () => {
    const root = await workspace();
    const repository = createCharacterAuthoringFileRepository({
      workspaceRoot: root,
      scope: { kind: 'project', projectId: 'project-1' },
    });
    const service = new CharacterAuthoringService({ repository, now: () => NOW });
    await service.createProject({
      characterProjectId: 'character-valid',
      displayName: 'Valid',
      draft: definition(),
    });
    const invalid = join(root, characterProjectPath('character-invalid'));
    await mkdir(join(root, 'neko/characters/character-invalid'), { recursive: true });
    await writeFile(invalid, JSON.stringify({ characterProjectId: 'character-invalid' }), 'utf8');

    const catalog = await repository.readAuthoringCatalog();
    expect(catalog.projects.map((project) => project.characterProjectId)).toEqual([
      'character-valid',
    ]);
    expect(catalog.diagnostics).toEqual([
      expect.objectContaining({ recordKind: 'character-project', recordId: 'character-invalid' }),
    ]);
    await expect(readFile(invalid, 'utf8')).resolves.toContain('character-invalid');
  });

  it('does not project a Project-local Character into another Project root', async () => {
    const projectRoot = await workspace();
    const libraryRoot = await workspace();
    const projectRepository = createCharacterAuthoringFileRepository({
      workspaceRoot: projectRoot,
      scope: { kind: 'project', projectId: 'project-1' },
    });
    await new CharacterAuthoringService({
      repository: projectRepository,
      now: () => NOW,
    }).createProject({
      characterProjectId: 'project-local-character',
      displayName: 'Local',
      draft: definition(),
    });
    const otherProjectRepository = createCharacterAuthoringFileRepository({
      workspaceRoot: libraryRoot,
      scope: { kind: 'project', projectId: 'project-2' },
    });
    await expect(otherProjectRepository.readAuthoringCatalog()).resolves.toMatchObject({
      projects: [],
    });
    await expect(projectRepository.readAuthoringCatalog()).resolves.toMatchObject({
      projects: [expect.objectContaining({ characterProjectId: 'project-local-character' })],
    });
  });

  it('does not reinterpret invalid identity or root as another authority', async () => {
    expect(() =>
      createCharacterAuthoringFileRepository({
        workspaceRoot: 'relative',
        scope: { kind: 'project', projectId: 'project-1' },
      }),
    ).toThrow('absolute Host-authorized path');
    const repository = createCharacterAuthoringFileRepository({
      workspaceRoot: await workspace(),
      scope: { kind: 'project', projectId: 'project-1' },
    });
    await expect(repository.readProject('../escape')).rejects.toMatchObject({
      code: 'character-record-invalid',
    });
  });

  it('keeps immutable publications unchanged on conflict', async () => {
    const root = await workspace();
    const repository = createCharacterAuthoringFileRepository({
      workspaceRoot: root,
      scope: { kind: 'project', projectId: 'project-1' },
    });
    const publication = {
      characterVersionId: 'character-version-1',
      characterProjectId: 'character-project-1',
      label: 'First',
      definition: definition(),
      acceptedEvidenceIds: [],
      publishedAt: NOW,
    };
    await repository.storePublication(publication);
    await expect(
      repository.storePublication({ ...publication, label: 'Changed' }),
    ).rejects.toMatchObject({
      code: 'character-publication-conflict',
    });
    await expect(repository.readPublication('character-version-1')).resolves.toMatchObject({
      label: 'First',
    });
  });

  it('deletes only the exact owned publication and preserves sibling versions', async () => {
    const root = await workspace();
    const repository = createCharacterAuthoringFileRepository({
      workspaceRoot: root,
      scope: { kind: 'project', projectId: 'project-1' },
    });
    await new CharacterAuthoringService({ repository, now: () => NOW }).createProject({
      characterProjectId: 'character-project-delete',
      displayName: 'Delete',
      draft: definition(),
    });
    await repository.storePublication({
      characterVersionId: 'character-version-delete',
      characterProjectId: 'character-project-delete',
      label: 'Delete',
      definition: definition(),
      acceptedEvidenceIds: [],
      publishedAt: NOW,
    });
    await repository.storePublication({
      characterVersionId: 'character-version-sibling',
      characterProjectId: 'character-project-delete',
      label: 'Sibling',
      definition: definition(),
      acceptedEvidenceIds: [],
      publishedAt: NOW,
    });

    await repository.deletePublication('character-project-delete', 'character-version-delete');

    await expect(repository.readPublication('character-version-delete')).resolves.toBeUndefined();
    await expect(repository.readPublication('character-version-sibling')).resolves.toMatchObject({
      characterProjectId: 'character-project-delete',
      label: 'Sibling',
    });
    await expect(
      readFile(
        join(root, characterVersionPath('character-project-delete', 'character-version-delete')),
        'utf8',
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      readFile(
        join(root, characterVersionPath('character-project-delete', 'character-version-sibling')),
        'utf8',
      ),
    ).resolves.toContain('character-version-sibling');
  });

  it('rejects wrong-owner and symlink publication deletion without removing either target', async () => {
    const root = await workspace();
    const outside = await workspace();
    const repository = createCharacterAuthoringFileRepository({
      workspaceRoot: root,
      scope: { kind: 'project', projectId: 'project-1' },
    });
    const service = new CharacterAuthoringService({ repository, now: () => NOW });
    await service.createProject({
      characterProjectId: 'character-project-owner',
      displayName: 'Owner',
      draft: definition(),
    });
    await service.createProject({
      characterProjectId: 'character-project-other',
      displayName: 'Other',
      draft: definition(),
    });
    await repository.storePublication({
      characterVersionId: 'character-version-owned',
      characterProjectId: 'character-project-owner',
      label: 'Owned',
      definition: definition(),
      acceptedEvidenceIds: [],
      publishedAt: NOW,
    });
    const wrongOwnerRecord = join(
      root,
      characterVersionPath('character-project-other', 'character-version-owned'),
    );
    await mkdir(join(root, 'neko/characters/character-project-other/versions'), {
      recursive: true,
    });
    await writeFile(
      wrongOwnerRecord,
      JSON.stringify({
        characterVersionId: 'character-version-owned',
        characterProjectId: 'character-project-owner',
        label: 'Wrong owner',
        definition: definition(),
        acceptedEvidenceIds: [],
        publishedAt: NOW,
      }),
      'utf8',
    );

    await expect(
      repository.deletePublication('character-project-other', 'character-version-owned'),
    ).rejects.toMatchObject({ code: 'character-record-invalid' });
    await expect(
      readFile(
        join(root, characterVersionPath('character-project-owner', 'character-version-owned')),
        'utf8',
      ),
    ).resolves.toContain('character-project-owner');
    await expect(readFile(wrongOwnerRecord, 'utf8')).resolves.toContain('character-project-owner');
    await rm(wrongOwnerRecord);
    await expect(repository.readPublication('character-version-owned')).resolves.toMatchObject({
      characterProjectId: 'character-project-owner',
    });

    const outsideRecord = join(outside, 'character-version-linked.json');
    await writeFile(
      outsideRecord,
      JSON.stringify({
        characterVersionId: 'character-version-linked',
        characterProjectId: 'character-project-owner',
        label: 'Linked',
        definition: definition(),
        acceptedEvidenceIds: [],
        publishedAt: NOW,
      }),
      'utf8',
    );
    const linkedRecord = join(
      root,
      characterVersionPath('character-project-owner', 'character-version-linked'),
    );
    await symlink(outsideRecord, linkedRecord);

    await expect(
      repository.deletePublication('character-project-owner', 'character-version-linked'),
    ).rejects.toMatchObject({
      code: 'character-workspace-path-escape',
      recordId: 'character-version-linked',
    });
    await expect(readFile(outsideRecord, 'utf8')).resolves.toContain('character-version-linked');
  });

  it('stores lineage only for exact Project placement', async () => {
    const root = await workspace();
    const scope = { kind: 'project' as const, projectId: 'project-1' };
    const repository = createCharacterAuthoringFileRepository({ workspaceRoot: root, scope });
    const lineage = {
      characterProjectId: 'character-project-lineage',
      relations: [
        { characterVersionId: 'version-root', parentCharacterVersionIds: [] },
        {
          characterVersionId: 'version-branch',
          parentCharacterVersionIds: ['version-root'],
        },
      ],
    };

    await expect(repository.readLineage(lineage.characterProjectId)).resolves.toBeUndefined();
    await repository.saveLineage(lineage);

    await expect(repository.readLineage(lineage.characterProjectId)).resolves.toEqual(lineage);
    await expect(
      readFile(join(root, characterLineagePath(lineage.characterProjectId)), 'utf8'),
    ).resolves.toContain('version-branch');
  });

  it('fails one corrupt lineage locally while preserving sibling records', async () => {
    const root = await workspace();
    const repository = createCharacterAuthoringFileRepository({
      workspaceRoot: root,
      scope: { kind: 'project', projectId: 'project-1' },
    });
    await repository.saveLineage({
      characterProjectId: 'character-valid',
      relations: [{ characterVersionId: 'version-valid', parentCharacterVersionIds: [] }],
    });
    const invalid = join(root, characterLineagePath('character-invalid'));
    await mkdir(join(root, 'neko/characters/character-invalid'), { recursive: true });
    await writeFile(invalid, JSON.stringify({ characterProjectId: 'character-invalid' }), 'utf8');

    await expect(repository.readLineage('character-invalid')).rejects.toMatchObject({
      code: 'character-record-invalid',
      recordId: 'character-invalid',
    });
    await expect(repository.readLineage('character-valid')).resolves.toMatchObject({
      relations: [expect.objectContaining({ characterVersionId: 'version-valid' })],
    });
    await expect(readFile(invalid, 'utf8')).resolves.toContain('character-invalid');
  });

  it('does not infer lineage from publication timestamps or file order', async () => {
    const root = await workspace();
    const repository = createCharacterAuthoringFileRepository({
      workspaceRoot: root,
      scope: { kind: 'project', projectId: 'project-1' },
    });
    await repository.storePublication({
      characterVersionId: 'version-newer',
      characterProjectId: 'character-unlinked',
      label: 'Newer',
      definition: definition(),
      acceptedEvidenceIds: [],
      publishedAt: '2026-08-12T01:00:00.000Z',
    });
    await repository.storePublication({
      characterVersionId: 'version-older',
      characterProjectId: 'character-unlinked',
      label: 'Older',
      definition: definition(),
      acceptedEvidenceIds: [],
      publishedAt: '2026-08-12T00:00:00.000Z',
    });

    await expect(repository.readLineage('character-unlinked')).resolves.toBeUndefined();
    await expect(
      readFile(join(root, characterLineagePath('character-unlinked')), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('removes a temporary lineage write when atomic replacement fails', async () => {
    const root = await workspace();
    const repository = createCharacterAuthoringFileRepository({
      workspaceRoot: root,
      scope: { kind: 'project', projectId: 'project-1' },
    });
    const projectDirectory = join(root, 'neko/characters/character-interrupted');
    await mkdir(join(projectDirectory, 'lineage.json'), { recursive: true });

    await expect(
      repository.saveLineage({
        characterProjectId: 'character-interrupted',
        relations: [{ characterVersionId: 'version-root', parentCharacterVersionIds: [] }],
      }),
    ).rejects.toMatchObject({
      code: 'character-record-write-failed',
      recordId: 'character-interrupted',
    });
    expect(await readdir(projectDirectory)).toEqual(['lineage.json']);
    await expect(repository.readLineage('character-interrupted')).rejects.toMatchObject({
      code: 'character-workspace-path-escape',
      recordId: 'character-interrupted',
    });
  });

  it('rejects a symlink lineage record without following it', async () => {
    const root = await workspace();
    const outside = await workspace();
    const repository = createCharacterAuthoringFileRepository({
      workspaceRoot: root,
      scope: { kind: 'project', projectId: 'project-1' },
    });
    const outsideRecord = join(outside, 'lineage.json');
    await writeFile(
      outsideRecord,
      JSON.stringify({ characterProjectId: 'character-link', relations: [] }),
      'utf8',
    );
    const linkedRecord = join(root, characterLineagePath('character-link'));
    await mkdir(join(root, 'neko/characters/character-link'), { recursive: true });
    await symlink(outsideRecord, linkedRecord);

    await expect(repository.readLineage('character-link')).rejects.toMatchObject({
      code: 'character-workspace-path-escape',
      recordId: 'character-link',
    });
  });

  it('rejects localized asset traversal, overwrite and symlink reads', async () => {
    const root = await workspace();
    const repository = createCharacterAuthoringFileRepository({
      workspaceRoot: root,
      scope: { kind: 'project', projectId: 'project-1' },
    });
    await new CharacterAuthoringService({
      repository,
      lineage: repository,
      now: () => NOW,
    }).createProject({
      characterProjectId: 'character-assets',
      displayName: 'Assets',
      draft: definition(),
    });
    await repository.storeLocalizedAsset(
      'character-assets',
      'portrait/main.png',
      new Uint8Array([1, 2]),
    );

    await expect(
      repository.storeLocalizedAsset(
        'character-assets',
        'portrait/main.png',
        new Uint8Array([2, 1]),
      ),
    ).rejects.toMatchObject({ code: 'character-record-conflict' });
    await expect(
      repository.readLocalizedAsset('character-assets', '../outside.png', 10),
    ).rejects.toMatchObject({ code: 'character-record-invalid' });
    await expect(
      repository.readLocalizedAsset('character-assets', 'portrait/main.png', 1),
    ).rejects.toMatchObject({ code: 'character-resource-limit-exceeded' });

    const outside = join(await workspace(), 'outside.png');
    await writeFile(outside, new Uint8Array([9]));
    const linked = join(
      root,
      characterLocalizedAssetPath('character-assets', 'portrait/linked.png'),
    );
    await symlink(outside, linked);
    await expect(
      repository.readLocalizedAsset('character-assets', 'portrait/linked.png', 10),
    ).rejects.toMatchObject({ code: 'character-workspace-path-escape' });
  });

  it('publishes localized bindings only for exact representations and complete owned files', async () => {
    const root = await workspace();
    const repository = createCharacterAuthoringFileRepository({
      workspaceRoot: root,
      scope: { kind: 'project', projectId: 'project-1' },
    });
    await new CharacterAuthoringService({
      repository,
      lineage: repository,
      now: () => NOW,
    }).createProject({
      characterProjectId: 'character-bindings',
      displayName: 'Bindings',
      draft: {
        ...definition(),
        representationRefs: [
          {
            representationId: 'portrait-main',
            kind: 'portrait',
            resourceRef: 'asset:portrait-main',
          },
        ],
      },
    });
    const catalog = {
      characterProjectId: 'character-bindings',
      bindings: [
        {
          representationId: 'portrait-main',
          kind: 'portrait' as const,
          resourceRef: 'asset:portrait-main',
          entryRelativeAssetPath: 'portrait/main.png',
          files: [
            {
              relativeAssetPath: 'portrait/main.png',
              mediaType: 'image/png',
              byteLength: 2,
            },
          ],
        },
      ],
    };

    await expect(repository.saveLocalizedAssetBindingCatalog(catalog)).rejects.toMatchObject({
      code: 'character-record-conflict',
    });
    await repository.storeLocalizedAsset(
      'character-bindings',
      'portrait/main.png',
      new Uint8Array([1, 2]),
    );
    await expect(repository.saveLocalizedAssetBindingCatalog(catalog)).resolves.toBeUndefined();
    await expect(repository.saveLocalizedAssetBindingCatalog(catalog)).resolves.toBeUndefined();
    await expect(
      repository.saveLocalizedAssetBindingCatalog({
        characterProjectId: 'character-bindings',
        bindings: [],
      }),
    ).rejects.toMatchObject({ code: 'character-record-conflict' });

    await writeFile(
      join(root, characterLocalizedAssetPath('character-bindings', 'portrait/main.png')),
      new Uint8Array([1]),
    );
    await expect(
      repository.readLocalizedAssetBindingCatalog('character-bindings'),
    ).rejects.toMatchObject({ code: 'character-record-conflict' });
  });
});

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'openneko-character-authoring-'));
  roots.push(root);
  return root;
}

function definition() {
  return {
    summary: 'A careful archivist.',
    backgroundStory: createEmptyCharacterBackgroundStory(),
    originSetting: createEmptyCharacterOriginSetting(),
    canon: ['Keeps promises.'],
    knowledgeBoundary: ['Does not know the sealed archive.'],
    behaviorPolicy: ['Ask before changing a record.'],
    expressionPolicy: ['Uses concise language.'],
    representationRefs: [],
  };
}

function storylineDraft(characterVersionId: string) {
  return {
    characterVersionId,
    premise: 'An old promise returns.',
    constraints: ['Keep future facts hidden.'],
    nodeOrder: ['storyline-node-1'],
    nodes: [
      {
        storylineNodeId: 'storyline-node-1',
        title: 'Arrival',
        spoilerVisibility: 'visible' as const,
        context: {
          situation: 'The old gate opens.',
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
