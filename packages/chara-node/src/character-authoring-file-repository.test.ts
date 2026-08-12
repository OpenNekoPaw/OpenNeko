import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
} from '@neko/chara/contracts';
import { CharacterAuthoringService } from '@neko/chara/application';
import { afterEach, describe, expect, it } from 'vitest';
import {
  characterAuthoringTestPath,
  characterLineagePath,
  characterProjectPath,
  characterVersionPath,
  createCharacterAuthoringFileRepository,
} from './character-authoring-file-repository';

const NOW = '2026-08-11T00:00:00.000Z';
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Character authoring file repository', () => {
  it.each([
    { kind: 'standalone-library' as const },
    { kind: 'content-project' as const, contentProjectId: 'content-project-1' },
  ])('uses the same service and file shape for $kind placement', async (scope) => {
    const root = await workspace();
    const repository = createCharacterAuthoringFileRepository({ workspaceRoot: root, scope });
    const service = new CharacterAuthoringService({
      repository,
      lineage: repository,
      now: () => NOW,
    });
    await service.createProject({
      characterProjectId: 'character-project-1',
      displayName: 'Lin',
      draft: definition(),
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

    await expect(repository.readProject('character-project-1')).resolves.toMatchObject({
      displayName: 'Lin',
    });
    await expect(repository.readPublication('character-version-1')).resolves.toEqual(publication);
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
    await expect(repository.readAuthoringCatalog()).resolves.toMatchObject({ scope });
    expect('createDialogue' in repository).toBe(false);
    expect('createRun' in repository).toBe(false);
  });

  it('isolates one malformed Project while preserving valid siblings', async () => {
    const root = await workspace();
    const repository = createCharacterAuthoringFileRepository({
      workspaceRoot: root,
      scope: { kind: 'content-project', contentProjectId: 'content-project-1' },
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

  it('does not project a Project-local Character into the standalone library root', async () => {
    const projectRoot = await workspace();
    const libraryRoot = await workspace();
    const projectRepository = createCharacterAuthoringFileRepository({
      workspaceRoot: projectRoot,
      scope: { kind: 'content-project', contentProjectId: 'content-project-1' },
    });
    await new CharacterAuthoringService({
      repository: projectRepository,
      now: () => NOW,
    }).createProject({
      characterProjectId: 'project-local-character',
      displayName: 'Local',
      draft: definition(),
    });
    const libraryRepository = createCharacterAuthoringFileRepository({
      workspaceRoot: libraryRoot,
      scope: { kind: 'standalone-library' },
    });
    await expect(libraryRepository.readAuthoringCatalog()).resolves.toMatchObject({ projects: [] });
    await expect(projectRepository.readAuthoringCatalog()).resolves.toMatchObject({
      projects: [expect.objectContaining({ characterProjectId: 'project-local-character' })],
    });
  });

  it('does not reinterpret invalid identity or root as another authority', async () => {
    expect(() =>
      createCharacterAuthoringFileRepository({
        workspaceRoot: 'relative',
        scope: { kind: 'standalone-library' },
      }),
    ).toThrow('absolute Host-authorized path');
    const repository = createCharacterAuthoringFileRepository({
      workspaceRoot: await workspace(),
      scope: { kind: 'standalone-library' },
    });
    expect(() => repository.readProject('../escape')).toThrow(
      expect.objectContaining({ code: 'character-record-invalid' }),
    );
  });

  it('keeps immutable publications unchanged on conflict', async () => {
    const root = await workspace();
    const repository = createCharacterAuthoringFileRepository({
      workspaceRoot: root,
      scope: { kind: 'standalone-library' },
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

  it.each([
    { kind: 'standalone-library' as const },
    { kind: 'content-project' as const, contentProjectId: 'content-project-1' },
  ])('stores the same lineage record for $kind placement', async (scope) => {
    const root = await workspace();
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
      scope: { kind: 'standalone-library' },
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
      scope: { kind: 'standalone-library' },
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
      scope: { kind: 'standalone-library' },
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
      scope: { kind: 'standalone-library' },
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
