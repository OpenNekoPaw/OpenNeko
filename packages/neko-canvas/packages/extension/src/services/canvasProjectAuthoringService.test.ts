import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
  createEmptyCanvasData,
  loadNkc,
  saveNkc,
  type CanvasWorkspaceProjectionRequest,
  type ResourceRef,
} from '@neko/shared';
import { CanvasProjectAuthoringService } from './canvasProjectAuthoringService';
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
    target: { workspaceUri: 'file:///workspace/project/' },
    provenance: {
      version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
      projectionId: 'projection:shot-1',
      artifactId: 'shot-1',
      revision: 'generated:sha256:shot-1',
      kind: 'image',
      sourceId: 'generated-output:shot-1',
      taskId: 'task-1',
      createdAt: '2026-07-15T00:00:00.000Z',
    },
    artifact: {
      kind: 'image',
      title: 'Shot 1',
      mimeType: 'image/png',
      resourceRef: generatedRef,
    },
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

    const result = await service.projectWorkspaceBoard({
      request: workspaceProjectionRequest(),
      documentUri: 'file:///workspace/project/neko/boards/workspace.nkc',
      createIfMissing: true,
    });

    expect(result).toMatchObject({
      status: 'projected',
      documentUri: 'file:///workspace/project/neko/boards/workspace.nkc',
      projectRef: { projectRevision: expect.stringMatching(/^nkc:/) },
    });
    expect(vscodeMockState.createDirectory).toHaveBeenCalledOnce();
    expect(provider.getActiveCanvasDocumentUri).not.toHaveBeenCalled();
    const reopened = loadNkc(
      new TextDecoder().decode(
        vscodeMockState.files.get('/workspace/project/neko/boards/workspace.nkc'),
      ),
    );
    expect(reopened.validation.valid).toBe(true);
    expect(reopened.data.nodes.map((node) => node.type)).toEqual(['group', 'media']);
    expect(provider.revealCanvasDocument).not.toHaveBeenCalled();
    expect(provider.applyHostCanvasData).toHaveBeenLastCalledWith(
      expect.objectContaining({ fsPath: '/workspace/project/neko/boards/workspace.nkc' }),
      expect.objectContaining({ nodes: expect.any(Array) }),
    );
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
      service.projectWorkspaceBoard({
        request: workspaceProjectionRequest(),
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
      fallbackTitle: 'Headless Storyboard',
      request: {
        containerType: 'scene',
        data: { sceneTitle: 'Headless Storyboard', sceneNumber: 1 },
        children: [{ type: 'shot', data: { shotNumber: 1, visualDescription: 'First shot' } }],
      },
    });

    expect(result.containerId).toBeDefined();
    expect(provider.revealCanvasDocument).not.toHaveBeenCalled();
    expect(vscodeMockState.executeCommand).not.toHaveBeenCalled();
    const saved = readJsonFile('/workspace/project/Headless Storyboard.nkc') as {
      nodes?: unknown[];
    };
    expect(saved.nodes).toHaveLength(2);
    const reopened = loadNkc(
      new TextDecoder().decode(
        vscodeMockState.files.get('/workspace/project/Headless Storyboard.nkc'),
      ),
    );
    expect(reopened.validation.valid).toBe(true);
    expect(reopened.data.nodes).toHaveLength(2);
    expect(provider.applyHostCanvasData).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: '/workspace/project/Headless Storyboard.nkc' }),
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
            id: 'text-atomic-1',
            type: 'text',
            position: { x: 42, y: 64 },
            size: { width: 260, height: 120 },
            zIndex: 1,
            data: {
              content: 'Atomic host-authored note',
              format: 'plain',
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
      id: 'text-atomic-1',
      type: 'text',
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
      preset: 'media.basic',
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
        type: 'text',
        position: { x: 12, y: 34 },
        data: { content: 'host-authored' },
      },
    });

    expect(result.documentUri).toBe('file:///workspace/project/Active.nkc');
    expect(result.nodeId).toBeDefined();
    const saved = readJsonFile('/workspace/project/Active.nkc') as {
      nodes?: Array<{ type?: string }>;
    };
    expect(saved.nodes?.[0]?.type).toBe('text');
    expect(vscodeMockState.files.has('/workspace/project/Agent Canvas.nkc')).toBe(false);
  });

  it('writes an explicit document target instead of the active Canvas document', async () => {
    const activeUri = vscode.Uri.file('/workspace/project/Active.nkc');
    const explicitUri = vscode.Uri.file('/workspace/project/Explicit.nkc');
    vscodeMockState.files.set(
      activeUri.fsPath,
      new TextEncoder().encode(saveNkc(createEmptyCanvasData('Active'))),
    );
    vscodeMockState.files.set(
      explicitUri.fsPath,
      new TextEncoder().encode(saveNkc(createEmptyCanvasData('Explicit'))),
    );
    const provider = createProvider(activeUri);
    const service = new CanvasProjectAuthoringService({
      context: { subscriptions: [] } as never,
      canvasEditorProvider: provider,
    });

    const result = await service.createNode({
      target: { documentUri: explicitUri.toString() },
      node: {
        type: 'text',
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
        type: 'text',
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
      type: 'text',
      position: { x: 20, y: 30 },
      data: { content: '## Review note', format: 'markdown' },
    });
  });

  it('preserves canonical scene/shot hierarchy, prompts, revision, and stable image refs after reopen', async () => {
    const provider = createProvider();
    const service = new CanvasProjectAuthoringService({
      context: { subscriptions: [] } as never,
      canvasEditorProvider: provider,
    });
    const sourceImageResourceRef = {
      id: 'source-image-resource',
      scope: 'project',
      provider: 'workspace',
      kind: 'media',
      source: { kind: 'file', projectRelativePath: 'assets/cat.png' },
      locator: { kind: 'file', path: '${WORKSPACE}/assets/cat.png' },
      fingerprint: { strategy: 'hash', value: 'cat-source' },
    } as const;
    const documentImageResourceRef = {
      kind: 'document-entry',
      source: { filePath: '${WORKSPACE}/books/comic.cbz', format: 'cbz' },
      entryPath: 'pages/page-002.png',
    } as const;

    const result = await service.createStoryboardFromPayload({
      target: { title: 'Payload Storyboard' },
      payload: {
        mode: 'semantic',
        sourceScriptUri: 'storyboard:storyboard-rev-1',
        sourceStoryboardRevisionId: 'storyboard-rev-1',
        projectionMode: 'read-only-projection',
        scenes: [
          {
            sceneId: 'scene-alpha',
            sceneTitle: 'Scene Alpha',
            sceneNumber: 1,
            storyboardPrompt: {
              version: 1,
              promptBlocks: {
                videoPromptDocument: {
                  version: 1,
                  documentId: 'storyboard-scene:scene-alpha:video',
                  blockKind: 'video',
                  text: 'slow push through the corridor',
                  baseRevision: 'storyboard-rev-1',
                },
              },
            },
            shotPlans: [
              {
                shotId: 'shot-alpha-1',
                shotNumber: 1,
                duration: 4,
                visualDescription: 'A quiet corridor.',
                characters: [],
                shotScale: 'MS',
                characterAction: 'A figure turns.',
                emotion: [],
                sceneTags: ['Scene Alpha'],
                imagePrompt: 'cat corridor keyframe',
                storyboardPrompt: {
                  version: 1,
                  promptBlocks: {
                    imagePromptDocument: {
                      version: 1,
                      documentId: 'storyboard-shot:shot-alpha-1:image',
                      blockKind: 'image',
                      text: 'cat corridor keyframe',
                      baseRevision: 'storyboard-rev-1',
                    },
                  },
                },
                referenceResourceRef: sourceImageResourceRef,
                sourceMediaRefs: [
                  {
                    refId: 'source-image-1',
                    role: 'source',
                    locator: { type: 'workspace-path', path: '${WORKSPACE}/assets/cat.png' },
                    resourceRef: sourceImageResourceRef,
                  },
                ],
              },
              {
                shotId: 'shot-alpha-2',
                shotNumber: 2,
                duration: 2,
                visualDescription: 'The cat jumps.',
                characters: [],
                shotScale: 'CU',
                characterAction: 'The cat jumps.',
                emotion: ['playful'],
                sceneTags: ['Scene Alpha'],
                imagePrompt: 'cat jumping keyframe',
                storyboardPrompt: {
                  version: 1,
                  promptBlocks: {
                    imagePromptDocument: {
                      version: 1,
                      documentId: 'storyboard-shot:shot-alpha-2:image',
                      blockKind: 'image',
                      text: 'cat jumping keyframe',
                      baseRevision: 'storyboard-rev-1',
                    },
                  },
                },
                referenceImageResourceRef: documentImageResourceRef,
                sourceMediaRefs: [
                  {
                    refId: 'document-page-2',
                    role: 'reference',
                    locator: {
                      type: 'workspace-path',
                      path: '${WORKSPACE}/books/pages/page-002.png',
                    },
                    documentResourceRef: documentImageResourceRef,
                  },
                ],
              },
            ],
          },
          {
            sceneId: 'scene-beta',
            sceneTitle: 'Scene Beta',
            sceneNumber: 2,
            shotPlans: [
              {
                shotId: 'shot-beta-1',
                shotNumber: 1,
                duration: 3,
                visualDescription: 'The cat lands.',
                characters: [],
                shotScale: 'WS',
                characterAction: 'The cat rolls over.',
                emotion: ['content'],
                sceneTags: ['Scene Beta'],
                imagePrompt: 'cat landing keyframe',
              },
            ],
          },
        ],
      },
    });

    expect(result.storyboard?.scenesCreated).toBe(2);
    expect(result.storyboard?.totalShots).toBe(3);
    const reopened = loadNkc(
      new TextDecoder().decode(
        vscodeMockState.files.get('/workspace/project/Payload Storyboard.nkc'),
      ),
    );
    expect(reopened.validation.valid).toBe(true);
    expect(reopened.data.nodes.map((node) => node.type)).toEqual([
      'scene',
      'shot',
      'shot',
      'scene',
      'shot',
    ]);

    const scenes = reopened.data.nodes.filter((node) => node.type === 'scene');
    const shots = reopened.data.nodes.filter((node) => node.type === 'shot');
    expect(scenes).toHaveLength(2);
    expect(shots).toHaveLength(3);
    expect(scenes[0]).toMatchObject({
      data: {
        sceneId: 'scene-alpha',
        sourceStoryboardRevisionId: 'storyboard-rev-1',
        storyboardProjectionMode: 'read-only-projection',
        storyboardPrompt: {
          promptBlocks: {
            videoPromptDocument: expect.objectContaining({
              blockKind: 'video',
              text: 'slow push through the corridor',
              baseRevision: 'storyboard-rev-1',
            }),
          },
        },
      },
      container: { policy: 'scene', childIds: [shots[0]!.id, shots[1]!.id] },
    });
    expect(scenes[1]).toMatchObject({
      data: { sceneId: 'scene-beta' },
      container: { policy: 'scene', childIds: [shots[2]!.id] },
    });
    expect(shots[0]).toMatchObject({
      parentId: scenes[0]!.id,
      data: {
        shotId: 'shot-alpha-1',
        sourceStoryboardRevisionId: 'storyboard-rev-1',
        storyboardProjectionMode: 'read-only-projection',
        referenceResourceRef: sourceImageResourceRef,
        sourceMediaRefs: [expect.objectContaining({ refId: 'source-image-1' })],
        storyboardPrompt: {
          promptBlocks: {
            imagePromptDocument: expect.objectContaining({ text: 'cat corridor keyframe' }),
          },
        },
      },
    });
    expect(shots[0]?.data.storyboardPrompt?.promptBlocks?.videoPromptDocument).toBeUndefined();
    expect(shots[1]).toMatchObject({
      parentId: scenes[0]!.id,
      data: {
        shotId: 'shot-alpha-2',
        referenceImageResourceRef: documentImageResourceRef,
        sourceMediaRefs: [expect.objectContaining({ refId: 'document-page-2' })],
        storyboardPrompt: {
          promptBlocks: {
            imagePromptDocument: expect.objectContaining({ text: 'cat jumping keyframe' }),
          },
        },
      },
    });
    expect(shots[2]?.parentId).toBe(scenes[1]?.id);
    expect(JSON.stringify(reopened.data)).not.toMatch(/blob:|webview|\/tmp\/neko-cache/);
    expect(provider.revealCanvasDocument).not.toHaveBeenCalled();
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
          type: 'shot',
          data: {
            visualDescription: 'Bad runtime source',
            referenceImagePath: '/var/folders/neko/page.png',
          },
        },
      }),
    ).rejects.toThrow(/runtime-only-resource-identity/);
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
