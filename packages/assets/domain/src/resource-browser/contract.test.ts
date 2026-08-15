import { describe, expect, it } from 'vitest';
import {
  RESOURCE_BROWSER_ROUTES,
  ResourceBrowserContractError,
  assertResourceBrowserIdentity,
  createResourceBrowserChildrenRequest,
  createResourceBrowserSearchRequest,
  createResourceBrowserSnapshotRequest,
  parseResourceBrowserProjection,
  parseResourceBrowserProjectionEvent,
  parseResourceBrowserIntentRequest,
  parseResourceBrowserIntentResult,
  parseResourceBrowserRecoveryPlanRequest,
  parseResourceBrowserRecoveryPlanResult,
  parseResourceBrowserQuickPreviewResult,
} from './contract';

const identity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'resource-view-1',
  viewInstanceId: 'view-instance-2',
  rendererSessionId: 'endpoint-1',
} as const;

describe('Resource Browser contract', () => {
  it('parses owner-bound intent completion and Main View capacity rejection results', () => {
    expect(
      parseResourceBrowserIntentResult({
        requestId: 'intent-completed',
        identity,
        status: 'completed',
        projection: projection('files', []),
      }),
    ).toMatchObject({ status: 'completed', projection: { identity } });
    expect(
      parseResourceBrowserIntentResult({
        requestId: 'intent-rejected',
        identity,
        status: 'rejected',
        rejection: { code: 'main-view-capacity-reached', maximum: 8 },
      }),
    ).toEqual({
      requestId: 'intent-rejected',
      identity,
      status: 'rejected',
      rejection: { code: 'main-view-capacity-reached', maximum: 8 },
    });
    expect(() =>
      parseResourceBrowserIntentResult({
        requestId: 'intent-foreign-projection',
        identity,
        status: 'completed',
        projection: {
          ...projection('files', []),
          identity: { ...identity, workspaceId: 'workspace-2' },
        },
      }),
    ).toThrow('identity is stale or belongs to another owner');
  });

  it('builds a versioned, owner-bound search request', () => {
    expect(
      createResourceBrowserSearchRequest({
        requestId: 'request-1',
        identity,
        source: 'media',
        query: 'cat',
      }),
    ).toEqual({
      requestId: 'request-1',
      identity,
      route: RESOURCE_BROWSER_ROUTES.search,
      source: 'media',
      query: 'cat',
      limit: 100,
    });
    expect(
      createResourceBrowserSnapshotRequest({
        requestId: 'snapshot-1',
        identity,
      }),
    ).toEqual({
      requestId: 'snapshot-1',
      identity,
      route: RESOURCE_BROWSER_ROUTES.snapshotGet,
    });
    expect(
      createResourceBrowserChildrenRequest({
        requestId: 'children-1',
        identity,
        source: 'files',
        parentResourceId: 'directory-1',
      }),
    ).toEqual({
      requestId: 'children-1',
      identity,
      route: RESOURCE_BROWSER_ROUTES.children,
      source: 'files',
      parentResourceId: 'directory-1',
      limit: 100,
    });
  });

  it('parses portable ContentLocator and Asset projections', () => {
    const media = parseResourceBrowserProjection(
      projection('media', [
        {
          resourceId: 'media-1',
          source: 'media',
          role: 'content',
          depth: 0,
          kind: 'image',
          label: 'cat.png',
          locator: { kind: 'workspace-file', path: 'assets/cat.png' },
          capabilities: ['preview', 'reveal', 'add-to-canvas', 'add-to-cut'],
          thumbnail: {
            descriptorId: 'thumbnail-1',
            sourceFingerprint: 'sha256-a',
            mediaType: 'image/png',
          },
        },
      ]),
    );
    const assets = parseResourceBrowserProjection(
      projection('assets', [
        {
          resourceId: 'asset-1',
          source: 'assets',
          role: 'asset',
          depth: 0,
          kind: 'asset',
          label: 'Lighting preset',
          assetRef: { assetId: 'global-asset-library:lighting' },
          availability: 'available',
          capabilities: [],
        },
      ]),
    );
    expect(media.items[0]?.capabilities).toContain('add-to-cut');
    expect(media.items[0]?.source).toBe('media');
    expect(assets.items[0]?.source).toBe('assets');
  });

  it('rejects retired Entity source and intent contracts', () => {
    expect(() => parseResourceBrowserProjection(projection('entities', []))).toThrow(
      'source is invalid',
    );
    expect(() =>
      parseResourceBrowserIntentRequest({
        requestId: 'retired-entity-route',
        identity,
        route: 'entity.manage',
        resourceId: 'entity-nova',
      }),
    ).toThrow('route is invalid');
  });

  it('parses hierarchical File projections and library management', () => {
    const files = parseResourceBrowserProjection(
      projection('files', [
        {
          resourceId: 'directory-1',
          source: 'files',
          role: 'directory',
          depth: 0,
          kind: 'directory',
          label: 'media',
          locator: { kind: 'workspace-file', path: 'media' },
          capabilities: ['reveal'],
        },
        {
          resourceId: 'file-1',
          parentResourceId: 'directory-1',
          source: 'files',
          role: 'content',
          depth: 1,
          kind: 'image',
          label: 'cat.png',
          locator: { kind: 'workspace-file', path: 'media/cat.png' },
          capabilities: ['preview'],
        },
      ]),
    );
    expect(files.items[1]).toMatchObject({
      parentResourceId: 'directory-1',
      depth: 1,
    });
    expect(
      parseResourceBrowserIntentRequest({
        requestId: 'relink-1',
        identity,
        route: RESOURCE_BROWSER_ROUTES.relinkSource,
        resourceId: 'library-1',
      }),
    ).toMatchObject({
      route: RESOURCE_BROWSER_ROUTES.relinkSource,
    });
  });

  it('rejects unknown fields, absolute paths and stale owner identity', () => {
    expect(() =>
      parseResourceBrowserProjection({
        identity,
        facet: 'files',
        query: '',
        items: [],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ResourceBrowserContractError>>({
        code: 'invalid-resource-browser-payload',
      }),
    );
    expect(() =>
      parseResourceBrowserProjection({
        ...projection('files', []),
        obsoleteField: 3,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ResourceBrowserContractError>>({
        code: 'invalid-resource-browser-payload',
      }),
    );
    expect(() =>
      parseResourceBrowserProjection(
        projection('files', [
          {
            resourceId: 'file-1',
            source: 'files',
            kind: 'file',
            label: 'secret',
            locator: { kind: 'workspace-file', path: '/Users/private/secret.txt' },
            capabilities: ['reveal'],
          },
        ]),
      ),
    ).toThrowError(ResourceBrowserContractError);
    expect(() =>
      assertResourceBrowserIdentity(identity, { ...identity, viewInstanceId: 'view-instance-3' }),
    ).toThrowError(
      expect.objectContaining<Partial<ResourceBrowserContractError>>({
        code: 'resource-browser-stale-identity',
      }),
    );
  });

  it('accepts only transient OpenNeko URLs for quick preview display', () => {
    const result = {
      requestId: 'preview-1',
      identity,
      resourceId: 'media-1',
      previewSessionId: 'preview-session-1',
      descriptor: {
        descriptorId: 'descriptor-1',
        sourceFingerprint: 'fingerprint-1',
        contentLocator: { kind: 'workspace-file', path: 'media/clip.mp4' },
        url: 'openneko://resource/0123456789abcdefghijklmnopqrstuv',
        contentKind: 'video',
        mediaType: 'video/mp4',
        displayName: 'clip.mp4',
        byteLength: 42,
      },
    };

    expect(parseResourceBrowserQuickPreviewResult(result)).toMatchObject({
      descriptor: { url: 'openneko://resource/0123456789abcdefghijklmnopqrstuv' },
    });
  });

  it('rejects target-bearing recovery requests, plans, and library statuses', () => {
    expect(() =>
      parseResourceBrowserRecoveryPlanRequest({
        requestId: 'recover-1',
        identity,
        route: RESOURCE_BROWSER_ROUTES.recoveryPlan,
        resourceId: 'library-1',
        expectedOperationFingerprint: 'sha256:operation',
        candidate: 'select-directory',
        sourceDirectory: '/Users/private/Footage',
      }),
    ).toThrowError('unsupported fields');
    expect(() =>
      parseResourceBrowserRecoveryPlanResult({
        requestId: 'recover-1',
        identity,
        resourceId: 'library-1',
        status: 'planned',
        plan: {
          planId: 'recovery-plan-1',
          workspaceId: identity.workspaceId,
          libraryName: 'Footage',
          requirementFingerprint: 'requirements-1',
          operationFingerprint: 'sha256:operation',
          candidate: {
            kind: 'global-alias',
            name: 'Footage',
            locationKind: 'local',
            targetPath: '/Users/private/Footage',
          },
          referencedCount: 1,
          validatedCount: 1,
        },
      }),
    ).toThrowError('unsupported fields');
    expect(() =>
      parseResourceBrowserProjection(
        projection('media', [
          {
            resourceId: 'library-1',
            source: 'media',
            role: 'library-root',
            depth: 0,
            kind: 'directory',
            label: 'Footage',
            libraryName: 'Footage',
            locator: { kind: 'workspace-file', path: 'neko/assets/Footage' },
            capabilities: [],
            libraryStatus: {
              libraryName: 'Footage',
              state: 'required-unlinked',
              referenceCount: 1,
              missingCount: 1,
              operationFingerprint: 'sha256:operation',
              targetPath: '/Users/private/Footage',
            },
          },
        ]),
      ),
    ).toThrowError('unsupported fields');
  });

  it('covers every fixed Host route and parses monotonic events', () => {
    expect(Object.values(RESOURCE_BROWSER_ROUTES).sort()).toEqual(
      [
        'canvas.add',
        'children',
        'content.trash',
        'creative-document.create',
        'creative-document.open',
        'cut.add',
        'preview',
        'projection.reconcile',
        'quick-preview.release',
        'quick-preview.resolve',
        'reveal',
        'search',
        'snapshot.get',
        'source.add-directory-library',
        'source.link-global-library',
        'source.recovery.apply',
        'source.recovery.cancel',
        'source.recovery.plan',
        'source.relink',
        'source.remove',
        'text.edit',
        'thumbnail.resolve',
        'workspace-entry.create-directory',
        'workspace-entry.create-file',
        'workspace-entry.import-files',
      ].sort(),
    );
    expect(
      parseResourceBrowserProjectionEvent({
        sequence: 1,
        projection: projection('media', []),
      }).sequence,
    ).toBe(1);
    expect(
      parseResourceBrowserIntentRequest({
        requestId: 'import-1',
        identity,
        route: RESOURCE_BROWSER_ROUTES.importFiles,
      }),
    ).toMatchObject({
      requestId: 'import-1',
      route: RESOURCE_BROWSER_ROUTES.importFiles,
    });
  });

  it('parses Workspace File mutations without accepting paths from Renderer', () => {
    expect(
      parseResourceBrowserIntentRequest({
        requestId: 'create-directory-1',
        identity,
        route: RESOURCE_BROWSER_ROUTES.createDirectory,
        entryName: 'References',
      }),
    ).toEqual({
      requestId: 'create-directory-1',
      identity,
      route: RESOURCE_BROWSER_ROUTES.createDirectory,
      entryName: 'References',
    });
    expect(() =>
      parseResourceBrowserIntentRequest({
        requestId: 'create-directory-invalid',
        identity,
        route: RESOURCE_BROWSER_ROUTES.createDirectory,
        entryName: '../outside',
      }),
    ).toThrow('portable visible path segment');
    expect(() =>
      parseResourceBrowserIntentRequest({
        requestId: 'import-path-forbidden',
        identity,
        route: 'content.import-files',
        sourcePaths: ['/private/source.mov'],
      }),
    ).toThrow('unsupported fields');
    for (const route of ['refresh', 'content.rename', 'cut.open']) {
      expect(() =>
        parseResourceBrowserIntentRequest({
          requestId: `retired-route:${route}`,
          identity,
          route,
        }),
      ).toThrow('route is invalid');
    }
    expect(
      parseResourceBrowserIntentRequest({
        requestId: 'create-canvas-1',
        identity,
        route: RESOURCE_BROWSER_ROUTES.createCreativeDocument,
        entryName: 'Storyboard',
        documentKind: 'canvas',
      }),
    ).toMatchObject({
      route: RESOURCE_BROWSER_ROUTES.createCreativeDocument,
      entryName: 'Storyboard',
      documentKind: 'canvas',
    });
  });

  it('requires explicit Preview and Cut handoff targets', () => {
    expect(
      parseResourceBrowserIntentRequest({
        requestId: 'preview-1',
        identity,
        route: RESOURCE_BROWSER_ROUTES.preview,
        resourceId: 'content:clip',
        targetPreview: {
          viewId: 'preview:project-view-1:temporary',
          presentation: 'temporary',
        },
      }),
    ).toMatchObject({
      targetPreview: {
        viewId: 'preview:project-view-1:temporary',
      },
    });
    expect(
      parseResourceBrowserIntentRequest({
        requestId: 'cut-1',
        identity,
        route: RESOURCE_BROWSER_ROUTES.addToCut,
        resourceId: 'content:clip',
        targetCut: {
          viewId: 'cut:view-1',
          viewInstanceId: 'view-instance-3',
          documentId: 'cuts/story.otio',
          sessionId: 'cut-session:cut:view-1:view-instance-3',
        },
      }),
    ).toMatchObject({
      targetCut: {
        viewId: 'cut:view-1',
        documentId: 'cuts/story.otio',
      },
    });
    expect(() =>
      parseResourceBrowserIntentRequest({
        requestId: 'cut-without-target',
        identity,
        route: RESOURCE_BROWSER_ROUTES.addToCut,
        resourceId: 'content:clip',
      }),
    ).toThrowError(ResourceBrowserContractError);
  });
});

function projection(source: string, items: readonly unknown[]) {
  return {
    identity,
    source,
    query: '',
    items,
  };
}
