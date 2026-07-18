import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  WorkspaceBoardDeliveryCoordinator,
  WorkspaceBoardDeliveryLedger,
} from '@neko-canvas/domain';
import {
  createGeneratedAssetsWorkspaceDeliveryRequest,
  createGeneratedAssetRevisionRef,
  loadNkc,
  resolveGlobalStorageLayout,
  type GeneratedImage,
  type LocalMetadataStore,
} from '@neko/shared';
import {
  AGENT_STATE_MIGRATIONS,
  M1_LOCAL_METADATA_MIGRATIONS,
} from '@neko/shared/local-metadata/sqlite';
import { createNodeSqliteLocalMetadataStore } from '@neko/shared/local-metadata/node-sqlite-local-metadata-store';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeWorkspaceBoardMutationPort } from './node-workspace-board-mutation-port';

const WORKSPACE_ID = 'workspace-board-tui-test';
const temporaryDirectories: string[] = [];
const stores: LocalMetadataStore[] = [];

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.dispose()));
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('NodeWorkspaceBoardMutationPort', () => {
  it('persists and reopens one coordinator-owned processing Group without a Webview', async () => {
    const root = await createTemporaryDirectory('neko-tui-workspace-board-');
    const homedir = await createTemporaryDirectory('neko-tui-workspace-board-home-');
    const store = await createStore(homedir);
    const mutation = new NodeWorkspaceBoardMutationPort(root);
    const coordinator = new WorkspaceBoardDeliveryCoordinator({
      ledger: new WorkspaceBoardDeliveryLedger({ metadataStore: store, workspaceId: WORKSPACE_ID }),
      mutation,
      holderId: 'tui:test-host',
    });
    const request = createGeneratedAssetsWorkspaceDeliveryRequest([generatedImage(root)], {
      workspaceId: WORKSPACE_ID,
      workspaceUri: mutation.workspaceUri(),
      sourceHost: 'tui',
    });

    await expect(coordinator.enqueue(request)).resolves.toMatchObject([{ status: 'projected' }]);
    await expect(coordinator.enqueue(request)).resolves.toMatchObject([{ status: 'projected' }]);
    const boardPath = path.join(root, 'neko', 'boards', 'workspace.nkc');
    const reopened = loadNkc(await fs.readFile(boardPath, 'utf8'));

    expect(reopened.validation.valid).toBe(true);
    expect(reopened.data.nodes.map((node) => node.type)).toEqual(['group', 'group', 'media']);
    expect(
      reopened.data.nodes.filter(
        (node) => node.type === 'group' && node.data.label !== 'Inbox',
      ),
    ).toHaveLength(1);
  });

  it('rejects a document outside the TUI workspace instead of falling back', async () => {
    const root = await createTemporaryDirectory('neko-tui-workspace-board-');
    const other = await createTemporaryDirectory('neko-tui-workspace-board-other-');
    const mutation = new NodeWorkspaceBoardMutationPort(root);

    await expect(
      mutation.loadLatest({
        documentUri: pathToFileURL(path.join(other, 'workspace.nkc')).toString(),
        createIfMissing: true,
      }),
    ).rejects.toThrow('outside the TUI workspace');
    await expect(fs.readdir(other)).resolves.toEqual([]);
  });

  it('delivers a source and named Markdown analysis as one processing record', async () => {
    const root = await createTemporaryDirectory('neko-tui-workspace-board-');
    const homedir = await createTemporaryDirectory('neko-tui-workspace-board-home-');
    const store = await createStore(homedir);
    const mutation = new NodeWorkspaceBoardMutationPort(root);
    const coordinator = new WorkspaceBoardDeliveryCoordinator({
      ledger: new WorkspaceBoardDeliveryLedger({ metadataStore: store, workspaceId: WORKSPACE_ID }),
      mutation,
      holderId: 'tui:material-analysis',
    });
    const result = await coordinator.enqueue({
      version: 2,
      target: { workspaceId: WORKSPACE_ID, workspaceUri: mutation.workspaceUri() },
      process: {
        deliveryId: 'agent-turn:material-analysis',
        sourceHost: 'tui',
        runId: 'run-material-analysis',
        createdAt: '2026-07-15T00:00:00.000Z',
      },
      artifacts: [
        {
          kind: 'file-reference',
          title: 'Selected brief',
          resourceRef: {
            id: 'source:brief',
            scope: 'project',
            provider: 'document',
            kind: 'document',
            source: { kind: 'file', projectRelativePath: 'materials/brief.md' },
            locator: { kind: 'file', path: 'materials/brief.md' },
            fingerprint: { strategy: 'hash', value: 'sha256:brief' },
          },
          provenance: {
            version: 2,
            deliveryId: 'agent-turn:material-analysis',
            artifactId: 'brief',
            revision: 'sha256:brief',
            kind: 'file-reference',
            role: 'source',
            sourceId: 'source:brief',
            createdAt: '2026-07-15T00:00:00.000Z',
          },
        },
        {
          kind: 'markdown',
          title: 'Material Analysis',
          markdown: '# Findings\n\nThe selected brief establishes the visual direction.',
          provenance: {
            version: 2,
            deliveryId: 'agent-turn:material-analysis',
            artifactId: 'analysis',
            revision: 'markdown:analysis-1',
            kind: 'markdown',
            role: 'analysis',
            sourceId: 'artifact:analysis',
            createdAt: '2026-07-15T00:00:00.000Z',
          },
        },
      ],
    });

    expect(result).toMatchObject([{ status: 'projected' }]);
    const board = loadNkc(
      await fs.readFile(path.join(root, 'neko', 'boards', 'workspace.nkc'), 'utf8'),
    );
    expect(board.data.nodes.filter((node) => node.type === 'document')).toHaveLength(1);
    expect(board.data.nodes.filter((node) => node.type === 'text')).toHaveLength(1);
    expect(board.data.nodes.find((node) => node.type === 'text')).toMatchObject({
      data: { title: 'Material Analysis', content: expect.stringContaining('selected brief') },
    });
  });
});

function generatedImage(root: string): GeneratedImage {
  return {
    id: 'generated-1',
    type: 'generated-image',
    path: path.join(root, 'neko', 'generated', 'image', 'generated-1.png'),
    mimeType: 'image/png',
    generatedAt: '2026-07-15T00:00:00.000Z',
    lifecycle: createGeneratedAssetRevisionRef({
      assetId: 'generated-1',
      contentDigest: 'sha256:generated-1',
      mediaKind: 'image',
      mimeType: 'image/png',
      generation: { taskId: 'task-1' },
    }),
    width: 1024,
    height: 1024,
    ratio: '1:1',
  };
}

async function createStore(homedir: string): Promise<LocalMetadataStore> {
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

async function createTemporaryDirectory(prefix: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}
