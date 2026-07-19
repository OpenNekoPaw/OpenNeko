import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { registerWorkspaceBoardFunctionalAcceptance } from './workspaceBoardFunctionalAcceptance';

const vscodeMockState = vi.hoisted(() => {
  class MockUri {
    readonly scheme = 'file';

    private constructor(readonly fsPath: string) {}

    static file(filePath: string): MockUri {
      return new MockUri(filePath);
    }

    static parse(value: string): MockUri {
      return new MockUri(value.replace(/^file:\/\//u, ''));
    }

    toString(): string {
      return `file://${this.fsPath}`;
    }
  }

  const commands = new Map<string, (value: unknown) => Promise<unknown>>();
  const registerCommand = vi.fn(
    (command: string, callback: (value: unknown) => Promise<unknown>) => {
      commands.set(command, callback);
      return { dispose: () => commands.delete(command) };
    },
  );
  const readFile = vi.fn(async () => new TextEncoder().encode('<svg></svg>'));

  return { MockUri, commands, registerCommand, readFile };
});

vi.mock('vscode', () => ({
  Uri: vscodeMockState.MockUri,
  commands: { registerCommand: vscodeMockState.registerCommand },
  workspace: { fs: { readFile: vscodeMockState.readFile } },
}));

const COMMAND = 'neko.canvas.debug.exerciseWorkspaceBoardDelivery';
const ACTIVE_DOCUMENT = vscodeMockState.MockUri.file('/workspace/neko/boards/workspace.nkc');

describe('Workspace Board functional acceptance', () => {
  beforeEach(() => {
    vscodeMockState.commands.clear();
    vi.clearAllMocks();
  });

  it('uses a competing canonical coordinator for pending work and the editor owner to drain it', async () => {
    const whenEditorOwnerIdle = vi.fn(async () => undefined);
    const editorAcquire = vi.fn(async () => true);
    const competingEnqueue = vi.fn(async (request) => [
      {
        version: 2 as const,
        deliveryId: request.process.deliveryId,
        status: 'queued' as const,
        diagnostics: [],
      },
    ]);
    const editorFlush = vi.fn(async () => [
      {
        version: 2 as const,
        deliveryId: 'generated-output-batch:11p72lc',
        status: 'projected' as const,
        writerEpoch: 1,
        diagnostics: [],
      },
    ]);
    const options = createOptions({
      competingEnqueue,
      editorAcquire,
      editorFlush,
      whenEditorOwnerIdle,
    });
    registerWorkspaceBoardFunctionalAcceptance(options);

    const queued = await invoke({ action: 'enqueue-competing-host', sourceHost: 'tui' });
    expect(queued).toMatchObject({ status: 'queued' });
    expect(competingEnqueue).toHaveBeenCalledOnce();
    expect(editorAcquire).toHaveBeenCalledOnce();
    expect(competingEnqueue.mock.calls[0]?.[0]).toMatchObject({
      process: { sourceHost: 'tui', taskId: 'functional-workspace-board-task' },
      target: { workspaceId: 'workspace-id', workspaceUri: 'file:///workspace' },
    });

    const deliveryId = competingEnqueue.mock.calls[0]?.[0].process.deliveryId;
    editorFlush.mockResolvedValueOnce([
      {
        version: 2,
        deliveryId,
        status: 'projected',
        writerEpoch: 1,
        diagnostics: [],
      },
    ]);
    const projected = await invoke({ action: 'flush-editor-owner', sourceHost: 'tui' });
    expect(projected).toMatchObject({ status: 'projected', writerEpoch: 1 });
    expect(editorFlush).toHaveBeenCalledOnce();
    expect(whenEditorOwnerIdle).toHaveBeenCalledTimes(2);
  });

  it('returns the editor-owner conflict diagnostic without hiding it', async () => {
    const project = vi.fn(async (request) => ({
      version: 2 as const,
      deliveryId: request.process.deliveryId,
      status: 'conflict' as const,
      diagnostics: [
        {
          code: 'projection-conflict' as const,
          severity: 'error' as const,
          message: 'Workspace Board has user changes that cannot be overwritten safely.',
        },
      ],
    }));
    registerWorkspaceBoardFunctionalAcceptance(createOptions({ project }));

    await expect(
      invoke({
        action: 'project-editor-owner',
        sourceHost: 'vscode',
        assetId: 'functional-conflict-image',
        taskId: 'functional-conflict-task',
      }),
    ).resolves.toMatchObject({
      status: 'conflict',
      diagnostics: [{ code: 'projection-conflict' }],
    });
    expect(project).toHaveBeenCalledOnce();
  });

  it('can exercise a flat creative source relation in the real development Host', async () => {
    const project = vi.fn(async (request) => ({
      version: 2 as const,
      deliveryId: request.process.deliveryId,
      status: 'projected' as const,
      diagnostics: [],
    }));
    registerWorkspaceBoardFunctionalAcceptance(createOptions({ project }));

    await invoke({
      action: 'project-editor-owner',
      sourceHost: 'vscode',
      sourceTitle: 'Creative direction brief',
    });

    expect(project).toHaveBeenCalledOnce();
    const request = project.mock.calls[0]?.[0];
    expect(request.process.deliveryId).toMatch(/^functional-creative-batch:/u);
    expect(request.artifacts).toHaveLength(2);
    expect(request.artifacts[0]).toMatchObject({
      kind: 'markdown',
      title: 'Creative direction brief',
      provenance: { role: 'source' },
    });
    expect(request.artifacts[1]?.provenance.sourceArtifactIds).toEqual([
      request.artifacts[0]?.provenance.artifactId,
    ]);
  });

  it('can submit fallback and hashed observations of one fixture file', async () => {
    const project = vi.fn(async (request) => ({
      version: 2 as const,
      deliveryId: request.process.deliveryId,
      status: 'projected' as const,
      diagnostics: [],
    }));
    registerWorkspaceBoardFunctionalAcceptance(createOptions({ project }));

    await invoke({
      action: 'project-editor-owner',
      sourceHost: 'vscode',
      duplicateSourceFileRelativePath: 'neko/materials/source.epub',
    });

    const request = project.mock.calls[0]?.[0];
    expect(request.artifacts.slice(0, 2)).toMatchObject([
      {
        kind: 'file-reference',
        resourceRef: {
          locator: { kind: 'file', path: 'neko/materials/source.epub' },
          fingerprint: { strategy: 'none', value: 'neko/materials/source.epub' },
        },
      },
      {
        kind: 'file-reference',
        resourceRef: {
          locator: { kind: 'file', path: 'neko/materials/source.epub' },
          fingerprint: { strategy: 'hash', value: expect.stringMatching(/^sha256:/u) },
        },
      },
    ]);
  });
});

function createOptions(
  overrides: {
    readonly project?: ReturnType<typeof vi.fn>;
    readonly competingEnqueue?: ReturnType<typeof vi.fn>;
    readonly editorFlush?: ReturnType<typeof vi.fn>;
    readonly editorAcquire?: ReturnType<typeof vi.fn>;
    readonly whenEditorOwnerIdle?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const subscriptions: vscode.Disposable[] = [];
  return {
    context: { subscriptions },
    projector: {
      project:
        overrides.project ??
        vi.fn(async () => ({ version: 2, status: 'projected', diagnostics: [] })),
    },
    competingHostCoordinator: {
      enqueue: overrides.competingEnqueue ?? vi.fn(async () => []),
    },
    editorOwnerCoordinator: {
      acquireWriterOwnership: overrides.editorAcquire ?? vi.fn(async () => true),
      flush: overrides.editorFlush ?? vi.fn(async () => []),
    },
    whenEditorOwnerIdle: overrides.whenEditorOwnerIdle ?? vi.fn(async () => undefined),
    getWorkspaceId: () => 'workspace-id',
    getActiveDocumentUri: () => ACTIVE_DOCUMENT,
    revealDocument: vi.fn(async () => undefined),
  };
}

async function invoke(
  overrides: Partial<{
    readonly action: string;
    readonly sourceHost: string;
    readonly assetId: string;
    readonly taskId: string;
    readonly sourceTitle: string;
    readonly duplicateSourceFileRelativePath: string;
  }> = {},
): Promise<unknown> {
  const callback = vscodeMockState.commands.get(COMMAND);
  if (!callback) throw new Error(`Missing registered command ${COMMAND}`);
  return callback({
    action: 'enqueue-competing-host',
    sourceHost: 'tui',
    assetId: 'functional-generated-image',
    relativePath: 'neko/generated/image/station.svg',
    title: 'Station concept',
    mimeType: 'image/svg+xml',
    taskId: 'functional-workspace-board-task',
    generatedAt: '2026-07-15T00:00:00.000Z',
    width: 320,
    height: 180,
    ...overrides,
  });
}
