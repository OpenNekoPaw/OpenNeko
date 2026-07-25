import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
  createEmptyCanvasData,
  loadNkc,
  planCanvasWorkspaceBoardProjection,
  saveNkc,
  type CanvasWorkspaceProjectionRequest,
  type ResourceRef,
} from '@neko/shared';
import { CanvasProjectAuthoringService } from './canvasProjectAuthoringService';
import { createCanvasWorkspaceBoardRevision } from '@neko-canvas/domain';
import * as vscode from 'vscode';

const vscodeMockState = vi.hoisted(() => {
  class MockUri {
    scheme: string;
    fsPath: string;

    private constructor(fsPath: string, scheme = 'file') {
      this.fsPath = fsPath;
      this.scheme = scheme;
    }

    static file(filePath: string): MockUri {
      return new MockUri(filePath);
    }

    static parse(value: string): MockUri {
      if (value.startsWith('file://')) {
        return new MockUri(value.slice('file://'.length), 'file');
      }
      return new MockUri(value, 'file');
    }

    toString(): string {
      return this.scheme === 'file' ? `file://${this.fsPath}` : `${this.scheme}:${this.fsPath}`;
    }
  }

  const files = new Map<string, Uint8Array>();
  const executeCommand = vi.fn();
  const readFile = vi.fn(async (uri: MockUri) => {
    const content = files.get(uri.fsPath);
    if (!content) {
      throw new Error(`ENOENT: ${uri.fsPath}`);
    }
    return content;
  });
  const writeFile = vi.fn(async (uri: MockUri, content: Uint8Array) => {
    files.set(uri.fsPath, content);
  });
  const stat = vi.fn(async (uri: MockUri) => {
    if (!files.has(uri.fsPath)) {
      const error = new Error(`ENOENT: ${uri.fsPath}`);
      Reflect.set(error, 'code', 'ENOENT');
      throw error;
    }
    return { type: 1 };
  });
  const rename = vi.fn(async (from: MockUri, to: MockUri) => {
    const content = files.get(from.fsPath);
    if (!content) {
      throw new Error(`ENOENT: ${from.fsPath}`);
    }
    files.set(to.fsPath, content);
    files.delete(from.fsPath);
  });
  const deleteFile = vi.fn(async (uri: MockUri) => {
    files.delete(uri.fsPath);
  });
  const createDirectory = vi.fn(async () => undefined);

  return {
    MockUri,
    files,
    executeCommand,
    readFile,
    writeFile,
    stat,
    rename,
    deleteFile,
    createDirectory,
  };
});

vi.mock('vscode', () => ({
  Uri: vscodeMockState.MockUri,
  workspace: {
    workspaceFolders: [
      {
        uri: vscodeMockState.MockUri.file('/workspace/project'),
        name: 'project',
        index: 0,
      },
    ],
    fs: {
      readFile: vscodeMockState.readFile,
      writeFile: vscodeMockState.writeFile,
      stat: vscodeMockState.stat,
      rename: vscodeMockState.rename,
      delete: vscodeMockState.deleteFile,
      createDirectory: vscodeMockState.createDirectory,
    },
  },
  commands: {
    executeCommand: vscodeMockState.executeCommand,
  },
}));

function readJsonFile(filePath: string): unknown {
  const content = vscodeMockState.files.get(filePath);
  if (!content) {
    throw new Error(`Missing test file ${filePath}`);
  }
  return JSON.parse(new TextDecoder().decode(content)) as unknown;
}

function createProvider(activeUri?: vscode.Uri) {
  return {
    getActiveCanvasDocumentUri: vi.fn(() => activeUri),
    getOpenCanvasDocumentSnapshot: vi.fn<
      (
        documentUri: string,
      ) =>
        | { readonly canvasData: ReturnType<typeof createEmptyCanvasData>; readonly dirty: boolean }
        | undefined
    >(() => undefined),
    applyHostCanvasData: vi.fn(),
    revealCanvasDocument: vi.fn(),
  };
}

const generatedRef: ResourceRef = {
  id: 'generated-output:shot-1',
  scope: 'project',
  provider: 'generated-output',
  kind: 'generated',
  source: {
    kind: 'generated-asset',
    generatedAssetId: 'shot-1',
    projectRelativePath: 'neko/generated/image/shot-1.png',
  },
  locator: { kind: 'generated-asset', assetId: 'shot-1' },
  fingerprint: { strategy: 'hash', value: 'sha256:shot-1' },
};

function workspaceProjectionRequest(): CanvasWorkspaceProjectionRequest {
  return {
    version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
    target: { workspaceId: 'workspace-1', workspaceUri: 'file:///workspace/project/' },
    process: {
      deliveryId: 'delivery:shot-1',
      sourceHost: 'vscode',
      runId: 'run-1',
      taskId: 'task-1',
      createdAt: '2026-07-15T00:00:00.000Z',
    },
    artifacts: [
      {
        kind: 'image',
        title: 'Shot 1',
        mimeType: 'image/png',
        resourceRef: generatedRef,
        provenance: {
          version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
          deliveryId: 'delivery:shot-1',
          artifactId: 'shot-1',
          revision: 'generated:sha256:shot-1',
          kind: 'image',
          role: 'output',
          sourceId: 'generated-output:shot-1',
          taskId: 'task-1',
          createdAt: '2026-07-15T00:00:00.000Z',
        },
      },
    ],
  };
}

describe('CanvasProjectAuthoringService', () => {
  beforeEach(() => {
    vscodeMockState.files.clear();
    vscodeMockState.executeCommand.mockClear();
    vscodeMockState.readFile.mockClear();
    vscodeMockState.writeFile.mockClear();
    vscodeMockState.stat.mockClear();
    vscodeMockState.rename.mockClear();
    vscodeMockState.deleteFile.mockClear();
    vscodeMockState.createDirectory.mockClear();
  });

  it('creates and projects the canonical Workspace Board without an open Webview', async () => {
    const provider = createProvider();
    provider.getActiveCanvasDocumentUri.mockImplementation(() => {
      throw new Error('active Canvas fallback must not be called');
    });
    const service = new CanvasProjectAuthoringService({
      context: { subscriptions: [] } as never,
      canvasEditorProvider: provider,
    });

    const documentUri = 'file:///workspace/project/neko/boards/workspace.nkc';
    const loaded = await service.loadLatest({ documentUri, createIfMissing: true });
    const planned = planCanvasWorkspaceBoardProjection(
      loaded.canvasData,
      workspaceProjectionRequest(),
    );
    const result = await service.saveAtomic({
      documentUri,
      expectedRevision: loaded.revision,
      canvasData: planned.canvasData,
    });

    expect(result).toMatchObject({
      revision: expect.stringMatching(/^nkc:/),
    });
    expect(vscodeMockState.writeFile).toHaveBeenCalled();
    expect(provider.getActiveCanvasDocumentUri).not.toHaveBeenCalled();
    const reopened = loadNkc(
      new TextDecoder().decode(
        vscodeMockState.files.get('/workspace/project/neko/boards/workspace.nkc'),
      ),
    );
    expect(reopened.validation.valid).toBe(true);
    expect(reopened.data.nodes.map((node) => node.type)).toEqual(['media']);
    expect(provider.applyHostCanvasData).toHaveBeenLastCalledWith(
      expect.objectContaining({ fsPath: '/workspace/project/neko/boards/workspace.nkc' }),
      expect.objectContaining({ nodes: expect.any(Array) }),
    );
  });

  it('projects through the clean opened Workspace Board editor snapshot', async () => {
    const documentUri = 'file:///workspace/project/neko/boards/workspace.nkc';
    const openedCanvas = createEmptyCanvasData('Opened Workspace Board');
    const provider = createProvider();
    provider.getOpenCanvasDocumentSnapshot.mockReturnValue({
      canvasData: openedCanvas,
      dirty: false,
    });
    const service = new CanvasProjectAuthoringService({
      context: { subscriptions: [] } as never,
      canvasEditorProvider: provider,
    });

    const loaded = await service.loadLatest({ documentUri, createIfMissing: true });
    const planned = planCanvasWorkspaceBoardProjection(
      loaded.canvasData,
      workspaceProjectionRequest(),
    );
    await service.saveAtomic({
      documentUri,
      expectedRevision: loaded.revision,
      canvasData: planned.canvasData,
    });

    expect(provider.getOpenCanvasDocumentSnapshot).toHaveBeenCalledWith(documentUri);
    expect(provider.applyHostCanvasData).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: '/workspace/project/neko/boards/workspace.nkc' }),
      planned.canvasData,
    );
  });

  it('keeps unsaved opened Workspace Board edits untouched', async () => {
    const documentUri = 'file:///workspace/project/neko/boards/workspace.nkc';
    const dirtyCanvas = createEmptyCanvasData('Unsaved user Board');
    const persistedCanvas = createEmptyCanvasData('Persisted Board');
    vscodeMockState.files.set(
      '/workspace/project/neko/boards/workspace.nkc',
      new TextEncoder().encode(saveNkc(persistedCanvas)),
    );
    const provider = createProvider();
    provider.getOpenCanvasDocumentSnapshot.mockReturnValue({
      canvasData: dirtyCanvas,
      dirty: true,
    });
    const service = new CanvasProjectAuthoringService({
      context: { subscriptions: [] } as never,
      canvasEditorProvider: provider,
    });

    await expect(service.loadLatest({ documentUri, createIfMissing: true })).rejects.toThrow(
      'projection-conflict',
    );

    const reopened = loadNkc(
      new TextDecoder().decode(
        vscodeMockState.files.get('/workspace/project/neko/boards/workspace.nkc'),
      ),
    );
    expect(reopened.data).toEqual(persistedCanvas);
    expect(vscodeMockState.writeFile).not.toHaveBeenCalled();
    expect(provider.applyHostCanvasData).not.toHaveBeenCalled();
  });

  it('rejects a stale opened Workspace Board revision before writing or applying editor data', async () => {
    const documentUri = 'file:///workspace/project/neko/boards/workspace.nkc';
    const openedCanvas = createEmptyCanvasData('Current opened Board');
    const provider = createProvider();
    provider.getOpenCanvasDocumentSnapshot.mockReturnValue({
      canvasData: openedCanvas,
      dirty: false,
    });
    const service = new CanvasProjectAuthoringService({
      context: { subscriptions: [] } as never,
      canvasEditorProvider: provider,
    });

    await expect(
      service.saveAtomic({
        documentUri,
        expectedRevision: 'nkc:stale-revision',
        canvasData: createEmptyCanvasData('Rejected projection'),
      }),
    ).rejects.toThrow('stale-revision');
    expect(vscodeMockState.writeFile).not.toHaveBeenCalled();
    expect(provider.applyHostCanvasData).not.toHaveBeenCalled();
  });

  it('does not overwrite an invalid existing Workspace Board', async () => {
    const documentPath = '/workspace/project/neko/boards/workspace.nkc';
    const invalidBytes = new TextEncoder().encode('{"version":999,"nodes":[]}');
    vscodeMockState.files.set(documentPath, invalidBytes);
    const provider = createProvider();
    const service = new CanvasProjectAuthoringService({
      context: { subscriptions: [] } as never,
      canvasEditorProvider: provider,
    });

    await expect(
      service.loadLatest({
        documentUri: `file://${documentPath}`,
        createIfMissing: true,
      }),
    ).rejects.toThrow('Failed to load Canvas document');
    expect(vscodeMockState.files.get(documentPath)).toEqual(invalidBytes);
    expect(provider.applyHostCanvasData).not.toHaveBeenCalled();
  });

  it('creates a new nkc file without revealing a Webview when no active target exists', async () => {
    const provider = createProvider();
    const service = new CanvasProjectAuthoringService({
      context: { subscriptions: [] } as never,
      canvasEditorProvider: provider,
    });

    const result = await service.createComposite({
      fallbackTitle: 'Headless Draft',
      request: {
        containerType: 'group',
        data: { label: 'Headless Draft' },
        children: [{ type: 'markdown', data: { content: 'First section' } }],
      },
    });

    expect(result.containerId).toBeDefined();
    expect(provider.revealCanvasDocument).not.toHaveBeenCalled();
    expect(vscodeMockState.executeCommand).not.toHaveBeenCalled();
    const saved = readJsonFile('/workspace/project/Headless Draft.nkc') as {
      nodes?: unknown[];
    };
    expect(saved.nodes).toHaveLength(2);
    const reopened = loadNkc(
      new TextDecoder().decode(vscodeMockState.files.get('/workspace/project/Headless Draft.nkc')),
    );
    expect(reopened.validation.valid).toBe(true);
    expect(reopened.data.nodes).toHaveLength(2);
    expect(provider.applyHostCanvasData).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: '/workspace/project/Headless Draft.nkc' }),
      expect.objectContaining({ nodes: expect.any(Array) }),
    );
  });

  it('applies an atomic operation batch through project-file persistence', async () => {
    const provider = createProvider();
    const service = new CanvasProjectAuthoringService({
      context: { subscriptions: [] } as never,
      canvasEditorProvider: provider,
    });

    const result = await service.applyOperations({
      fallbackTitle: 'Atomic Batch',
      operations: [
        {
          kind: 'node.create',
          node: {
            id: 'markdown-atomic-1',
            type: 'markdown',
            position: { x: 42, y: 64 },
            size: { width: 260, height: 120 },
            zIndex: 1,
            data: {
              content: 'Atomic host-authored note',
            },
          },
        },
      ],
    });

    expect(result.documentUri).toBe('file:///workspace/project/Atomic Batch.nkc');
    expect(result.projectRef).toMatchObject({
      domain: 'canvas',
      documentUri: 'file:///workspace/project/Atomic Batch.nkc',
      projectRevision: expect.stringMatching(/^nkc:/),
      contentDigest: expect.any(String),
    });
    expect(result.canvasData?.nodes).toHaveLength(1);
    const reopened = loadNkc(
      new TextDecoder().decode(vscodeMockState.files.get('/workspace/project/Atomic Batch.nkc')),
    );
    expect(reopened.validation.valid).toBe(true);
    expect(reopened.data.nodes[0]).toMatchObject({
      id: 'markdown-atomic-1',
      type: 'markdown',
      data: { content: 'Atomic host-authored note' },
    });
  });

  it('imports a workspace asset as a headless media node with stable project identity', async () => {
    const provider = createProvider();
    const service = new CanvasProjectAuthoringService({
      context: { subscriptions: [] } as never,
      canvasEditorProvider: provider,
    });

    const result = await service.importAsset({
      asset: {
        path: '/workspace/project/assets/plate.png',
        type: 'image',
        name: 'plate.png',
      },
    });

    expect(result).toMatchObject({
      documentUri: 'file:///workspace/project/plate.nkc',
      mediaType: 'image',
    });
    const reopened = loadNkc(
      new TextDecoder().decode(vscodeMockState.files.get('/workspace/project/plate.nkc')),
    );
    expect(reopened.validation.valid).toBe(true);
    expect(reopened.data.nodes[0]).toMatchObject({
      type: 'media',
      data: {
        assetPath: '${WORKSPACE}/assets/plate.png',
        mediaType: 'image',
      },
    });
    expect(JSON.stringify(reopened.data)).not.toContain('/workspace/project/assets/plate.png');
  });

  it('imports a document resource as a headless media node without runtime paths', async () => {
    const provider = createProvider();
    const service = new CanvasProjectAuthoringService({
      context: { subscriptions: [] } as never,
      canvasEditorProvider: provider,
    });

    const result = await service.importAsset({
      fallbackTitle: 'Document Page',
      asset: {
        type: 'image',
        documentResourceRef: {
          kind: 'document-entry',
          source: {
            filePath: '${WORKSPACE}/books/demo.epub',
            format: 'epub',
          },
          entryPath: 'OPS/page-001.jpg',
        },
      },
    });

    expect(result.documentUri).toBe('file:///workspace/project/Document Page.nkc');
    const reopened = loadNkc(
      new TextDecoder().decode(vscodeMockState.files.get('/workspace/project/Document Page.nkc')),
    );
    expect(reopened.validation.valid).toBe(true);
    expect(reopened.data.nodes[0]).toMatchObject({
      type: 'media',
      data: {
        assetPath: '',
        documentResourceRef: expect.objectContaining({
          kind: 'document-entry',
          entryPath: 'OPS/page-001.jpg',
        }),
      },
    });
    expect(JSON.stringify(reopened.data)).not.toContain('runtimeAssetPath');
  });

  it('writes the active Canvas document when one is selected', async () => {
    const activeUri = vscode.Uri.file('/workspace/project/Active.nkc');
    vscodeMockState.files.set(
      activeUri.fsPath,
      new TextEncoder().encode(saveNkc(createEmptyCanvasData('Active'))),
    );
    const provider = createProvider(activeUri);
    const service = new CanvasProjectAuthoringService({
      context: { subscriptions: [] } as never,
      canvasEditorProvider: provider,
    });

    const result = await service.createNode({
      node: {
        type: 'markdown',
        position: { x: 12, y: 34 },
        data: { content: 'host-authored' },
      },
    });

    expect(result.documentUri).toBe('file:///workspace/project/Active.nkc');
    expect(result.nodeId).toBeDefined();
    const saved = readJsonFile('/workspace/project/Active.nkc') as {
      nodes?: Array<{ type?: string }>;
    };
    expect(saved.nodes?.[0]?.type).toBe('markdown');
    expect(vscodeMockState.files.has('/workspace/project/Agent Canvas.nkc')).toBe(false);
  });

  it('writes an explicit document target instead of the active Canvas document', async () => {
    const activeUri = vscode.Uri.file('/workspace/project/Active.nkc');
    const explicitUri = vscode.Uri.file('/workspace/project/Explicit.nkc');
    const workspaceBoardUri = vscode.Uri.file('/workspace/project/neko/boards/workspace.nkc');
    const explicitData = createEmptyCanvasData('Explicit');
    vscodeMockState.files.set(
      activeUri.fsPath,
      new TextEncoder().encode(saveNkc(createEmptyCanvasData('Active'))),
    );
    vscodeMockState.files.set(explicitUri.fsPath, new TextEncoder().encode(saveNkc(explicitData)));
    const workspaceBoardBytes = new TextEncoder().encode(saveNkc(createEmptyCanvasData('Board')));
    vscodeMockState.files.set(workspaceBoardUri.fsPath, workspaceBoardBytes);
    const provider = createProvider(activeUri);
    const service = new CanvasProjectAuthoringService({
      context: { subscriptions: [] } as never,
      canvasEditorProvider: provider,
    });

    const result = await service.createNode({
      target: {
        documentUri: explicitUri.toString(),
        expectedRevision: createCanvasWorkspaceBoardRevision(explicitData),
      },
      node: {
        type: 'markdown',
        position: { x: 1, y: 2 },
        data: { content: 'explicit-target' },
      },
    });

    expect(result.documentUri).toBe('file:///workspace/project/Explicit.nkc');
    const explicit = loadNkc(
      new TextDecoder().decode(vscodeMockState.files.get(explicitUri.fsPath)),
    );
    const active = loadNkc(new TextDecoder().decode(vscodeMockState.files.get(activeUri.fsPath)));
    expect(explicit.data.nodes).toHaveLength(1);
    expect(active.data.nodes).toHaveLength(0);
    expect(vscodeMockState.files.get(workspaceBoardUri.fsPath)).toEqual(workspaceBoardBytes);
  });

  it('reveals the target only after a successful save when requested', async () => {
    const provider = createProvider();
    const service = new CanvasProjectAuthoringService({
      context: { subscriptions: [] } as never,
      canvasEditorProvider: provider,
    });

    await service.createNode({
      target: { kind: 'new', title: 'Reveal Target', reveal: true },
      node: {
        type: 'markdown',
        data: { content: 'show after save' },
      },
    });

    expect(provider.revealCanvasDocument).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: '/workspace/project/Reveal Target.nkc' }),
    );
    expect(vscodeMockState.writeFile.mock.invocationCallOrder[0]).toBeLessThan(
      provider.revealCanvasDocument.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it('applies Agent content as durable nkc facts without a Webview executor', async () => {
    const provider = createProvider();
    const service = new CanvasProjectAuthoringService({
      context: { subscriptions: [] } as never,
      canvasEditorProvider: {
        ...provider,
        createComposite: vi.fn(() => {
          throw new Error('legacy Webview executor must not be used');
        }),
      } as never,
    });

    const result = await service.applyAgentContent({
      fallbackTitle: 'Agent Content',
      payload: {
        kind: 'text',
        text: '## Review note',
        format: 'markdown',
        target: { insertionPoint: { x: 20, y: 30 }, mode: 'insert' },
      },
    });

    expect(result.changed).toBe(true);
    expect(result.createdNodeIds).toHaveLength(1);
    const reopened = loadNkc(
      new TextDecoder().decode(vscodeMockState.files.get('/workspace/project/Agent Content.nkc')),
    );
    expect(reopened.validation.valid).toBe(true);
    expect(reopened.data.nodes[0]).toMatchObject({
      type: 'markdown',
      position: { x: 20, y: 30 },
      data: { content: '## Review note' },
    });
  });

  it('does not expose legacy Scene/Shot authoring on the production service', () => {
    const service = new CanvasProjectAuthoringService({
      context: { subscriptions: [] } as never,
      canvasEditorProvider: createProvider(),
    });

    expect('createStoryboardFromPayload' in service).toBe(false);
  });

  it('rejects runtime handles before saving nkc facts', async () => {
    const provider = createProvider();
    const service = new CanvasProjectAuthoringService({
      context: { subscriptions: [] } as never,
      canvasEditorProvider: provider,
    });

    await expect(
      service.createNode({
        node: {
          type: 'media',
          data: {
            assetPath: 'blob:vscode-runtime-source',
            mediaType: 'image',
          },
        },
      }),
    ).rejects.toThrow(/runtime-handle-persisted|runtime-only/);
    expect(vscodeMockState.files.size).toBe(0);
    expect(provider.applyHostCanvasData).not.toHaveBeenCalled();
  });

  it('imports an approved asset into an explicit target and returns the saved revision', async () => {
    const provider = createProvider();
    provider.getActiveCanvasDocumentUri.mockImplementation(() => {
      throw new Error('active Canvas fallback must not be called');
    });
    const service = new CanvasProjectAuthoringService({
      context: { subscriptions: [] } as never,
      canvasEditorProvider: provider,
    });

    const targetUri = vscode.Uri.file('/workspace/project/approved-assets.nkc');
    const initial = createEmptyCanvasData('Approved Assets');
    vscodeMockState.files.set(targetUri.fsPath, new TextEncoder().encode(saveNkc(initial)));

    const result = await service.importAssetAuthoring({
      target: { kind: 'file', documentUri: targetUri.toString() },
      asset: {
        path: './assets/approved-shot.png',
        type: 'image',
        name: 'Approved Shot',
      },
    });

    expect(provider.getActiveCanvasDocumentUri).not.toHaveBeenCalled();
    expect(provider.revealCanvasDocument).not.toHaveBeenCalled();
    expect(vscodeMockState.executeCommand).not.toHaveBeenCalled();
    expect(result.projectRef).toEqual(
      expect.objectContaining({
        domain: 'canvas',
        documentUri: targetUri.toString(),
        projectRevision: expect.stringMatching(/^nkc:/),
      }),
    );
    const reopened = loadNkc(new TextDecoder().decode(vscodeMockState.files.get(targetUri.fsPath)));
    expect(reopened.validation.valid).toBe(true);
    expect(reopened.data.nodes).toHaveLength(1);
  });

  it('rejects a missing or active project-authoring target before consulting editor state', async () => {
    const provider = createProvider();
    provider.getActiveCanvasDocumentUri.mockImplementation(() => {
      throw new Error('active Canvas fallback must not be called');
    });
    const service = new CanvasProjectAuthoringService({
      context: { subscriptions: [] } as never,
      canvasEditorProvider: provider,
    });

    await expect(
      service.importAssetAuthoring({
        target: { kind: 'active' },
        asset: { path: './assets/approved-shot.png', type: 'image' },
      }),
    ).rejects.toThrow('missing-authoring-target');
    expect(provider.getActiveCanvasDocumentUri).not.toHaveBeenCalled();
  });
});
