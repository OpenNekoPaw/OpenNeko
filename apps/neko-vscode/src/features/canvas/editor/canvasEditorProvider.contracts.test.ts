import { describe, expect, it, vi } from 'vitest';
import type { CanvasNode, ProjectedCanvasSource, ResourceRef } from '@neko/shared';

const vscodeMock = vi.hoisted(() => {
  class MockUri {
    private constructor(
      readonly scheme: string,
      readonly fsPath: string,
      readonly path: string,
    ) {}

    static file(filePath: string): MockUri {
      return new MockUri('file', filePath, filePath);
    }

    static parse(value: string): MockUri {
      if (value.startsWith('file://')) {
        const filePath = decodeURIComponent(value.slice('file://'.length));
        return MockUri.file(filePath);
      }
      const separator = value.indexOf(':');
      if (separator >= 0) {
        const scheme = value.slice(0, separator);
        const uriPath = value.slice(separator + 1);
        return new MockUri(scheme, uriPath, uriPath);
      }
      return MockUri.file(value);
    }

    static joinPath(base: MockUri, ...segments: string[]): MockUri {
      const joined = [base.fsPath.replace(/\/+$/u, ''), ...segments]
        .join('/')
        .replace(/\/+/gu, '/');
      return new MockUri(base.scheme, joined, joined);
    }

    toString(): string {
      return this.scheme === 'file' ? `file://${this.fsPath}` : `${this.scheme}:${this.path}`;
    }
  }

  return { MockUri };
});

vi.mock('vscode', () => ({
  Uri: vscodeMock.MockUri,
  workspace: {
    workspaceFolders: [
      {
        uri: vscodeMock.MockUri.file('/workspace/project'),
        name: 'project',
        index: 0,
      },
    ],
    getWorkspaceFolder: vi.fn((uri: { fsPath: string }) =>
      uri.fsPath.startsWith('/workspace/project')
        ? {
            uri: vscodeMock.MockUri.file('/workspace/project'),
            name: 'project',
            index: 0,
          }
        : undefined,
    ),
  },
}));

import {
  CanvasEditorProvider,
  assertCanvasNodeType,
  createCanvasPreviewSemanticFingerprint,
  createCanvasRepresentationSpec,
  createCanvasWebviewContentSecurityPolicy,
  createProjectionSourceKey,
  findOpenCanvasDocumentUriByProjectRef,
  hashProjectionSource,
  inferCanvasRepresentationMimeType,
  isCanvasCreativeScopeLike,
  isCanvasDataSnapshot,
  isCanvasEditorLevelKeyboardAction,
  isCanvasSerializableValue,
  isStringArray,
  isUnsafeCanvasBoardUri,
  isWorkspaceScopedVariablePath,
  mapOperationToCanvasChangeEvent,
  normalizeCanvasAssetPreviewBindings,
  readCanonicalCanvasNodePresentation,
  readCanvasBoardRef,
  readCanvasNodeContainerChildIds,
  readCanvasPreviewVariantLocalPath,
  readCanvasProjectionSummary,
  readPlaybackMediaType,
  requireCanvasSerializableValue,
  resolveCanvasPreviewVariantRole,
  stableCanvasPreviewStringify,
} from './canvasEditorProvider';

function canonicalNode(overrides: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: 'node-1',
    type: 'markdown',
    position: { x: 10, y: 20 },
    size: { width: 320, height: 180 },
    zIndex: 1,
    data: { title: 'Intro', content: 'Opening scene' },
    ...overrides,
  } as CanvasNode;
}

function resourceRef(
  kind: ResourceRef['kind'],
  sourceKind: ResourceRef['source']['kind'],
): ResourceRef {
  return {
    id: `${kind}-1`,
    scope: 'project',
    provider: 'workspace',
    kind,
    source: { kind: sourceKind, projectRelativePath: `media/${kind}-1` },
    fingerprint: { strategy: 'none', value: 'revision-1' },
  } as ResourceRef;
}

describe('CanvasEditorProvider contracts', () => {
  it('allows the canonical loopback media runtime in Canvas Webview CSP', () => {
    const policy = createCanvasWebviewContentSecurityPolicy('vscode-webview:', 'test-nonce');

    expect(policy).toContain("script-src 'nonce-test-nonce'");
    expect(policy).toContain('media-src vscode-webview: data: blob: https: http://127.0.0.1:*');
    expect(policy).toContain('connect-src ws://127.0.0.1:* http://127.0.0.1:*');
    expect(policy).not.toContain('http://localhost:*');
  });

  it('recognizes editor keyboard actions and playback media types', () => {
    expect(isCanvasEditorLevelKeyboardAction('deleteSelected')).toBe(true);
    expect(isCanvasEditorLevelKeyboardAction('selectNode:node-1')).toBe(false);
    expect(readPlaybackMediaType('video')).toBe('video');
    expect(readPlaybackMediaType('audio')).toBe('audio');
    expect(readPlaybackMediaType('image')).toBe('auto');
  });

  it('accepts only workspace and project variable paths as workspace-scoped', () => {
    for (const value of [
      '${WORKSPACE}',
      '${WORKSPACE}/media/a.png',
      '${PROJECT}',
      '${PROJECT}/media/a.png',
    ]) {
      expect(isWorkspaceScopedVariablePath(value)).toBe(true);
    }
    expect(isWorkspaceScopedVariablePath('${MEDIA_LIBRARY}/a.png')).toBe(false);
    expect(isWorkspaceScopedVariablePath('media/a.png')).toBe(false);
  });

  it('rejects unsupported node types without weakening undefined handling', () => {
    expect(() => assertCanvasNodeType(undefined)).not.toThrow();
    expect(() => assertCanvasNodeType('media')).not.toThrow();
    expect(() => assertCanvasNodeType('legacy-shape' as never)).toThrow(
      'Unsupported Canvas node type "legacy-shape"',
    );
  });

  it('validates recursively serializable values', () => {
    const serializable = {
      title: 'Scene',
      visible: true,
      count: 2,
      nested: [null, { prompt: 'rain' }],
    };
    expect(isCanvasSerializableValue(serializable)).toBe(true);
    expect(requireCanvasSerializableValue(serializable, 'payload')).toBe(serializable);
    expect(isCanvasSerializableValue(Number.NaN)).toBe(false);
    expect(isCanvasSerializableValue({ invalid: undefined })).toBe(false);
    expect(isCanvasSerializableValue([Symbol('invalid')])).toBe(false);
    expect(() => requireCanvasSerializableValue(new Date(), 'payload')).toThrow(
      'payload is not Canvas-serializable.',
    );
  });

  it('validates canonical Canvas snapshots including endpoint identity', () => {
    const node = canonicalNode();
    const connection = {
      id: 'connection-1',
      sourceId: 'node-1',
      targetId: 'node-2',
      type: 'sequence',
      sourceEndpoint: { nodeId: 'node-1' },
      targetEndpoint: { nodeId: 'node-2' },
    };
    const snapshot = {
      version: '3.0',
      name: 'Board',
      nodes: [node],
      connections: [connection],
    };

    expect(isCanvasDataSnapshot(snapshot)).toBe(true);
    expect(isCanvasDataSnapshot(null)).toBe(false);
    expect(isCanvasDataSnapshot({ ...snapshot, version: 3 })).toBe(false);
    expect(
      isCanvasDataSnapshot({
        ...snapshot,
        nodes: [{ ...node, position: { x: Number.NaN, y: 0 } }],
      }),
    ).toBe(false);
    expect(
      isCanvasDataSnapshot({
        ...snapshot,
        connections: [
          {
            ...connection,
            sourceEndpoint: { nodeId: 'different-node' },
          },
        ],
      }),
    ).toBe(false);
  });

  it('recognizes non-empty string arrays', () => {
    expect(isStringArray(['node-1', 'node-2'])).toBe(true);
    expect(isStringArray([])).toBe(true);
    expect(isStringArray([''])).toBe(false);
    expect(isStringArray(['node-1', 2])).toBe(false);
    expect(isStringArray('node-1')).toBe(false);
  });

  it('normalizes nested asset preview bindings in place', () => {
    const value = {
      preview: {
        kind: 'asset-preview',
        binding: { role: 'source', path: 'stale.png' },
      },
      assetBinding: { assetId: 'asset-1', path: 'stale.png' },
      children: [
        {
          kind: 'asset-preview',
          binding: { path: 'nested-stale.png' },
        },
        'unchanged',
      ],
    };

    normalizeCanvasAssetPreviewBindings(value, 'media/current.png');

    expect(value).toMatchObject({
      preview: { binding: { role: 'source', path: 'media/current.png' } },
      assetBinding: { assetId: 'asset-1', path: 'media/current.png' },
      children: [{ binding: { path: 'media/current.png' } }, 'unchanged'],
    });
  });

  it('creates stable semantic fingerprints while ignoring transient fields', () => {
    const first = createCanvasPreviewSemanticFingerprint({
      connections: [],
      nodes: [{ id: 'node-1', data: { b: 2, a: 1 } }],
      name: 'Board',
      projectionStatus: { state: 'ready' },
      viewport: { zoom: 1 },
    });
    const second = createCanvasPreviewSemanticFingerprint({
      name: 'Board',
      nodes: [{ data: { a: 1, b: 2 }, id: 'node-1' }],
      connections: [],
      projectionStatus: { state: 'ready' },
      viewport: { zoom: 2 },
    });

    expect(first).toBe(second);
    expect(stableCanvasPreviewStringify(undefined)).toBe('undefined');
    expect(stableCanvasPreviewStringify([3, { b: 2, a: 1 }])).toBe('[3,{"a":1,"b":2}]');
  });

  it('selects canonical preview roles for each resource family', () => {
    expect(resolveCanvasPreviewVariantRole(resourceRef('document', 'file'), 'source')).toBe(
      'page-image',
    );
    expect(resolveCanvasPreviewVariantRole(resourceRef('document', 'document'), 'thumbnail')).toBe(
      'document-entry',
    );
    expect(
      resolveCanvasPreviewVariantRole(resourceRef('generated', 'generated-asset'), 'source'),
    ).toBe('source');
    expect(
      resolveCanvasPreviewVariantRole(resourceRef('generated', 'generated-asset'), 'proxy'),
    ).toBe('preview');
    expect(resolveCanvasPreviewVariantRole(resourceRef('media', 'file'), 'fov-crop')).toBe(
      'fov-crop',
    );
    expect(resolveCanvasPreviewVariantRole(resourceRef('media', 'file'), 'preview')).toBe(
      'thumbnail',
    );
    expect(resolveCanvasPreviewVariantRole(resourceRef('preview', 'file'), 'proxy')).toBe('proxy');
    expect(resolveCanvasPreviewVariantRole(resourceRef('preview', 'file'), 'document-entry')).toBe(
      'preview',
    );
    expect(
      resolveCanvasPreviewVariantRole(resourceRef('storyboard-reference', 'file'), undefined),
    ).toBe('thumbnail');
  });

  it('maps roles to representation specs and MIME types', () => {
    expect(createCanvasRepresentationSpec('thumbnail')).toEqual({
      kind: 'thumbnail',
      maxWidth: 640,
      maxHeight: 360,
      format: 'jpeg',
    });
    expect(createCanvasRepresentationSpec('preview')).toMatchObject({
      kind: 'preview',
      format: 'jpeg',
    });
    expect(createCanvasRepresentationSpec('proxy')).toEqual({
      kind: 'proxy',
      profile: 'canvas-preview',
    });
    expect(createCanvasRepresentationSpec('fov-crop')).toMatchObject({
      kind: 'fov-crop',
      horizontalFov: 75,
    });
    expect(createCanvasRepresentationSpec('page-image')).toEqual({
      kind: 'raster-page',
      page: 1,
      scale: 1,
      format: 'png',
    });
    expect(createCanvasRepresentationSpec('source')).toBeUndefined();

    expect(
      inferCanvasRepresentationMimeType({
        kind: 'proxy',
        profile: 'canvas-preview',
      }),
    ).toBe('application/octet-stream');
    expect(
      inferCanvasRepresentationMimeType({
        kind: 'thumbnail',
        maxWidth: 10,
        maxHeight: 10,
        format: 'png',
      }),
    ).toBe('image/png');
    expect(
      inferCanvasRepresentationMimeType({
        kind: 'thumbnail',
        maxWidth: 10,
        maxHeight: 10,
        format: 'webp',
      }),
    ).toBe('image/webp');
    expect(
      inferCanvasRepresentationMimeType({
        kind: 'thumbnail',
        maxWidth: 10,
        maxHeight: 10,
        format: 'jpeg',
      }),
    ).toBe('image/jpeg');
  });

  it('accepts only reusable local preview paths', () => {
    expect(readCanvasPreviewVariantLocalPath(undefined)).toBeUndefined();
    expect(readCanvasPreviewVariantLocalPath('https://example.com/a.png')).toBeUndefined();
    expect(readCanvasPreviewVariantLocalPath('data:image/png;base64,a')).toBeUndefined();
    expect(readCanvasPreviewVariantLocalPath('blob:abc')).toBeUndefined();
    expect(readCanvasPreviewVariantLocalPath('media/a.png')).toBe('media/a.png');
    expect(readCanvasPreviewVariantLocalPath('file:///workspace/media/a.png')).toBe(
      '/workspace/media/a.png',
    );
  });

  it('projects status summaries only from valid state records', () => {
    expect(readCanvasProjectionSummary({})).toBeUndefined();
    expect(readCanvasProjectionSummary({ projectionStatus: [] })).toBeUndefined();
    expect(readCanvasProjectionSummary({ projectionStatus: { state: '' } })).toBeUndefined();
    expect(readCanvasProjectionSummary({ projectionStatus: { state: 'ready' } })).toBe(
      'Projected: ready',
    );
    expect(
      readCanvasProjectionSummary({
        projectionStatus: { state: 'stale', message: 'source changed' },
      }),
    ).toBe('Projected: stale - source changed');
  });

  it('projects canonical node labels and summaries', () => {
    const cases: Array<[CanvasNode, { label: string; summary: string }]> = [
      [canonicalNode(), { label: 'Intro', summary: 'Opening scene' }],
      [
        canonicalNode({
          type: 'media',
          data: { assetPath: '/workspace/video/shot.mp4', mediaType: 'video' },
        } as Partial<CanvasNode>),
        { label: 'shot.mp4', summary: 'video' },
      ],
      [
        canonicalNode({
          type: 'group',
          data: { label: 'Act 1' },
          container: { childIds: ['node-2', 'node-3'] },
        } as Partial<CanvasNode>),
        { label: 'Act 1', summary: '2 items' },
      ],
      [
        canonicalNode({
          type: 'job',
          data: { title: 'Render', objective: 'Create preview', status: 'running' },
        } as Partial<CanvasNode>),
        { label: 'Render', summary: 'Create preview' },
      ],
      [
        canonicalNode({
          type: 'file',
          data: { title: '', path: '/workspace/notes/script.md' },
        } as Partial<CanvasNode>),
        { label: 'script.md', summary: '/workspace/notes/script.md' },
      ],
      [
        canonicalNode({
          type: 'canvas-embed',
          data: { canvasTitle: 'References', canvasPath: 'boards/references.nkc' },
        } as Partial<CanvasNode>),
        { label: 'References', summary: 'boards/references.nkc' },
      ],
    ];

    for (const [node, expected] of cases) {
      expect(readCanonicalCanvasNodePresentation(node)).toEqual(expected);
    }
  });

  it('recognizes creative scopes and parses every board ref kind', () => {
    expect(isCanvasCreativeScopeLike({ kind: 'storyboard', projectId: 'project-1' })).toBe(true);
    expect(isCanvasCreativeScopeLike({ kind: 1 })).toBe(false);
    expect(isCanvasCreativeScopeLike([])).toBe(false);

    expect(readCanvasBoardRef({ kind: 'workspace-path', path: 'boards/main.nkc' })).toEqual({
      kind: 'workspace-path',
      path: 'boards/main.nkc',
    });
    expect(readCanvasBoardRef({ kind: 'uri', uri: 'neko-canvas://board/main' })).toEqual({
      kind: 'uri',
      uri: 'neko-canvas://board/main',
    });
    const ref = resourceRef('media', 'file');
    expect(readCanvasBoardRef({ kind: 'resource', resourceRef: ref })).toEqual({
      kind: 'resource',
      resourceRef: ref,
    });
    expect(
      readCanvasBoardRef({
        kind: 'project',
        projectId: 'project-1',
        canvasId: 'canvas-1',
      }),
    ).toEqual({ kind: 'project', projectId: 'project-1', canvasId: 'canvas-1' });
    expect(readCanvasBoardRef({ kind: 'project' })).toBeUndefined();
    expect(readCanvasBoardRef({ kind: 'unknown' })).toBeUndefined();
    expect(readCanvasBoardRef(null)).toBeUndefined();
  });

  it('rejects unsafe board URIs while retaining portable board references', () => {
    for (const value of [
      '',
      'vscode-webview://frame/board',
      'vscode-resource://file/board',
      'http://localhost:3000/board',
      'https://127.0.0.1/board',
      'http://[::1]:8080/board',
      'file:///workspace/board.nkc',
    ]) {
      expect(isUnsafeCanvasBoardUri(value)).toBe(true);
    }
    expect(isUnsafeCanvasBoardUri('neko-canvas://project/board')).toBe(false);
    expect(isUnsafeCanvasBoardUri('https://example.com/board')).toBe(false);
  });

  it('finds open project boards using canvas and creative-scope identities', () => {
    const snapshots = new Map<string, Record<string, unknown>>([
      [
        'file:///workspace/boards/a.nkc',
        { id: 'canvas-a', creativeScope: { kind: 'storyboard', projectId: 'project-a' } },
      ],
      [
        'file:///workspace/boards/b.nkc',
        { id: 'canvas-b', creativeScope: { kind: 'storyboard', projectId: 'project-b' } },
      ],
      ['file:///workspace/boards/legacy.nkc', { id: 'legacy-canvas' }],
    ]);

    expect(
      findOpenCanvasDocumentUriByProjectRef({ kind: 'project', projectId: 'project-b' }, snapshots)
        ?.fsPath,
    ).toBe('/workspace/boards/b.nkc');
    expect(
      findOpenCanvasDocumentUriByProjectRef(
        { kind: 'project', projectId: 'legacy', canvasId: 'legacy-canvas' },
        snapshots,
      )?.fsPath,
    ).toBe('/workspace/boards/legacy.nkc');
    expect(
      findOpenCanvasDocumentUriByProjectRef(
        { kind: 'project', projectId: 'project-a', canvasId: 'missing' },
        snapshots,
      ),
    ).toBeUndefined();
  });

  it('creates deterministic projection keys and hashes', () => {
    const source = { kind: 'storyboard', uri: 'file:///workspace/storyboard.json' };
    expect(createProjectionSourceKey(source as ProjectedCanvasSource)).toBe(
      'storyboard:file:///workspace/storyboard.json',
    );
    expect(hashProjectionSource('same')).toBe(hashProjectionSource('same'));
    expect(hashProjectionSource('same')).not.toBe(hashProjectionSource('different'));
    expect(hashProjectionSource('')).toBe('1505');
  });

  it('reads valid group child ids only', () => {
    expect(readCanvasNodeContainerChildIds({})).toEqual([]);
    expect(readCanvasNodeContainerChildIds({ container: [] })).toEqual([]);
    expect(readCanvasNodeContainerChildIds({ container: { childIds: 'node-1' } })).toEqual([]);
    expect(
      readCanvasNodeContainerChildIds({
        container: { childIds: ['node-1', 2, 'node-3', null] },
      }),
    ).toEqual(['node-1', 'node-3']);
  });

  it('maps authored operations to Canvas change events', () => {
    expect(
      mapOperationToCanvasChangeEvent({
        type: 'canvas.node.add',
        payload: { node: { id: 'node-1' } },
      }),
    ).toMatchObject({
      type: 'add',
      entityType: 'node',
      nodeId: 'node-1',
      nodeIds: ['node-1'],
    });
    expect(
      mapOperationToCanvasChangeEvent({
        type: 'canvas.connection.remove',
        payload: { nodeId: 'connection-1' },
      }),
    ).toMatchObject({
      type: 'delete',
      entityType: 'connection',
      nodeId: 'connection-1',
    });
    expect(
      mapOperationToCanvasChangeEvent({
        type: 'canvas.group.ungroup',
        payload: { groupNode: { id: 'group-1' }, childIds: ['node-1', 2] },
      }),
    ).toMatchObject({
      type: 'delete',
      entityType: 'operation',
      nodeId: 'group-1',
      nodeIds: ['node-1'],
    });
    expect(mapOperationToCanvasChangeEvent({})).toMatchObject({
      type: 'update',
      entityType: 'operation',
      operationType: 'unknown',
    });
  });

  it('requires the Preview Variant API through direct composition', () => {
    expect(CanvasEditorProvider.length).toBeGreaterThan(0);
    expect(String(CanvasEditorProvider)).toContain('this.dependencies.previewVariants');
  });
});

function createProviderSurface(): CanvasEditorProvider {
  const provider = Object.create(CanvasEditorProvider.prototype) as CanvasEditorProvider;
  Reflect.set(provider, 'canvasSnapshotsByDocumentUri', new Map());
  Reflect.set(provider, 'authoritativeCanvasSnapshotsByDocumentUri', new Map());
  Reflect.set(provider, 'confirmedRemovedNodeIdsByDocumentUri', new Map());
  Reflect.set(provider, 'canvasRevisionsByDocumentUri', new Map());
  Reflect.set(provider, 'dirtyCanvasDocumentUris', new Set());
  Reflect.set(provider, 'canvasPreviewFingerprintsByDocumentUri', new Map());
  Reflect.set(provider, 'canvasDataReadyDocumentUris', new Set());
  Reflect.set(provider, 'webviewPanelsByDocumentUri', new Map());
  Reflect.set(provider, 'documentsByDocumentUri', new Map());
  return provider;
}

function callProvider<T>(
  provider: CanvasEditorProvider,
  methodName: string,
  ...args: unknown[]
): T {
  const method = Reflect.get(provider, methodName);
  if (typeof method !== 'function') {
    throw new Error(`CanvasEditorProvider method ${methodName} is unavailable.`);
  }
  return Reflect.apply(method, provider, args) as T;
}

function canonicalSnapshot(): Record<string, unknown> {
  return {
    version: '3.0',
    name: 'Board',
    nodes: [
      canonicalNode(),
      canonicalNode({
        id: 'media-1',
        type: 'media',
        data: {
          title: 'Shot 1',
          assetPath: 'media/shot-1.mp4',
          mediaType: 'video',
        },
      } as Partial<CanvasNode>),
    ],
    connections: [
      {
        id: 'connection-1',
        sourceId: 'node-1',
        targetId: 'media-1',
        type: 'sequence',
        sourceEndpoint: { nodeId: 'node-1' },
        targetEndpoint: { nodeId: 'media-1' },
      },
    ],
    viewport: { zoom: 1.25 },
    _selection: { nodeIds: ['media-1'] },
  };
}

describe('CanvasEditorProvider runtime projection', () => {
  it('tracks canonical snapshots, revisions, dirty state, and active readiness', () => {
    const provider = createProviderSurface();
    const documentUri = 'file:///workspace/project/board.nkc';
    const snapshot = canonicalSnapshot();

    callProvider(provider, 'updateRememberedCanvasSnapshot', documentUri, snapshot);
    callProvider(provider, 'setAuthoritativeCanvasSnapshot', documentUri, snapshot);
    Reflect.get(provider, 'dirtyCanvasDocumentUris').add(documentUri);

    expect(callProvider(provider, 'getCanvasRevision', documentUri)).toBe(1);
    expect(provider.getOpenCanvasDocumentSnapshot(documentUri)).toEqual({
      canvasData: snapshot,
      dirty: true,
    });
    expect(provider.getOpenCanvasDocumentSnapshot('file:///missing.nkc')).toBeUndefined();

    const document = { uri: vscodeMock.MockUri.parse(documentUri) };
    Reflect.set(provider, 'activeDocument', document);
    Reflect.set(provider, 'activeWebviewPanel', { webview: {} });
    Reflect.get(provider, 'canvasDataReadyDocumentUris').add(documentUri);

    expect(provider.hasActiveCanvasEditor()).toBe(true);
    expect(provider.hasActiveCanvasEditorReady()).toBe(true);
    expect(provider.getActiveCanvasDocumentUri()?.toString()).toBe(documentUri);

    Reflect.get(provider, 'canvasDataReadyDocumentUris').clear();
    expect(provider.hasActiveCanvasEditorReady()).toBe(false);
    expect(() =>
      callProvider(provider, 'updateRememberedCanvasSnapshot', documentUri, { version: '3.0' }),
    ).toThrow('Canvas snapshot violates the canonical six-node/three-connection contract.');
  });

  it('clones preview snapshots and preserves only valid session identity', () => {
    const provider = createProviderSurface();
    const snapshot = canonicalSnapshot();
    const clone = callProvider<Record<string, unknown>>(
      provider,
      'cloneCanvasDataForPlaybackPreview',
      snapshot,
    );

    expect(clone).toEqual(snapshot);
    expect(clone).not.toBe(snapshot);
    expect(callProvider(provider, 'readCanvasPlaybackSelectedNodeId', snapshot)).toBe('media-1');
    expect(
      callProvider(provider, 'readCanvasPlaybackSelectedNodeId', {
        _selection: { nodeIds: [1, 'node-2'] },
      }),
    ).toBe('node-2');
    expect(callProvider(provider, 'readCanvasPlaybackSelectedNodeId', {})).toBeUndefined();
    expect(
      callProvider(provider, 'readPreviewSessionEnvelope', {
        sessionId: 'session-1',
        sourceCanvasUri: 'file:///workspace/project/board.nkc',
        revision: 4,
        ignored: true,
      }),
    ).toEqual({
      sessionId: 'session-1',
      sourceCanvasUri: 'file:///workspace/project/board.nkc',
      revision: 4,
    });
    expect(
      callProvider(provider, 'readPreviewSessionEnvelope', {
        sessionId: 1,
        sourceCanvasUri: null,
        revision: '4',
      }),
    ).toEqual({});
  });

  it('decodes VS Code resource URIs and keeps ordinary values unresolved', () => {
    const provider = createProviderSurface();

    expect(
      callProvider(
        provider,
        'resolveVSCodeResourceUriPath',
        'https://file+.vscode-resource.vscode-cdn.net/workspace/media/shot%201.png',
      ),
    ).toBe('/workspace/media/shot 1.png');
    expect(
      callProvider(
        provider,
        'resolveVSCodeResourceUriPath',
        'prefix-vscode-resource.vscode-cdn.net/workspace/media/shot%202.png?x=1',
      ),
    ).toBe('/workspace/media/shot 2.png');
    expect(
      callProvider(provider, 'resolveVSCodeResourceUriPath', 'vscode-resource:/workspace/a.png'),
    ).toBe('/workspace/a.png');
    expect(callProvider(provider, 'resolveVSCodeResourceUriPath', 'media/a.png')).toBeUndefined();
    expect(callProvider(provider, 'resolveDocumentResourceAssetPath', '')).toBeUndefined();
    expect(callProvider(provider, 'resolveDocumentResourceAssetPath', 'media/a.png')).toBe(
      'media/a.png',
    );
  });

  it('normalizes portable relative paths and rejects URI or variable sources', () => {
    const provider = createProviderSurface();

    expect(callProvider(provider, 'readWorkspaceRelativeCanvasAssetPath', 'media\\shot.png')).toBe(
      'media/shot.png',
    );
    expect(
      callProvider(provider, 'readWorkspaceRelativeCanvasAssetPath', '../media/shot.png'),
    ).toBe('media/shot.png');
    for (const source of [
      '',
      '/absolute/shot.png',
      '//server/shot.png',
      '${WORKSPACE}/shot.png',
      'C:\\media\\shot.png',
      'https://example.com/shot.png',
    ]) {
      expect(
        callProvider(provider, 'readWorkspaceRelativeCanvasAssetPath', source),
      ).toBeUndefined();
    }
    expect(
      callProvider(provider, 'normalizeWorkspaceRelativeCanvasAssetPath', '../../'),
    ).toBeUndefined();
    expect(callProvider(provider, 'isReusableCanvasPlaybackPreviewSource', undefined)).toBe(false);
    expect(
      callProvider(provider, 'isReusableCanvasPlaybackPreviewSource', 'data:image/png;base64,a'),
    ).toBe(true);
    expect(
      callProvider(provider, 'isReusableCanvasPlaybackPreviewSource', 'https://example.com/a.png'),
    ).toBe(true);
    expect(
      callProvider(
        provider,
        'isReusableCanvasPlaybackPreviewSource',
        'https://file+.vscode-resource.vscode-cdn.net/a.png',
      ),
    ).toBe(false);
  });

  it('reads direct and nested preview source candidates', () => {
    const provider = createProviderSurface();
    const ref = resourceRef('media', 'file');

    expect(callProvider(provider, 'readPreviewSourceCandidate', '  media/shot.png  ')).toEqual({
      source: 'media/shot.png',
    });
    expect(
      callProvider(provider, 'readPreviewSourceCandidate', {
        metadata: { resourceRef: ref },
        assetRef: { previewUrl: ' https://example.com/preview.png ' },
      }),
    ).toEqual({
      source: 'https://example.com/preview.png',
      resourceRef: ref,
    });
    expect(
      callProvider(provider, 'readPreviewSourceCandidate', {
        sourcePath: '',
        assetRef: { filePath: 'media/nested.png' },
      }),
    ).toEqual({ source: 'media/nested.png' });
    expect(callProvider(provider, 'readPreviewSourceCandidate', [])).toBeUndefined();
    expect(callProvider(provider, 'readPreviewSourceCandidate', {})).toBeUndefined();
    expect(callProvider(provider, 'readNestedRecord', null)).toBeUndefined();
    expect(callProvider(provider, 'readNestedRecord', { value: 1 })).toEqual({ value: 1 });
    expect(
      callProvider(provider, 'readFirstPreviewSourceString', undefined, ['path']),
    ).toBeUndefined();
  });

  it('projects Canvas nodes and connections into the active Outline and status bar', () => {
    const provider = createProviderSurface();
    const outline = { updateData: vi.fn() };
    const statusBar = { update: vi.fn() };
    provider.setProviders({ outline: outline as never, statusBar: statusBar as never });

    const canvasData = {
      name: 'Production Board',
      nodes: [
        {
          id: 'markdown-1',
          type: 'markdown',
          data: { title: 'Intro', content: 'Opening scene content' },
        },
        {
          id: 'media-1',
          type: 'media',
          data: { assetPath: 'media/shot.mp4', mediaType: 'video' },
        },
        {
          id: 'group-1',
          type: 'group',
          data: { label: 'Act 1' },
          container: { childIds: ['markdown-1', 'media-1'] },
        },
        {
          id: 'job-1',
          type: 'job',
          data: { title: 'Render', status: 'running' },
        },
        {
          id: 'file-1',
          type: 'file',
          data: { path: 'docs/notes.md', mediaType: 'text' },
          locked: true,
        },
        {
          id: 'embed-1',
          type: 'canvas-embed',
          data: { canvasTitle: 'References', canvasPath: 'boards/references.nkc' },
        },
      ],
      connections: [
        {
          id: 'connection-1',
          sourceId: 'markdown-1',
          targetId: 'media-1',
          label: 'next',
        },
        {
          id: 'connection-2',
          sourceId: 'missing',
          targetId: 'embed-1',
        },
      ],
      viewport: { zoom: 1.5 },
      _selection: { nodeIds: ['media-1', 'file-1'] },
      projectionStatus: { state: 'ready', message: 'source synchronized' },
    };

    callProvider(provider, 'syncOutline', 'file:///workspace/project/board.nkc', canvasData);
    callProvider(provider, 'syncStatusBar', canvasData);

    expect(outline.updateData).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Production Board',
        nodes: [
          expect.objectContaining({ id: 'markdown-1', label: 'Intro' }),
          expect.objectContaining({ id: 'media-1', label: 'shot.mp4', detail: 'video' }),
          expect.objectContaining({ id: 'group-1', childIds: ['markdown-1', 'media-1'] }),
          expect.objectContaining({ id: 'job-1', detail: 'running' }),
          expect.objectContaining({ id: 'file-1', label: 'notes.md', locked: true }),
          expect.objectContaining({ id: 'embed-1', label: 'References' }),
        ],
        connections: [
          expect.objectContaining({
            sourceLabel: 'Intro',
            targetLabel: 'shot.mp4',
            label: 'next',
          }),
          expect.objectContaining({ sourceLabel: '?', targetLabel: 'References' }),
        ],
      }),
    );
    expect(statusBar.update).toHaveBeenCalledWith({
      nodeCount: 6,
      connectionCount: 2,
      zoom: 1.5,
      selectedCount: 2,
      projectionSummary: 'Projected: ready - source synchronized',
    });
  });
});
