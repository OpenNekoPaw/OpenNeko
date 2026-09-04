import { describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import { createEmptyCanvasData, planCanvasArtifactProjection } from '@neko/canvas-domain';
import type { DshCanvasArtifactDeliveryInput } from '@neko/agent-runtime/application';
import type { LocalMetadataStore } from '@neko/local-metadata';
import type { GenerationJobSnapshot } from '@neko/generation-domain/job';
import { ConsoleLogger } from '@neko/shared/logger';
import {
  DesktopDshCanvasArtifactDelivery,
  createDshCanvasArtifactContentRead,
  createDshCanvasArtifactProjectionRequest,
  resolveDshCanvasArtifactResourceFingerprints,
} from './desktop-dsh-canvas-artifact-delivery';
import { createElectronNekoHostPorts } from './electron-host-ports';

describe('Desktop DSH Canvas projection request', () => {
  it('uses a stable completed-Tool identity and reuses the durable file node by ContentLocator', () => {
    const input = deliveryInput();
    const first = createDshCanvasArtifactProjectionRequest(input, workspace());
    const replay = createDshCanvasArtifactProjectionRequest(input, workspace());

    expect(first).toEqual(replay);
    expect(first.process.deliveryId).toMatch(/^dsh-tool:/u);
    expect(first.artifacts[0]).toMatchObject({
      kind: 'file-reference',
      contentLocator: { file: { authority: 'workspace', path: 'notes/analysis.md' } },
      provenance: { role: 'source' },
    });

    const projected = planCanvasArtifactProjection(createEmptyCanvasData('Workspace'), first);
    const replayed = planCanvasArtifactProjection(projected.canvasData, replay);
    expect(projected.status).toBe('projected');
    expect(projected.canvasData.nodes).toEqual([
      expect.objectContaining({
        type: 'file',
        data: expect.objectContaining({
          contentLocator: { file: { authority: 'workspace', path: 'notes/analysis.md' } },
        }),
      }),
    ]);
    expect(replayed.status).toBe('noop');
    expect(replayed.canvasData.nodes).toHaveLength(1);
  });

  it('uses distinct delivery identities for distinct turns', () => {
    const first = createDshCanvasArtifactProjectionRequest(deliveryInput(1), workspace());
    const second = createDshCanvasArtifactProjectionRequest(deliveryInput(2), workspace());

    expect(first.process.deliveryId).not.toBe(second.process.deliveryId);
  });

  it('preserves accepted evidence relations in one Tool projection', () => {
    const base = deliveryInput();
    const sourceId = 'content:source';
    const request = createDshCanvasArtifactProjectionRequest(
      {
        ...base,
        artifacts: [
          {
            kind: 'file-reference',
            artifactId: sourceId,
            contentFingerprint: 'locator:source',
            role: 'source',
            title: 'book.epub',
            sourceId,
            contentLocator: {
              file: { authority: 'workspace', path: 'books/book.epub' },
            },
          },
          {
            ...base.artifacts[0]!,
            sourceArtifactIds: [sourceId],
          },
        ],
      },
      workspace(),
    );

    expect(request.artifacts[1]).toMatchObject({
      provenance: { sourceArtifactIds: [sourceId] },
    });
    const projected = planCanvasArtifactProjection(createEmptyCanvasData('Workspace'), request);
    expect(projected.status).toBe('projected');
    expect(projected.canvasData.nodes).toHaveLength(2);
    expect(projected.canvasData.connections).toHaveLength(1);
  });

  it('resolves freshness for both source and explicitly authored artifacts', async () => {
    const resolved = await resolveDshCanvasArtifactResourceFingerprints(deliveryInput(), {
      stat: async (locator) => ({
        status: 'ready',
        locator,
        byteLength: 42,
        fingerprint: { strategy: 'sha256', value: 'document-content' },
      }),
    });

    expect(resolved.artifacts[0]).toMatchObject({
      contentFingerprint: 'content:sha256:document-content',
      contentLocator: { file: { authority: 'workspace', path: 'notes/analysis.md' } },
    });
  });

  it('rejects an unavailable evidence member without returning a partial batch', async () => {
    const base = deliveryInput();
    const input: DshCanvasArtifactDeliveryInput = {
      ...base,
      artifacts: [
        base.artifacts[0]!,
        {
          ...base.artifacts[0]!,
          artifactId: 'content:selected-image',
          sourceId: 'content:selected-image',
          kind: 'image',
          role: 'source',
          title: 'selected.jpg',
          contentLocator: {
            file: { authority: 'workspace', path: 'book.epub' },
            selector: { kind: 'entry', path: 'images/selected.jpg' },
          },
        },
      ],
    };

    await expect(
      resolveDshCanvasArtifactResourceFingerprints(input, {
        stat: async (locator) =>
          locator.selector === undefined
            ? {
                status: 'ready',
                locator,
                byteLength: 42,
                fingerprint: { strategy: 'sha256', value: 'document-content' },
              }
            : {
                status: 'unavailable',
                locator,
                diagnostic: {
                  code: 'content-missing',
                  message: 'Selected evidence is missing.',
                },
              },
      }),
    ).rejects.toThrow('DSH Canvas source is unavailable: content-missing');
  });

  it('projects to the exact Canvas admitted for the Turn', () => {
    const request = createDshCanvasArtifactProjectionRequest(
      {
        ...deliveryInput(),
        canvasTurnTarget: {
          workspaceId: 'workspace-1',
          canvasId: 'neko/boards/story.nkc',
        },
      },
      workspace(),
    );

    expect(request.target.documentUri).toBe('file:///tmp/openneko-workspace/neko/boards/story.nkc');
  });

  it('coordinates delivery against the exact Canvas target admitted for the Turn', async () => {
    const home = await mkdtemp(join(tmpdir(), 'openneko-dsh-exact-canvas-delivery-'));
    const workspacePath = join(home, 'workspace');
    const canvasPath = join(workspacePath, 'neko', 'boards', 'story.nkc');
    await mkdir(join(workspacePath, 'notes'), { recursive: true });
    await mkdir(join(workspacePath, 'neko', 'boards'), { recursive: true });
    await writeFile(join(workspacePath, 'notes', 'analysis.md'), '# Analysis');
    await writeFile(
      canvasPath,
      JSON.stringify({
        name: 'Story',
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        nodes: [],
        connections: [],
      }),
    );
    const metadataStore = createInMemoryMetadataStore();
    const target = {
      workspaceId: 'workspace-1',
      canvasId: 'neko/boards/story.nkc',
    };
    const coordinateTarget = vi.fn();
    const host = createElectronNekoHostPorts({
      homedir: home,
      nekoHome: join(home, '.neko'),
      workspaceRoot: workspacePath,
      logger: new ConsoleLogger('DesktopDshExactCanvasDeliveryTest'),
    });
    const contentRead = createDshCanvasArtifactContentRead({
      workspacePath,
      documentEntryReader: {
        readEntry: async () => {
          throw new Error('Unexpected document entry read.');
        },
      },
    });
    const delivery = new DesktopDshCanvasArtifactDelivery({
      applicationInstanceId: 'app-1',
      metadataStore,
      workspaceRegistry: {
        restore: vi.fn(async () => ({
          workspaceId: 'workspace-1',
          workspacePath,
          displayName: 'Workspace',
          locator: { kind: 'relative' as const, value: 'workspace' },
        })),
      },
      host,
      coordinateCanvasMutation: async (actualTarget, operation) => {
        coordinateTarget(actualTarget);
        return operation();
      },
      createContentRead: () => contentRead,
      createIdentity: () => 'identity-1',
    });

    try {
      await expect(
        delivery.deliver({ ...deliveryInput(), canvasTurnTarget: target }),
      ).resolves.toEqual({ status: 'accepted' });
      expect(coordinateTarget).toHaveBeenCalledWith(target);
      expect(JSON.parse(await readFile(canvasPath, 'utf8')).nodes).toEqual([
        expect.objectContaining({
          type: 'file',
          data: expect.objectContaining({
            contentLocator: { file: { authority: 'workspace', path: 'notes/analysis.md' } },
          }),
        }),
      ]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it('persists Agent generation inputs as visible Canvas references', async () => {
    const home = await mkdtemp(join(tmpdir(), 'openneko-dsh-generation-reference-'));
    const workspacePath = join(home, 'workspace');
    const canvasPath = join(workspacePath, 'neko', 'boards', 'story.nkc');
    await mkdir(join(workspacePath, 'neko', 'boards'), { recursive: true });
    await mkdir(join(workspacePath, 'neko', 'generated', 'image'), { recursive: true });
    await writeFile(join(workspacePath, 'neko', 'generated', 'image', 'first-frame.png'), 'image');
    await writeFile(
      canvasPath,
      JSON.stringify({
        name: 'Story',
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        nodes: [],
        connections: [],
      }),
    );
    const metadataStore = createInMemoryMetadataStore();
    const target = { workspaceId: 'workspace-1', canvasId: 'neko/boards/story.nkc' };
    const host = createElectronNekoHostPorts({
      homedir: home,
      nekoHome: join(home, '.neko'),
      workspaceRoot: workspacePath,
      logger: new ConsoleLogger('DesktopDshGenerationReferenceTest'),
    });
    const delivery = new DesktopDshCanvasArtifactDelivery({
      applicationInstanceId: 'app-1',
      metadataStore,
      workspaceRegistry: {
        restore: vi.fn(async () => ({
          workspaceId: 'workspace-1',
          workspacePath,
          displayName: 'Workspace',
          locator: { kind: 'relative' as const, value: 'workspace' },
        })),
      },
      host,
      coordinateCanvasMutation: async (_target, operation) => operation(),
      createContentRead: () => {
        throw new Error('Generation reference projection must not bypass Canvas content identity.');
      },
      createIdentity: () => 'identity-1',
    });

    try {
      await expect(
        delivery.projectGenerationJob({
          workspaceId: 'workspace-1',
          dshSessionId: 'dsh-1',
          turn: 1,
          toolCallId: 'generation-1',
          canvasTurnTarget: target,
          snapshot: imageToVideoSnapshot(),
        }),
      ).resolves.toEqual({ status: 'accepted' });
      const canvas = JSON.parse(await readFile(canvasPath, 'utf8'));
      const generation = canvas.nodes.find((node: { type: string }) => node.type === 'generation');
      const source = canvas.nodes.find((node: { type: string }) => node.type === 'media');
      expect(source).toMatchObject({
        data: {
          mediaType: 'image',
          contentLocator: {
            file: {
              authority: 'workspace',
              path: 'neko/generated/image/first-frame.png',
            },
          },
        },
      });
      expect(canvas.connections).toEqual([
        expect.objectContaining({
          sourceId: source.id,
          targetId: generation.id,
          type: 'reference',
          targetEndpoint: { nodeId: generation.id, scope: 'port', portId: 'reference' },
        }),
      ]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it('resolves document-entry ContentLocators through the canonical entry reader', async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), 'openneko-dsh-canvas-entry-'));
    const sourcePath = join(workspacePath, 'book.epub');
    await writeFile(sourcePath, 'container');
    const reader = createDshCanvasArtifactContentRead({
      workspacePath,
      documentEntryReader: {
        readEntry: async (actualSourcePath, entryPath) => {
          expect(actualSourcePath).toBe(sourcePath);
          expect(entryPath).toBe('images/page-1.jpg');
          return new Uint8Array([1, 2, 3]);
        },
      },
    });
    const locator = {
      file: { authority: 'workspace' as const, path: 'book.epub' },
      selector: { kind: 'entry' as const, path: 'images/page-1.jpg' },
    };

    await expect(reader.stat(locator)).resolves.toMatchObject({
      status: 'ready',
      locator,
      byteLength: 3,
      fingerprint: { strategy: 'sha256' },
    });
  });
});

function workspace(): AssetWorkspaceResolution {
  return {
    workspaceId: 'workspace-1',
    workspacePath: '/tmp/openneko-workspace',
    displayName: 'Workspace',
    locator: { kind: 'relative', value: 'openneko-workspace' },
  };
}

function deliveryInput(turn = 1): DshCanvasArtifactDeliveryInput {
  return {
    workspaceId: 'workspace-1',
    conversationId: 'conversation-1',
    dshSessionId: 'dsh-1',
    turn,
    createdAt: 1_000,
    canvasTurnTarget: {
      workspaceId: 'workspace-1',
      canvasId: 'neko/boards/workspace.nkc',
    },
    delivery: { kind: 'completed-tool' as const, toolCallId: 'document-1' },
    artifacts: [
      {
        kind: 'file-reference' as const,
        artifactId: 'content:analysis',
        contentFingerprint: 'locator:analysis',
        role: 'source' as const,
        title: 'analysis.md',
        sourceId: 'content:analysis',
        contentLocator: {
          file: { authority: 'workspace' as const, path: 'notes/analysis.md' },
        },
      },
    ],
  };
}

function imageToVideoSnapshot(): GenerationJobSnapshot {
  return {
    ref: { kind: 'generation', jobId: 'generation-video-1' },
    phase: 'running',
    createdAt: 1,
    updatedAt: 2,
    lifecycleMode: 'linked',
    request: {
      providerId: 'minimax-provider',
      modelId: 'minimax-h3',
      generationType: 'image-to-video',
      request: {
        prompt: 'Slowly push into the megastructure',
        duration: 6,
        resolution: '768P',
        aspectRatio: '16:9',
        inputs: [
          {
            type: 'image',
            role: 'first-frame',
            locator: {
              file: {
                authority: 'workspace',
                path: 'neko/generated/image/first-frame.png',
              },
            },
          },
        ],
      },
    },
    progress: { stage: 'waiting-provider', percent: 25 },
  };
}

function createInMemoryMetadataStore(): LocalMetadataStore {
  const records = new Map<string, Record<string, unknown>>();
  const repositories = {
    tasks: {
      async get(workspaceId: string, taskKey: string) {
        return records.get(JSON.stringify([workspaceId, taskKey]));
      },
      async list(input: { readonly workspaceId: string; readonly statuses?: readonly string[] }) {
        return [...records.values()].filter(
          (record) =>
            record['workspaceId'] === input.workspaceId &&
            (!input.statuses || input.statuses.includes(String(record['status']))),
        );
      },
      async upsert(record: Record<string, unknown>) {
        records.set(
          JSON.stringify([record['workspaceId'], record['taskKey']]),
          structuredClone(record),
        );
      },
      async delete(workspaceId: string, taskKey: string) {
        records.delete(JSON.stringify([workspaceId, taskKey]));
      },
    },
    taskCheckpoints: {
      upsert: async () => undefined,
      delete: async () => undefined,
    },
  };
  return {
    repositories,
    transaction: async (
      _options: unknown,
      operation: (context: { readonly repositories: typeof repositories }) => Promise<unknown>,
    ) => operation({ repositories }),
  } as never;
}
