import { describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import { createEmptyCanvasData, planCanvasWorkspaceBoardProjection } from '@neko/canvas-domain';
import { NodeAuthorizedWorkspaceWriter } from '@neko/content-domain/node';
import type { DshWorkspaceBoardArtifactDeliveryInput } from '@neko/agent-runtime/application';
import type { LocalMetadataStore } from '@neko/local-metadata';
import { ConsoleLogger } from '@neko/shared/logger';
import {
  DesktopDshWorkspaceBoardDelivery,
  createDshWorkspaceBoardContentRead,
  createDshWorkspaceBoardProjectionRequest,
  publishDshDurableMarkdownArtifact,
  resolveDshDurableMarkdownArtifact,
  resolveDshWorkspaceBoardResourceFingerprints,
} from './desktop-dsh-workspace-board-delivery';
import { createElectronNekoHostPorts } from './electron-host-ports';

describe('Desktop DSH Workspace Board projection request', () => {
  it('uses a stable completed-Tool identity and reuses the durable file node by ContentLocator', () => {
    const input = deliveryInput('tool-1');
    const first = createDshWorkspaceBoardProjectionRequest(input, workspace());
    const replay = createDshWorkspaceBoardProjectionRequest(input, workspace());

    expect(first).toEqual(replay);
    expect(first.process.deliveryId).toMatch(/^dsh-tool:/u);
    expect(first.artifacts[0]).toMatchObject({
      kind: 'file-reference',
      contentLocator: { file: { authority: 'workspace', path: 'notes/analysis.md' } },
      provenance: { role: 'analysis' },
    });

    const projected = planCanvasWorkspaceBoardProjection(createEmptyCanvasData('Workspace'), first);
    const replayed = planCanvasWorkspaceBoardProjection(projected.canvasData, replay);
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

  it('uses distinct delivery identities for distinct Tool calls', () => {
    const first = createDshWorkspaceBoardProjectionRequest(deliveryInput('tool-1'), workspace());
    const second = createDshWorkspaceBoardProjectionRequest(deliveryInput('tool-2'), workspace());

    expect(first.process.deliveryId).not.toBe(second.process.deliveryId);
  });

  it('uses a stable terminal identity distinct from completed Tools and preserves Markdown type', () => {
    const base = deliveryInput('unused');
    const terminalInput = {
      ...base,
      delivery: { kind: 'completed-turn' as const },
      artifacts: base.artifacts.map((artifact) => ({
        ...artifact,
        mimeType: 'text/markdown' as const,
      })),
    } satisfies DshWorkspaceBoardArtifactDeliveryInput;
    const terminal = createDshWorkspaceBoardProjectionRequest(terminalInput, workspace());
    const tool = createDshWorkspaceBoardProjectionRequest(deliveryInput('tool-1'), workspace());

    expect(terminal.process.deliveryId).toMatch(/^dsh-turn:/u);
    expect(terminal.process.deliveryId).not.toBe(tool.process.deliveryId);
    expect(terminal.artifacts[0]).toMatchObject({ mimeType: 'text/markdown' });
  });

  it('resolves freshness for both source and explicitly authored artifacts', async () => {
    const resolved = await resolveDshWorkspaceBoardResourceFingerprints(deliveryInput('tool-1'), {
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

  it('projects to the exact Canvas admitted for the Turn', () => {
    const request = createDshWorkspaceBoardProjectionRequest(
      {
        ...deliveryInput('tool-1'),
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
    const contentRead = createDshWorkspaceBoardContentRead({
      workspacePath,
      documentEntryReader: {
        readEntry: async () => {
          throw new Error('Unexpected document entry read.');
        },
      },
    });
    const delivery = new DesktopDshWorkspaceBoardDelivery({
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
      createContentWriter: () =>
        new NodeAuthorizedWorkspaceWriter({ workspaceRoot: workspacePath }),
      createIdentity: () => 'identity-1',
    });

    try {
      await expect(
        delivery.deliver({ ...deliveryInput('tool-1'), canvasTurnTarget: target }),
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

  it('resolves document-entry ContentLocators through the canonical entry reader', async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), 'openneko-dsh-board-entry-'));
    const sourcePath = join(workspacePath, 'book.epub');
    await writeFile(sourcePath, 'container');
    const reader = createDshWorkspaceBoardContentRead({
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

  it('publishes Markdown once and preserves user edits when the record is delivered again', async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), 'openneko-dsh-markdown-'));
    const read = createDshWorkspaceBoardContentRead({
      workspacePath,
      documentEntryReader: {
        readEntry: async () => {
          throw new Error('Unexpected document entry read.');
        },
      },
    });
    const writer = new NodeAuthorizedWorkspaceWriter({ workspaceRoot: workspacePath });
    const input = {
      workspaceId: 'workspace-1',
      contentLocator: {
        file: {
          authority: 'workspace' as const,
          path: 'neko/generated/file/durable-analysis.md',
        },
      },
      markdown: '# Durable analysis\n\nResult.',
      contentFingerprint: 'markdown:durable',
    };

    await expect(
      publishDshDurableMarkdownArtifact(input, { writer, content: read }),
    ).resolves.toEqual({
      contentLocator: input.contentLocator,
      contentFingerprint: input.contentFingerprint,
    });
    await writeFile(
      join(workspacePath, input.contentLocator.file.path),
      '# User-edited analysis\n\nKeep this content.\n',
    );
    await expect(
      publishDshDurableMarkdownArtifact(input, { writer, content: read }),
    ).resolves.toEqual({
      contentLocator: input.contentLocator,
      contentFingerprint: input.contentFingerprint,
    });
    await expect(
      readFile(join(workspacePath, input.contentLocator.file.path), 'utf8'),
    ).resolves.toBe('# User-edited analysis\n\nKeep this content.\n');
  });

  it('keeps a durable Markdown reference available after the user edits the file', async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), 'openneko-dsh-markdown-resolve-'));
    const read = createDshWorkspaceBoardContentRead({
      workspacePath,
      documentEntryReader: {
        readEntry: async () => {
          throw new Error('Unexpected document entry read.');
        },
      },
    });
    const writer = new NodeAuthorizedWorkspaceWriter({ workspaceRoot: workspacePath });
    const input = {
      workspaceId: 'workspace-1',
      contentLocator: {
        file: {
          authority: 'workspace' as const,
          path: 'neko/generated/file/durable-analysis.md',
        },
      },
      markdown: '# Durable analysis\n\nResult.',
      contentFingerprint: 'sha256:durable',
    };
    const reference = {
      workspaceId: input.workspaceId,
      contentLocator: input.contentLocator,
    };

    await expect(resolveDshDurableMarkdownArtifact(reference, read)).resolves.toBeUndefined();
    await publishDshDurableMarkdownArtifact(input, { writer, content: read });
    await expect(resolveDshDurableMarkdownArtifact(reference, read)).resolves.toEqual({
      contentLocator: input.contentLocator,
    });
    await writeFile(
      join(workspacePath, input.contentLocator.file.path),
      '# User-edited analysis\n\nThe current Workspace contents remain authoritative.\n',
    );
    await expect(resolveDshDurableMarkdownArtifact(reference, read)).resolves.toEqual({
      contentLocator: input.contentLocator,
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

function deliveryInput(toolCallId: string): DshWorkspaceBoardArtifactDeliveryInput {
  return {
    workspaceId: 'workspace-1',
    conversationId: 'conversation-1',
    dshSessionId: 'dsh-1',
    turn: 1,
    createdAt: 1_000,
    canvasTurnTarget: {
      workspaceId: 'workspace-1',
      canvasId: 'neko/boards/workspace.nkc',
    },
    delivery: { kind: 'completed-tool' as const, toolCallId },
    artifacts: [
      {
        kind: 'file-reference' as const,
        artifactId: 'content:analysis',
        contentFingerprint: 'locator:analysis',
        role: 'analysis' as const,
        title: 'analysis.md',
        sourceId: 'content:analysis',
        contentLocator: {
          file: { authority: 'workspace' as const, path: 'notes/analysis.md' },
        },
      },
    ],
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
