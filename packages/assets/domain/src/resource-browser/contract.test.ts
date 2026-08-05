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
  it('builds a versioned, owner-bound search request', () => {
    expect(
      createResourceBrowserSearchRequest({
        requestId: 'request-1',
        identity,
        facet: 'media',
        query: 'cat',
      }),
    ).toEqual({
      requestId: 'request-1',
      identity,
      route: RESOURCE_BROWSER_ROUTES.search,
      facet: 'media',
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
        facet: 'files',
        parentResourceId: 'directory-1',
      }),
    ).toEqual({
      requestId: 'children-1',
      identity,
      route: RESOURCE_BROWSER_ROUTES.children,
      facet: 'files',
      parentResourceId: 'directory-1',
      limit: 100,
    });
  });

  it('parses portable ContentLocator, Asset and Entity projections', () => {
    const media = parseResourceBrowserProjection(
      projection('media', [
        {
          resourceId: 'media-1',
          facet: 'media',
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
          facet: 'assets',
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
    const entities = parseResourceBrowserProjection(
      projection('entities', [
        {
          resourceId: 'entity-1',
          facet: 'entities',
          role: 'entity',
          depth: 0,
          kind: 'character',
          label: 'Neko',
          entityRef: { entityId: 'character-1', entityKind: 'character' },
          entityStatus: 'confirmed',
          sourceOwners: ['project-entity'],
          attentionBindingIds: [],
          inspector: inspector({ status: 'confirmed', entityId: 'character-1' }),
          representationAvailability: 'active',
          representationLocator: { kind: 'workspace-file', path: 'characters/neko.png' },
          representationBindingId: 'binding-neko-portrait',
          representationRole: 'portrait',
          capabilities: ['preview', 'add-to-canvas'],
        },
      ]),
    );

    expect(media.items[0]?.capabilities).toContain('add-to-cut');
    expect(media.items[0]?.facet).toBe('media');
    expect(assets.items[0]?.facet).toBe('assets');
    expect(entities.items[0]?.facet).toBe('entities');
  });

  it('parses hierarchical File projections and library management', () => {
    const files = parseResourceBrowserProjection(
      projection('files', [
        {
          resourceId: 'directory-1',
          facet: 'files',
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
          facet: 'files',
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
            facet: 'files',
            kind: 'file',
            label: 'secret',
            locator: { kind: 'workspace-file', path: '/Users/private/secret.txt' },
            capabilities: ['reveal'],
          },
        ]),
      ),
    ).toThrowError(ResourceBrowserContractError);
    expect(() =>
      parseResourceBrowserProjection(
        projection('entities', [
          {
            resourceId: 'entity-1',
            facet: 'entities',
            kind: 'character',
            label: 'Neko',
            entityRef: {
              entityId: 'character-1',
              entityKind: 'character',
              projectRoot: '/Users/private/project',
            },
            capabilities: [],
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
    for (const url of [
      'http://127.0.0.1:43125/v1/resources/token',
      'neko-media://desktop/token',
      'opennekomedia://resource/token',
      'openneko://desktop/index.html',
    ]) {
      expect(() =>
        parseResourceBrowserQuickPreviewResult({
          ...result,
          descriptor: { ...result.descriptor, url },
        }),
      ).toThrow('authorized OpenNeko resource');
    }
  });

  it('rejects target-bearing recovery requests, plans, and library statuses', () => {
    expect(() =>
      parseResourceBrowserRecoveryPlanRequest({
        requestId: 'recover-1',
        identity,
        route: RESOURCE_BROWSER_ROUTES.recoveryPlan,
        resourceId: 'library-1',
        expectedOperationRevision: 'sha256:operation',
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
          requirementRevision: 'requirements-1',
          operationRevision: 'sha256:operation',
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
            facet: 'media',
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
              operationRevision: 'sha256:operation',
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
        'content.create-directory',
        'content.import-files',
        'content.trash',
        'cut.add',
        'cut.open',
        'entity.manage',
        'preview',
        'quick-preview.release',
        'quick-preview.resolve',
        'refresh',
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
        'thumbnail.resolve',
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
        requestId: 'source-1',
        identity,
        route: RESOURCE_BROWSER_ROUTES.linkGlobalLibrary,
      }),
    ).toMatchObject({
      requestId: 'source-1',
      route: RESOURCE_BROWSER_ROUTES.linkGlobalLibrary,
    });
  });

  it('rejects legacy generic source and facet routes', () => {
    for (const facet of ['all', 'materials']) {
      expect(() =>
        parseResourceBrowserProjection({
          ...projection('files', []),
          facet,
        }),
      ).toThrowError(ResourceBrowserContractError);
    }
    for (const route of [
      'source.add',
      'source.recover',
      'source.repair',
      'source.recovery',
      'source.recovery.apply-direct',
    ]) {
      expect(() =>
        parseResourceBrowserIntentRequest({
          requestId: 'legacy-source',
          identity,
          route,
        }),
      ).toThrowError(ResourceBrowserContractError);
    }
  });

  it('parses Workspace File mutations without accepting paths from Renderer', () => {
    expect(
      parseResourceBrowserIntentRequest({
        requestId: 'create-directory-1',
        identity,
        route: RESOURCE_BROWSER_ROUTES.createDirectory,
        directoryName: 'References',
      }),
    ).toEqual({
      requestId: 'create-directory-1',
      identity,
      route: RESOURCE_BROWSER_ROUTES.createDirectory,
      directoryName: 'References',
    });
    expect(() =>
      parseResourceBrowserIntentRequest({
        requestId: 'create-directory-invalid',
        identity,
        route: RESOURCE_BROWSER_ROUTES.createDirectory,
        directoryName: '../outside',
      }),
    ).toThrow('portable visible entry name');
    expect(() =>
      parseResourceBrowserIntentRequest({
        requestId: 'import-path-forbidden',
        identity,
        route: RESOURCE_BROWSER_ROUTES.importFiles,
        sourcePaths: ['/private/source.mov'],
      }),
    ).toThrow('unsupported fields');
  });

  it('parses candidates without promoting them to stable Entity identity', () => {
    const result = parseResourceBrowserProjection(
      projection('entities', [
        {
          resourceId: 'candidate-1',
          facet: 'entities',
          role: 'entity',
          depth: 0,
          kind: 'character',
          label: 'Nova',
          candidateRef: { candidateId: 'candidate-nova', entityKind: 'character' },
          entityStatus: 'candidate',
          sourceOwners: ['document'],
          evidenceCount: 1,
          inspector: inspector({ status: 'candidate', candidateId: 'candidate-nova' }),
          capabilities: [],
        },
      ]),
    );
    expect(result.items[0]).toMatchObject({
      entityStatus: 'candidate',
      candidateRef: { candidateId: 'candidate-nova' },
    });
    expect(result.items[0]).not.toHaveProperty('entityRef');
  });

  it('parses Entity management only through the canonical Resource Browser route', () => {
    expect(
      parseResourceBrowserIntentRequest({
        requestId: 'entity-edit',
        identity,
        route: RESOURCE_BROWSER_ROUTES.manageEntity,
        resourceId: 'entity-nova',
        entityIntent: {
          type: 'edit',
          entityId: 'entity-nova',
          changes: { facts: { role: 'lead' } },
        },
      }),
    ).toMatchObject({
      route: 'entity.manage',
      entityIntent: { type: 'edit', entityId: 'entity-nova' },
    });
    expect(() =>
      parseResourceBrowserIntentRequest({
        requestId: 'entity-missing-intent',
        identity,
        route: RESOURCE_BROWSER_ROUTES.manageEntity,
        resourceId: 'entity-nova',
      }),
    ).toThrowError(ResourceBrowserContractError);
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
          expectedRevision: 8,
        },
      }),
    ).toMatchObject({
      targetCut: {
        viewId: 'cut:view-1',
        documentId: 'cuts/story.otio',
        expectedRevision: 8,
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

function projection(facet: 'files' | 'media' | 'assets' | 'entities', items: readonly unknown[]) {
  return {
    identity,
    facet,
    query: '',
    items,
  };
}

function inspector(
  identity:
    | { readonly status: 'confirmed'; readonly entityId: string }
    | { readonly status: 'candidate'; readonly candidateId: string },
) {
  return {
    status: identity.status,
    kind: 'character',
    names: { canonical: 'Nova', aliases: [] },
    facts: {},
    ...('entityId' in identity
      ? { entityId: identity.entityId }
      : { candidateId: identity.candidateId, evidence: [] }),
    bindings: [],
    operations: identity.status === 'candidate' ? ['confirm'] : ['edit'],
    blockers: [],
  };
}
