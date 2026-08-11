import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
} from '@neko/chara/contracts';
import {
  CharacterAuthoringService,
  CharacterConversationLaunchService,
} from '@neko/chara/application';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCharacterAuthoringFileRepository } from './character-authoring-file-repository';
import {
  createPersistentCharacterRuntimeRepositories,
  initializeCharacterRuntimePersistenceTables,
} from './character-persistent-repository';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Character runtime repositories', () => {
  it('constructs narrow ports without creating or reading authoring tables', async () => {
    const root = await mkdtemp(join(tmpdir(), 'neko-character-runtime-'));
    roots.push(root);
    const store = createNodeSqliteLocalMetadataStore({ homedir: root });
    await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
    await initializeCharacterRuntimePersistenceTables(store);

    const repositories = createPersistentCharacterRuntimeRepositories({ metadataStore: store });
    expect('authoring' in repositories).toBe(false);
    expect(repositories.interaction).not.toBe(repositories.companionContinuity);
    expect(repositories.companionContinuity).not.toBe(repositories.presentation);
    expect('saveProject' in repositories.interaction).toBe(false);
    await expect(repositories.catalog.readRuntimeCatalog()).resolves.toMatchObject({
      relationships: [],
      characterRuns: [],
      diagnostics: [],
    });
    const tableNames = await store.transaction(
      { mode: 'read', ownership: 'state', operation: 'inspect-character-runtime-tables' },
      async ({ sql }) =>
        (await sql.all(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)).map(
          (row) => row['name'],
        ),
    );
    expect(tableNames).not.toContain('chara_projects');
    expect(tableNames).not.toContain('chara_authoring_test_snapshots');
    expect(tableNames).not.toContain('chara_companion_assistant_lanes');
    expect(tableNames).toContain('chara_character_runs');
    await store.dispose();
  });

  it('retains the exact runtime publication after the authoring root is unloaded', async () => {
    const root = await mkdtemp(join(tmpdir(), 'neko-character-runtime-unload-'));
    roots.push(root);
    const libraryRoot = join(root, 'library');
    await mkdir(libraryRoot, { recursive: true });
    const store = createNodeSqliteLocalMetadataStore({ homedir: root });
    await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
    await initializeCharacterRuntimePersistenceTables(store);
    const authoringRepository = createCharacterAuthoringFileRepository({
      workspaceRoot: libraryRoot,
      scope: { kind: 'standalone-library' },
    });
    const authoring = new CharacterAuthoringService({
      repository: authoringRepository,
      now: () => '2026-08-11T00:00:00.000Z',
    });
    await authoring.createProject({
      characterProjectId: 'character-project-runtime',
      displayName: 'Lin',
      draft: definition(),
    });
    await authoring.setReviewStatus({
      characterProjectId: 'character-project-runtime',
      reviewStatus: 'ready',
    });
    const publication = await authoring.publish({
      characterProjectId: 'character-project-runtime',
      characterVersionId: 'character-version-runtime',
      label: 'Published Lin',
    });
    const repositories = createPersistentCharacterRuntimeRepositories({ metadataStore: store });
    const launch = new CharacterConversationLaunchService({
      repository: repositories.conversationLaunch,
      publications: authoringRepository,
      agentConversations: {
        createPrimarySession: vi.fn(async ({ characterRunId }) => ({
          primaryAgentSessionId: `conversation:character:${characterRunId}`,
        })),
        releaseUnboundSession: vi.fn(async () => undefined),
        submitTurn: vi.fn(async () => ({ turnId: 'unused', content: 'unused' })),
      },
      now: () => '2026-08-11T00:00:00.000Z',
    });
    await launch.launch({
      requestId: 'runtime-unload',
      userId: 'user:local',
      userDisplayName: 'User',
      selection: {
        mode: 'companion',
        characters: [{ characterVersionId: publication.characterVersionId }],
      },
    });

    await rm(libraryRoot, { recursive: true, force: true });
    await expect(
      repositories.conversationLaunch.readPublication(publication.characterVersionId),
    ).resolves.toEqual(publication);
    await expect(
      repositories.conversationLaunch.readCharacterRun('character-run:launch:runtime-unload:1'),
    ).resolves.toMatchObject({ characterVersionId: publication.characterVersionId });
    await expect(
      repositories.conversationLaunch.readCompanionContinuity(
        'companion-continuity:user%3Alocal:character-project-runtime',
      ),
    ).resolves.toMatchObject({
      characterProjectId: 'character-project-runtime',
    });
    await expect(
      repositories.conversationLaunch.readRelationship(
        'relationship:user%3Alocal:character-project-runtime',
      ),
    ).resolves.toMatchObject({ characterProjectId: publication.characterProjectId });
    await store.dispose();
  });
});

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
