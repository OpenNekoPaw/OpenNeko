import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseWorldActionIntent } from '@neko/world/contracts';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import { afterEach, describe, expect, it } from 'vitest';
import { WorldAuthoringService, WorldRuntimeService } from '@neko/world/application';
import {
  createPersistentWorldRepository,
  initializeWorldPersistenceTables,
} from './world-persistent-repository';

const NOW = '2026-08-09T10:00:00.000Z';
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('persistent World repository', () => {
  it('reopens the exact WorldSave branch and preserves World CAS', async () => {
    const fixture = await createFixture();
    await publish(fixture.repository);
    const runtime = runtimeService(fixture.repository);
    await runtime.createRun({
      worldVersionId: 'world-version-a',
      worldRunId: 'world-run-a',
      worldSaveId: 'world-save-a',
      branchId: 'branch-main',
      saveLabel: 'Opening',
    });
    const intent = parseWorldActionIntent({
      worldActionIntentId: 'intent-a',
      worldRunId: 'world-run-a',
      worldSaveId: 'world-save-a',
      branchId: 'branch-main',
      actorId: 'actor-a',
      action: 'open-door',
      parameters: {},
      observedTimepoint: 0,
      expectedWorldStateRevision: 0,
      createdAt: NOW,
    });
    await runtime.commitAction(intent);

    const reopened = createPersistentWorldRepository({ metadataStore: fixture.store });
    await expect(reopened.readRuntime('world-run-a')).resolves.toMatchObject({
      run: { worldStateRevision: 1, branchId: 'branch-main' },
      save: { worldSaveId: 'world-save-a', activeBranchId: 'branch-main' },
    });
    await expect(runtime.commitAction(intent)).rejects.toMatchObject({ code: 'stale-world-state' });
    await fixture.store.dispose();
  });

  it('does not expose the retired mixed authoring/runtime catalog', async () => {
    const fixture = await createFixture();
    expect('readCatalog' in fixture.repository).toBe(false);
    expect('readAuthoringCatalog' in fixture.repository).toBe(false);
    await fixture.store.dispose();
  });
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'openneko-world-persistence-'));
  roots.push(root);
  const store = createNodeSqliteLocalMetadataStore({ homedir: root });
  await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
  await initializeWorldPersistenceTables(store);
  return { store, repository: createPersistentWorldRepository({ metadataStore: store }) };
}

async function publish(repository: ReturnType<typeof createPersistentWorldRepository>) {
  const authoring = new WorldAuthoringService({ repository, now: () => NOW });
  await authoring.createProject({
    worldProjectId: 'world-project-a',
    title: 'Archive City',
    draft: definition(),
  });
  await authoring.setReviewStatus({ worldProjectId: 'world-project-a', reviewStatus: 'ready' });
  return authoring.publish({
    worldProjectId: 'world-project-a',
    worldVersionId: 'world-version-a',
    label: 'Opening',
  });
}

function runtimeService(repository: ReturnType<typeof createPersistentWorldRepository>) {
  return new WorldRuntimeService({
    repository,
    now: () => NOW,
    createWorldEventId: () => 'world-event-a',
    actionHandlers: [
      {
        action: 'open-door',
        evaluate: () => ({
          mutations: [
            {
              kind: 'set',
              fact: {
                factId: 'door-open',
                key: 'tower.door.open',
                value: true,
                visibility: { kind: 'public' },
                knownByActorIds: ['actor-a'],
              },
            },
          ],
          visibility: { kind: 'public' },
          knownByActorIds: ['actor-a'],
        }),
      },
    ],
  });
}

function definition() {
  return {
    background: 'An archive city.',
    worldBook: [],
    locations: [],
    organizations: [],
    rules: [],
    initialFacts: [
      {
        factId: 'door-open',
        key: 'tower.door.open',
        value: false,
        visibility: { kind: 'public' as const },
        knownByActorIds: ['actor-a'],
      },
    ],
  };
}
