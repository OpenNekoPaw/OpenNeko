import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import { afterEach, describe, expect, it } from 'vitest';

import { createConversationId } from '../session/conversation-id';
import { createDshConversationCanvasSelection } from './dsh-conversation-canvas-selection';
import {
  createCanvasWorkspaceContextCatalog,
  createDefaultCanvasWorkspaceTarget,
} from '@neko/canvas-domain';
import { initializeAgentConversationContextAuthorityTable } from './agent-conversation-context-authority';
import {
  createPersistentDshConversationCatalogStore,
  initializeDshConversationCatalogTables,
} from './dsh-conversation-catalog-repository';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('persistent DSH Conversation catalog', () => {
  it('projects a default for an unavailable selection and keeps disabled records and sibling Conversations visible', async () => {
    const fixture = await createFixture();
    const record = workspaceRecord('/workspace/selection', '2026-08-19T01:00:00.000Z');
    const sibling = {
      ...record,
      conversationId: createConversationId('/workspace/selection-sibling'),
    };
    const target = { workspaceId: record.context.workspaceId, canvasId: 'neko/boards/story.nkc' };
    await fixture.catalog.reserve(record, target);
    await fixture.catalog.reserve(sibling, { ...target, canvasId: 'neko/boards/disabled.nkc' });
    const service = createDshConversationCanvasSelection(fixture.catalog);
    const canvas = createCanvasWorkspaceContextCatalog({
      workspaceId: target.workspaceId,
      options: [
        { target: createDefaultCanvasWorkspaceTarget(target.workspaceId), label: 'workspace.nkc' },
        {
          target: { ...target, canvasId: 'neko/boards/disabled.nkc' },
          label: 'disabled.nkc',
          disabled: true,
          diagnostic: 'Document unavailable',
        },
      ],
    });
    try {
      await expect(service.project(record.conversationId, canvas)).resolves.toEqual({
        canvasSelection: {
          conversationId: record.conversationId,
          canvasId: canvas.defaultTarget.canvasId,
        },
        canvasSelectionDiagnostic: expect.stringContaining('unavailable'),
      });
      await expect(fixture.catalog.readCanvasSelection(record.conversationId)).resolves.toBe(
        target.canvasId,
      );
      await expect(service.project(sibling.conversationId, canvas)).resolves.toEqual({
        canvasSelection: {
          conversationId: sibling.conversationId,
          canvasId: 'neko/boards/disabled.nkc',
        },
      });
      await expect(
        service.select(record.conversationId, canvas, 'neko/boards/disabled.nkc'),
      ).rejects.toThrow('Document unavailable');
      await expect(service.select(record.conversationId, canvas, '../outside.nkc')).rejects.toThrow(
        'unavailable',
      );
      await expect(fixture.catalog.read()).resolves.toMatchObject({
        records: expect.arrayContaining([record, sibling]),
        diagnostics: [],
      });
    } finally {
      await fixture.store.dispose();
    }
  });

  it('persists the selected Canvas across a database reopen without changing sibling context', async () => {
    const fixture = await createFixture();
    const record = workspaceRecord('/workspace/canvas', '2026-08-19T01:00:00.000Z');
    const sibling = { ...record, conversationId: createConversationId('/workspace/sibling') };
    const target = { workspaceId: record.context.workspaceId, canvasId: 'neko/boards/story.nkc' };
    await fixture.catalog.reserve(record, target);
    await fixture.catalog.reserve(sibling);
    await fixture.store.dispose();

    const reopened = createNodeSqliteLocalMetadataStore({ homedir: fixture.root });
    await reopened.open({ databasePath: fixture.databasePath, busyTimeoutMs: 1_000 });
    try {
      const catalog = createPersistentDshConversationCatalogStore({ metadataStore: reopened });
      await expect(catalog.readCanvasSelection(record.conversationId)).resolves.toBe(
        target.canvasId,
      );
      await expect(catalog.readCanvasSelection(sibling.conversationId)).resolves.toBeUndefined();
      await expect(catalog.get(record.conversationId)).resolves.toEqual(record);
      await expect(
        catalog.selectCanvas(record.conversationId, {
          ...target,
          workspaceId: 'workspace:unrelated',
        }),
      ).rejects.toThrow(/Workspace/u);
      await catalog.selectCanvas(sibling.conversationId, {
        ...target,
        canvasId: 'neko/boards/sibling.nkc',
      });
      await expect(catalog.readCanvasSelection(record.conversationId)).resolves.toBe(
        target.canvasId,
      );
    } finally {
      await reopened.dispose();
    }
  });

  it('atomically persists catalog metadata and exact domain context across reopen', async () => {
    const fixture = await createFixture();
    const record = workspaceRecord('/workspace/reopen', '2026-08-19T01:00:00.000Z');
    await fixture.catalog.reserve(record);
    await fixture.store.dispose();

    const reopened = createNodeSqliteLocalMetadataStore({ homedir: fixture.root });
    await reopened.open({ databasePath: fixture.databasePath, busyTimeoutMs: 1_000 });
    const catalog = createPersistentDshConversationCatalogStore({ metadataStore: reopened });
    await expect(catalog.get(record.conversationId)).resolves.toEqual(record);
    await expect(catalog.read()).resolves.toEqual({ records: [record], diagnostics: [] });
    await reopened.dispose();
  });

  it('rejects a duplicate identity without replacing the original catalog or context', async () => {
    const fixture = await createFixture();
    const original = workspaceRecord('/workspace/original', '2026-08-19T02:00:00.000Z');
    await fixture.catalog.reserve(original);

    await expect(
      fixture.catalog.reserve({
        ...original,
        title: 'Replacement',
        context: {
          kind: 'workspace',
          workspaceId: 'workspace:replacement',
          workspaceGrantId: 'grant:replacement',
        },
      }),
    ).rejects.toThrow(/already has a domain context/u);
    await expect(fixture.catalog.read()).resolves.toEqual({
      records: [original],
      diagnostics: [],
    });
  });

  it('isolates a catalog row with missing context from a valid sibling', async () => {
    const fixture = await createFixture();
    const sibling = workspaceRecord('/workspace/sibling', '2026-08-19T03:00:00.000Z');
    const invalidConversationId = createConversationId('/workspace/invalid');
    await fixture.catalog.reserve(sibling);
    await fixture.store.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'inject-invalid-dsh-catalog-row' },
      async ({ sql }) => {
        await sql.run(
          `INSERT INTO agent_dsh_conversation_catalog(
             conversation_id, title, created_at, updated_at
           ) VALUES (?, ?, ?, ?)`,
          [
            invalidConversationId,
            'Invalid',
            '2026-08-19T04:00:00.000Z',
            '2026-08-19T04:00:00.000Z',
          ],
        );
      },
    );

    const snapshot = await fixture.catalog.read();
    expect(snapshot.records).toEqual([sibling]);
    expect(snapshot.diagnostics).toEqual([
      expect.objectContaining({ conversationId: invalidConversationId }),
    ]);
  });
});

function workspaceRecord(seed: string, timestamp: string) {
  return {
    conversationId: createConversationId(seed),
    title: 'Workspace conversation',
    createdAt: timestamp,
    updatedAt: timestamp,
    context: {
      kind: 'workspace' as const,
      workspaceId: `workspace:${seed}`,
      workspaceGrantId: `grant:${seed}`,
    },
  };
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'openneko-dsh-catalog-'));
  roots.push(root);
  const databasePath = join(root, '.neko', 'neko.db');
  const store = createNodeSqliteLocalMetadataStore({ homedir: root });
  await store.open({ databasePath, busyTimeoutMs: 1_000 });
  await initializeAgentConversationContextAuthorityTable(store);
  await initializeDshConversationCatalogTables(store);
  return {
    root,
    databasePath,
    store,
    catalog: createPersistentDshConversationCatalogStore({ metadataStore: store }),
  };
}
