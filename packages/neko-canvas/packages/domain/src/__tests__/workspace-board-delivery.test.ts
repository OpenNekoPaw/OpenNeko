import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createEmptyCanvasData,
  planCanvasWorkspaceBoardProjection,
  resolveGlobalStorageLayout,
  type CanvasData,
  type LocalMetadataStore,
  type CanvasWorkspaceProjectionRequest,
} from '@neko/shared';
import { createNodeSqliteLocalMetadataStore } from '@neko/shared/local-metadata/node-sqlite-local-metadata-store';
import {
  AGENT_STATE_MIGRATIONS,
  M1_LOCAL_METADATA_MIGRATIONS,
} from '@neko/shared/local-metadata/sqlite';
import {
  WorkspaceBoardDeliveryCoordinator,
  WorkspaceBoardDeliveryLedger,
  createCanvasWorkspaceBoardRevision,
  type CanvasWorkspaceBoardLoadedDocument,
  type CanvasWorkspaceBoardMutationPort,
} from '../index';

const WORKSPACE_ID = 'workspace-board-domain-test';
const stores: LocalMetadataStore[] = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.dispose()));
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('Workspace Board delivery coordinator', () => {
  it('applies the same delivery once and returns its receipt on replay', async () => {
    const store = await createStore();
    const mutation = new MemoryMutationPort();
    const coordinator = createCoordinator(store, mutation, 'host-a');
    const request = delivery('delivery:one');

    await expect(coordinator.enqueue(request)).resolves.toMatchObject([{ status: 'projected' }]);
    await expect(coordinator.enqueue(request)).resolves.toMatchObject([{ status: 'projected' }]);
    expect(mutation.saveCount).toBe(1);
  });

  it('serializes distinct concurrent deliveries without a lost update', async () => {
    const store = await createStore();
    const mutation = new MemoryMutationPort();
    const first = createCoordinator(store, mutation, 'host-a');
    const second = createCoordinator(store, mutation, 'host-b');

    await Promise.all([
      first.enqueue(delivery('delivery:a')),
      second.enqueue(delivery('delivery:b')),
    ]);
    await first.flush();

    expect(mutation.saveCount).toBe(2);
    expect(mutation.canvasData.nodes.filter((node) => node.type === 'group')).toHaveLength(3);
  });

  it('rejects a stale epoch after lease takeover', async () => {
    let now = 1_000;
    const store = await createStore();
    const ledger = new WorkspaceBoardDeliveryLedger({
      metadataStore: store,
      workspaceId: WORKSPACE_ID,
      now: () => now,
    });
    const first = await ledger.acquireWriter({ holderId: 'host-a', leaseDurationMs: 10 });
    expect(first).toBeDefined();
    now = 2_000;
    const second = await ledger.acquireWriter({ holderId: 'host-b', leaseDurationMs: 10 });
    expect(second?.epoch).toBeGreaterThan(first?.epoch ?? 0);
    await expect(ledger.assertWriter(first!)).rejects.toThrow('stale-writer');
  });

  it('recovers a Canvas commit made before the receipt', async () => {
    const store = await createStore();
    const mutation = new MemoryMutationPort();
    let now = 1_000;
    const ledger = new WorkspaceBoardDeliveryLedger({
      metadataStore: store,
      workspaceId: WORKSPACE_ID,
      now: () => now,
    });
    const request = delivery('delivery:crash-window');
    await ledger.enqueue(request);
    const claim = await ledger.acquireWriter({ holderId: 'host-a', leaseDurationMs: 15_000 });
    expect(claim).toBeDefined();
    const task = await ledger.claimDelivery(request.process.deliveryId, claim!);
    expect(task).toBeDefined();
    const loaded = await mutation.loadLatest({
      documentUri: 'file:///workspace/project/neko/boards/workspace.nkc',
      createIfMissing: true,
    });
    const plan = planCanvasWorkspaceBoardProjection(loaded.canvasData, request);
    await mutation.saveAtomic({
      documentUri: loaded.documentUri,
      expectedRevision: loaded.revision,
      canvasData: plan.canvasData,
    });
    await ledger.releaseWriter(claim!);

    now = 20_000;
    const recovered = createCoordinator(store, mutation, 'host-b', () => now);
    await expect(recovered.flush()).resolves.toMatchObject([{ status: 'noop' }]);
    expect(mutation.saveCount).toBe(1);
    await expect(recovered.enqueue(request)).resolves.toMatchObject([{ status: 'noop' }]);
  });
});

class MemoryMutationPort implements CanvasWorkspaceBoardMutationPort {
  canvasData = createEmptyCanvasData('Workspace');
  saveCount = 0;

  async loadLatest(input: {
    readonly documentUri: string;
    readonly createIfMissing: boolean;
  }): Promise<CanvasWorkspaceBoardLoadedDocument> {
    return {
      documentUri: input.documentUri,
      canvasData: this.canvasData,
      revision: createCanvasWorkspaceBoardRevision(this.canvasData),
      exists: this.canvasData.nodes.length > 0,
    };
  }

  async saveAtomic(input: {
    readonly documentUri: string;
    readonly expectedRevision: string;
    readonly canvasData: CanvasData;
    readonly assertWriter?: () => Promise<void>;
  }): Promise<{ readonly revision: string }> {
    const current = createCanvasWorkspaceBoardRevision(this.canvasData);
    if (current !== input.expectedRevision)
      throw new Error('stale-revision: memory document changed.');
    await input.assertWriter?.();
    this.canvasData = input.canvasData;
    this.saveCount += 1;
    return { revision: createCanvasWorkspaceBoardRevision(this.canvasData) };
  }
}

function createCoordinator(
  store: LocalMetadataStore,
  mutation: MemoryMutationPort,
  holderId: string,
  now?: () => number,
): WorkspaceBoardDeliveryCoordinator {
  return new WorkspaceBoardDeliveryCoordinator({
    ledger: new WorkspaceBoardDeliveryLedger({
      metadataStore: store,
      workspaceId: WORKSPACE_ID,
      ...(now ? { now } : {}),
    }),
    mutation,
    holderId,
    ...(now ? { now } : {}),
  });
}

async function createStore(): Promise<LocalMetadataStore> {
  const homedir = await mkdtemp(join(tmpdir(), 'neko-canvas-domain-'));
  directories.push(homedir);
  const store = createNodeSqliteLocalMetadataStore({ homedir });
  stores.push(store);
  await store.open({
    databasePath: resolveGlobalStorageLayout(homedir).database,
    busyTimeoutMs: 1_000,
  });
  await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
  await store.migrateNamespace(AGENT_STATE_MIGRATIONS);
  await store.repositories.workspaces.bind({
    identity: { version: 1, workspaceId: WORKSPACE_ID },
    locator: { kind: 'variable', value: '${HOME}/workspace' },
    seenAt: '2026-07-15T00:00:00.000Z',
  });
  return store;
}

function delivery(deliveryId: string): CanvasWorkspaceProjectionRequest {
  return {
    version: 2,
    target: { workspaceId: WORKSPACE_ID, workspaceUri: 'file:///workspace/project/' },
    process: { deliveryId, sourceHost: 'headless', createdAt: '2026-07-15T00:00:00.000Z' },
    artifacts: [
      {
        kind: 'markdown',
        title: 'Analysis',
        markdown: '# Analysis\n\nA durable finding.',
        provenance: {
          version: 2,
          deliveryId,
          artifactId: `${deliveryId}:analysis`,
          revision: `${deliveryId}:revision-1`,
          kind: 'markdown',
          role: 'analysis',
          sourceId: `artifact:${deliveryId}`,
          createdAt: '2026-07-15T00:00:00.000Z',
        },
      },
    ],
  };
}
