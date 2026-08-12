import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveGlobalStorageLayout } from '@neko/local-metadata';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node-sqlite-local-metadata-store';
import {
  initializeCoreLocalMetadataTables,
  initializeSearchProjectionTables,
} from '@neko/local-metadata/sqlite';
import type { ResourceUsageProjectionRecord } from '@neko/search-domain';

const WORKSPACE_ID = '1888f0bf-ed92-440b-8cd6-03107358380a';
const NOW = '2026-08-13T08:00:00.000Z';
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Resource usage projection repository', () => {
  it('replaces one owner source and preserves sibling sources', async () => {
    const fixture = await createFixture();
    const documentSource = { ownerId: 'document' as const, sourceId: 'scripts/story.md' };
    const projectSource = { ownerId: 'project' as const, sourceId: 'project-composition' };
    await fixture.store.repositories.resourceUsageProjections.replaceSource({
      partition: fixture.partition,
      source: documentSource,
      records: [usageRecord('document-rin', documentSource, 'character-version', 'rin-published')],
      updatedAt: NOW,
    });
    await fixture.store.repositories.resourceUsageProjections.replaceSource({
      partition: fixture.partition,
      source: projectSource,
      records: [usageRecord('project-rin', projectSource, 'project-entity', 'entity-rin')],
      updatedAt: NOW,
    });

    await fixture.store.repositories.resourceUsageProjections.replaceSource({
      partition: fixture.partition,
      source: documentSource,
      records: [],
      updatedAt: '2026-08-13T09:00:00.000Z',
    });

    await expect(
      fixture.store.repositories.resourceUsageProjections.list({ partition: fixture.partition }),
    ).resolves.toEqual({
      records: [expect.objectContaining({ projectionId: 'project-rin', source: projectSource })],
      diagnostics: [],
    });
    await fixture.store.dispose();
  });

  it('queries an exact owner-qualified target without collapsing identities', async () => {
    const fixture = await createFixture();
    const source = { ownerId: 'project' as const, sourceId: 'project-composition' };
    await fixture.store.repositories.resourceUsageProjections.replaceSource({
      partition: fixture.partition,
      source,
      records: [
        usageRecord('entity-rin', source, 'project-entity', 'rin'),
        usageRecord('character-rin', source, 'character-project', 'rin'),
      ],
      updatedAt: NOW,
    });

    await expect(
      fixture.store.repositories.resourceUsageProjections.list({
        partition: fixture.partition,
        target: { ownerId: 'project-entity', resourceId: 'rin' },
      }),
    ).resolves.toEqual({
      records: [expect.objectContaining({ projectionId: 'entity-rin' })],
      diagnostics: [],
    });
    await fixture.store.dispose();
  });

  it('preserves an invalid row and returns valid siblings with a local diagnostic', async () => {
    const fixture = await createFixture();
    const source = { ownerId: 'document' as const, sourceId: 'scripts/story.md' };
    const valid = usageRecord('valid-rin', source, 'character-version', 'rin-published');
    await fixture.store.repositories.resourceUsageProjections.replaceSource({
      partition: fixture.partition,
      source,
      records: [valid],
      updatedAt: NOW,
    });
    await fixture.store.dispose();

    const database = new DatabaseSync(fixture.databasePath);
    const invalid = {
      ...valid,
      projectionId: 'invalid-rin',
      character: { name: 'copied payload' },
    };
    database
      .prepare(
        `INSERT INTO resource_usage_projections (
          partition_key, partition_scope, workspace_id, projection_id,
          source_owner_id, source_id, target_owner_id, target_resource_id,
          availability, freshness, source_fingerprint, projection_json, updated_at
        ) VALUES (?, 'workspace', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        `workspace:${WORKSPACE_ID}:resource-usage-projection`,
        WORKSPACE_ID,
        invalid.projectionId,
        source.ownerId,
        source.sourceId,
        invalid.target.ownerId,
        invalid.target.resourceId,
        invalid.availability,
        invalid.freshness,
        invalid.sourceFingerprint,
        JSON.stringify(invalid),
        invalid.updatedAt,
      );
    database.close();

    const reopened = createNodeSqliteLocalMetadataStore({ homedir: fixture.homedir });
    await reopened.open({ databasePath: fixture.databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(reopened);
    await initializeSearchProjectionTables(reopened);
    await expect(
      reopened.repositories.resourceUsageProjections.list({ partition: fixture.partition }),
    ).resolves.toEqual({
      records: [expect.objectContaining({ projectionId: valid.projectionId })],
      diagnostics: [
        expect.objectContaining({
          code: 'invalid-resource-usage-projection',
          projectionId: invalid.projectionId,
          sourceOwnerId: source.ownerId,
          sourceId: source.sourceId,
        }),
      ],
    });
    await reopened.dispose();

    const preserved = new DatabaseSync(fixture.databasePath, { readOnly: true });
    const payload = preserved
      .prepare('SELECT projection_json FROM resource_usage_projections WHERE projection_id = ?')
      .get(invalid.projectionId)?.['projection_json'];
    preserved.close();
    expect(payload).toBe(JSON.stringify(invalid));
  });
});

async function createFixture() {
  const homedir = await mkdtemp(join(tmpdir(), 'neko-resource-usage-'));
  roots.push(homedir);
  const databasePath = resolveGlobalStorageLayout(homedir).database;
  const store = createNodeSqliteLocalMetadataStore({ homedir });
  await store.open({ databasePath, busyTimeoutMs: 1_000 });
  await initializeCoreLocalMetadataTables(store);
  await initializeSearchProjectionTables(store);
  await store.repositories.workspaces.bind({
    identity: { workspaceId: WORKSPACE_ID },
    locator: { kind: 'variable', value: '${HOME}/workspace' },
    seenAt: NOW,
  });
  return {
    homedir,
    databasePath,
    store,
    partition: {
      scope: 'workspace' as const,
      workspaceId: WORKSPACE_ID,
      domain: 'resource-usage-projection' as const,
    },
  };
}

function usageRecord(
  projectionId: string,
  source: ResourceUsageProjectionRecord['source'],
  targetOwnerId: ResourceUsageProjectionRecord['target']['ownerId'],
  resourceId: string,
): ResourceUsageProjectionRecord {
  return {
    projectionId,
    source,
    target: { ownerId: targetOwnerId, resourceId },
    occurrences: [{ occurrenceId: `${projectionId}:occurrence`, location: source.sourceId }],
    usageCount: 1,
    recentlyUsedAt: NOW,
    dependencies: [],
    availability: 'available',
    freshness: 'fresh',
    sourceFingerprint: `sha256:${projectionId}`,
    updatedAt: NOW,
  };
}
