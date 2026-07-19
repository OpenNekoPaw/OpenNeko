import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceBoardDeliveryLedger } from '@neko-canvas/domain';
import type { CreatorVisibleArtifactCandidate } from '@neko/agent/runtime';
import { GeneratedAssetIndex, type MediaTask } from '@neko/platform';
import {
  loadNkc,
  resolveGlobalStorageLayout,
  type CanvasWorkspaceProjectionRequest,
  type GeneratedAsset,
  type LocalMetadataStore,
} from '@neko/shared';
import { createNodeSqliteLocalMetadataStore } from '@neko/shared/local-metadata/node-sqlite-local-metadata-store';
import {
  AGENT_STATE_MIGRATIONS,
  M1_LOCAL_METADATA_MIGRATIONS,
} from '@neko/shared/local-metadata/sqlite';
import { NodeMediaTaskDeliveryHost } from './node-media-task-delivery-host';

const WORKSPACE_ID = 'workspace-board-tui-host-test';
const temporaryDirectories: string[] = [];
const stores: LocalMetadataStore[] = [];

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.dispose()));
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('NodeMediaTaskDeliveryHost Workspace Board delivery', () => {
  it('delivers a completed generated output with its original task and run identities', async () => {
    const fixture = await createFixture();
    const outputPath = path.join(
      fixture.workspaceRoot,
      'neko',
      'generated',
      'image',
      'generated.png',
    );
    const host = createHost(fixture, {
      media: {
        saveOutputs: async () => {
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          await fs.writeFile(outputPath, 'generated image bytes');
          return [outputPath];
        },
      },
    });

    await expect(host.createTaskViewDelivery(completedImageTask())).resolves.toMatchObject({
      view: { id: 'task-generated-image', status: 'completed' },
      deliveryPlan: { generatedAssets: [expect.objectContaining({ type: 'generated-image' })] },
    });

    const board = await readWorkspaceBoard(fixture.workspaceRoot);
    expect(board.data.nodes.filter((node) => node.type === 'media')).toHaveLength(1);
    expect(JSON.stringify(board.data.nodes)).toContain('task-generated-image');
    expect(JSON.stringify(board.data.nodes)).toContain('run-generated-image');
  });

  it('delivers one source and Markdown batch once with its original run identity', async () => {
    const fixture = await createFixture();
    const host = createHost(fixture);
    const input = {
      deliveryId: 'agent-turn:material-analysis',
      createdAt: '2026-07-15T00:00:00.000Z',
      runId: 'run-material-analysis',
      artifacts: creatorVisibleArtifacts(),
    };

    const first = await host.deliverCreatorVisibleArtifacts(input);
    expect(first).toMatchObject([
      {
        status: 'projected',
        artifactRoleCounts: { source: 1, analysis: 1, output: 0 },
      },
    ]);
    const replay = await host.deliverCreatorVisibleArtifacts(input);
    expect(replay).toMatchObject([{ status: 'projected', deliveryId: input.deliveryId }]);
    expect(replay).toEqual(first);

    const board = await readWorkspaceBoard(fixture.workspaceRoot);
    expect(board.data.nodes.filter((node) => node.type === 'group')).toHaveLength(0);
    expect(board.data.nodes.filter((node) => node.type === 'document')).toHaveLength(1);
    expect(board.data.nodes.filter((node) => node.type === 'text')).toHaveLength(1);
    expect(JSON.stringify(board.data.nodes)).toContain('run-material-analysis');
    expect(host.getWorkspaceBoardDeliveryObservability()).toEqual({
      canonicalSubmissionCount: 2,
      resumeScanCount: 0,
      legacyFallbackCounts: {
        activeCanvas: 0,
        recentCanvas: 0,
        directWriter: 0,
        genericSendToCanvas: 0,
      },
    });
  });

  it('preserves intrinsic image dimensions through the TUI projection adapter', async () => {
    const fixture = await createFixture();
    const host = createHost(fixture);

    await host.deliverCreatorVisibleArtifacts({
      deliveryId: 'agent-turn:portrait-image',
      createdAt: '2026-07-19T00:00:00.000Z',
      artifacts: [portraitImageArtifact()],
    });

    const board = await readWorkspaceBoard(fixture.workspaceRoot);
    const node = board.data.nodes.find((candidate) => candidate.type === 'media')!;
    expect(node.size.width / node.size.height).toBeCloseTo(2 / 3, 8);
  });

  it('resumes a pending delivery through a new TUI Host without changing identity', async () => {
    const fixture = await createFixture();
    const request = pendingMarkdownDelivery(fixture.workspaceRoot);
    const ledger = new WorkspaceBoardDeliveryLedger({
      metadataStore: fixture.store,
      workspaceId: WORKSPACE_ID,
    });
    await ledger.enqueue(request);

    const host = createHost(fixture);
    await expect(host.resumePendingWorkspaceBoardDeliveries()).resolves.toMatchObject([
      { status: 'projected', deliveryId: request.process.deliveryId },
    ]);
    await expect(ledger.getReceipt(request.process.deliveryId)).resolves.toMatchObject({
      deliveryId: request.process.deliveryId,
      state: 'projected',
    });
    const board = await readWorkspaceBoard(fixture.workspaceRoot);
    expect(board.data.nodes.filter((node) => node.type === 'group')).toHaveLength(0);
    expect(host.getWorkspaceBoardDeliveryObservability()).toMatchObject({
      canonicalSubmissionCount: 0,
      resumeScanCount: 1,
    });
  });

  it('poisons explicit target mirroring and the removed direct writer', async () => {
    const source = await fs.readFile(
      new URL('./node-media-task-delivery-host.ts', import.meta.url),
      'utf8',
    );

    expect(source).not.toContain('NodeWorkspaceBoardProjector');
    expect(source).not.toContain('deliverGeneratedAssets');
    expect(source).not.toContain('documentUri');
  });
});

function createHost(
  fixture: {
    readonly workspaceRoot: string;
    readonly store: LocalMetadataStore;
  },
  platform?: {
    readonly media?: {
      saveOutputs(scope: MediaTask['scope'], outputDir: string): Promise<string[]>;
    };
  },
): NodeMediaTaskDeliveryHost {
  let assets: readonly GeneratedAsset[] = [];
  return new NodeMediaTaskDeliveryHost({
    workspaceRoot: fixture.workspaceRoot,
    workspaceId: WORKSPACE_ID,
    metadataStore: fixture.store,
    assetIndex: new GeneratedAssetIndex({
      load: async () => assets,
      update: async (operation) => {
        assets = operation(assets);
        return assets;
      },
    }),
    ...(platform ? { platform } : {}),
  });
}

function completedImageTask(): MediaTask {
  const now = new Date('2026-07-15T00:00:00.000Z');
  return {
    scope: {
      conversationId: 'conversation-generated-image',
      runId: 'run-generated-image',
      parentRunId: 'run-generated-image',
      childRunId: 'task-generated-image',
      childKind: 'task',
    },
    id: 'task-generated-image',
    type: 'text-to-image',
    status: 'completed',
    progress: 100,
    providerId: 'test-provider',
    modelId: 'test-image-model',
    createdAt: now,
    updatedAt: now,
    request: {
      prompt: 'A generated image for the Workspace Board',
      metadata: { runId: 'run-generated-image' },
    },
    outputs: [
      {
        type: 'image',
        url: 'https://provider.test/generated.png',
        mimeType: 'image/png',
        width: 512,
        height: 512,
      },
    ],
  };
}

function creatorVisibleArtifacts(): readonly CreatorVisibleArtifactCandidate[] {
  return [
    {
      artifactId: 'brief',
      revision: 'sha256:brief',
      role: 'source',
      kind: 'file-reference',
      title: 'Selected brief',
      sourceId: 'source:brief',
      resourceRef: {
        id: 'source:brief',
        scope: 'project',
        provider: 'document',
        kind: 'document',
        source: { kind: 'file', projectRelativePath: 'materials/brief.md' },
        locator: { kind: 'file', path: 'materials/brief.md' },
        fingerprint: { strategy: 'hash', value: 'sha256:brief' },
      },
    },
    {
      artifactId: 'analysis',
      revision: 'markdown:analysis-1',
      role: 'analysis',
      kind: 'markdown',
      title: 'Material Analysis',
      sourceId: 'artifact:analysis',
      sourceArtifactIds: ['brief'],
      markdown: '# Findings\n\nThe selected brief establishes the direction.',
    },
  ];
}

function portraitImageArtifact(): CreatorVisibleArtifactCandidate {
  return {
    artifactId: 'portrait-image',
    revision: 'sha256:portrait-image',
    role: 'output',
    kind: 'image',
    title: 'Portrait image',
    sourceId: 'source:portrait-image',
    intrinsicDimensions: { width: 1024, height: 1536 },
    resourceRef: {
      id: 'source:portrait-image',
      scope: 'project',
      provider: 'generated-output',
      kind: 'generated',
      source: {
        kind: 'generated-asset',
        generatedAssetId: 'portrait-image',
        projectRelativePath: 'neko/generated/image/portrait-image.png',
      },
      locator: { kind: 'generated-asset', assetId: 'portrait-image' },
      fingerprint: { strategy: 'hash', value: 'sha256:portrait-image' },
    },
  };
}

function pendingMarkdownDelivery(workspaceRoot: string): CanvasWorkspaceProjectionRequest {
  const deliveryId = 'background-task:analysis';
  return {
    version: 2,
    target: {
      workspaceId: WORKSPACE_ID,
      workspaceUri: pathToFileURL(`${workspaceRoot}${path.sep}`).toString(),
    },
    process: {
      deliveryId,
      sourceHost: 'tui',
      taskId: 'task-analysis',
      runId: 'run-analysis',
      createdAt: '2026-07-15T00:00:00.000Z',
    },
    artifacts: [
      {
        kind: 'markdown',
        title: 'Background analysis',
        markdown: '# Background analysis',
        provenance: {
          version: 2,
          deliveryId,
          artifactId: 'background-analysis',
          revision: 'markdown:background-analysis-1',
          kind: 'markdown',
          role: 'analysis',
          sourceId: 'artifact:background-analysis',
          taskId: 'task-analysis',
          runId: 'run-analysis',
          createdAt: '2026-07-15T00:00:00.000Z',
        },
      },
    ],
  };
}

async function createFixture(): Promise<{
  readonly workspaceRoot: string;
  readonly store: LocalMetadataStore;
}> {
  const workspaceRoot = await createTemporaryDirectory('neko-tui-delivery-workspace-');
  const homedir = await createTemporaryDirectory('neko-tui-delivery-home-');
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
  return { workspaceRoot, store };
}

async function readWorkspaceBoard(workspaceRoot: string) {
  return loadNkc(
    await fs.readFile(path.join(workspaceRoot, 'neko', 'boards', 'workspace.nkc'), 'utf8'),
  );
}

async function createTemporaryDirectory(prefix: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}
