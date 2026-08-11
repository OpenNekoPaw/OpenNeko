import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
} from '@neko/chara/contracts';
import { CharacterAuthoringService } from '@neko/chara/application';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import { afterEach, describe, expect, it } from 'vitest';
import { createCharacterAuthoringFileRepository } from './character-authoring-file-repository';
import {
  createPersistentCharacterRepository,
  initializeCharacterPersistenceTables,
} from './character-persistent-repository';
import {
  exportLegacyCharacterAuthoring,
  importLegacyCharacterAuthoring,
} from './character-legacy-authoring-transfer';

const roots: string[] = [];
const NOW = '2026-08-11T00:00:00.000Z';

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('legacy Character authoring transfer', () => {
  it('exports qualified SQLite facts and imports them without changing the source', async () => {
    const root = await temporaryRoot();
    const store = createNodeSqliteLocalMetadataStore({ homedir: root });
    await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
    await initializeCharacterPersistenceTables(store);
    const legacy = createPersistentCharacterRepository({ metadataStore: store });
    const authoring = new CharacterAuthoringService({ repository: legacy, now: () => NOW });
    await authoring.createProject({
      characterProjectId: 'character-project-transfer',
      displayName: 'Lin',
      draft: definition(),
    });
    await authoring.setReviewStatus({
      characterProjectId: 'character-project-transfer',
      reviewStatus: 'ready',
    });
    const publication = await authoring.publish({
      characterProjectId: 'character-project-transfer',
      characterVersionId: 'character-version-transfer',
      label: 'Published Lin',
    });
    const transferFile = join(root, 'transfer', 'characters.json');

    await expect(
      exportLegacyCharacterAuthoring({ metadataStore: store, destinationFile: transferFile }),
    ).resolves.toEqual({ exportedRecords: 2, diagnostics: [] });
    expect(JSON.parse(await readFile(transferFile, 'utf8'))).not.toHaveProperty('version');

    const libraryRoot = join(root, 'library');
    await mkdir(libraryRoot, { recursive: true });
    const destination = createCharacterAuthoringFileRepository({
      workspaceRoot: libraryRoot,
      scope: { kind: 'standalone-library' },
    });
    await expect(
      importLegacyCharacterAuthoring({ sourceFile: transferFile, repository: destination }),
    ).resolves.toEqual({ importedRecords: 2, unchangedRecords: 0, diagnostics: [] });
    await expect(destination.readProject('character-project-transfer')).resolves.toMatchObject({
      displayName: 'Lin',
    });
    await expect(destination.readPublication('character-version-transfer')).resolves.toEqual(
      publication,
    );
    await expect(legacy.readProject('character-project-transfer')).resolves.toBeDefined();
    await expect(legacy.readPublication('character-version-transfer')).resolves.toEqual(
      publication,
    );
    await store.dispose();
  });

  it('reports an invalid sibling without excluding valid records', async () => {
    const root = await temporaryRoot();
    const store = createNodeSqliteLocalMetadataStore({ homedir: root });
    await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
    await initializeCharacterPersistenceTables(store);
    const legacy = createPersistentCharacterRepository({ metadataStore: store });
    await new CharacterAuthoringService({ repository: legacy, now: () => NOW }).createProject({
      characterProjectId: 'character-project-valid',
      displayName: 'Valid',
      draft: definition(),
    });
    await store.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'seed-invalid-character-project' },
      ({ sql }) =>
        sql.run(`INSERT INTO chara_projects(character_project_id, payload_json) VALUES (?, ?)`, [
          'character-project-invalid',
          '{',
        ]),
    );

    const report = await exportLegacyCharacterAuthoring({
      metadataStore: store,
      destinationFile: join(root, 'characters.json'),
    });
    expect(report.exportedRecords).toBe(1);
    expect(report.diagnostics).toEqual([
      expect.objectContaining({
        recordKind: 'character-project',
        recordId: 'character-project-invalid',
      }),
    ]);
    await store.dispose();
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'neko-character-transfer-'));
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
