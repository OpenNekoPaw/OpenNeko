import { describe, expect, it } from 'vitest';
import {
  RESOURCE_BROWSER_CONTRACT_VERSION,
  RESOURCE_BROWSER_ROUTES,
  ResourceBrowserContractError,
  assertResourceBrowserIdentity,
  createResourceBrowserChildrenRequest,
  createResourceBrowserSearchRequest,
  createResourceBrowserSnapshotRequest,
  parseResourceBrowserProjection,
  parseResourceBrowserProjectionEvent,
  parseResourceBrowserIntentRequest,
} from './contract';

const identity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'resource-view-1',
  viewEpoch: 2,
  endpointEpoch: 'endpoint-1',
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
      schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
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
      schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
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
      schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
      requestId: 'children-1',
      identity,
      route: RESOURCE_BROWSER_ROUTES.children,
      facet: 'files',
      parentResourceId: 'directory-1',
      limit: 100,
    });
  });

  it('parses portable ContentLocator and workspace Material projections', () => {
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
            revision: 'sha256-a',
            mediaType: 'image/png',
          },
        },
      ]),
    );
    const materials = parseResourceBrowserProjection(
      projection('materials', [
        {
          resourceId: 'entity-1',
          facet: 'materials',
          role: 'entity',
          depth: 0,
          kind: 'character',
          label: 'Neko',
          entityRef: { entityId: 'character-1', entityKind: 'character' },
          entityStatus: 'confirmed',
          representationAvailability: 'active',
          representationLocator: { kind: 'workspace-file', path: 'characters/neko.png' },
          representationBindingId: 'binding-neko-portrait',
          representationRole: 'portrait',
          capabilities: ['preview', 'add-to-agent', 'add-to-canvas'],
        },
      ]),
    );

    expect(media.items[0]?.capabilities).toContain('add-to-cut');
    expect(media.items[0]?.facet).toBe('media');
    expect(materials.items[0]?.facet).toBe('materials');
  });

  it('parses hierarchical File projections and revisioned library management', () => {
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
        schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
        requestId: 'relink-1',
        identity,
        route: RESOURCE_BROWSER_ROUTES.relinkSource,
        resourceId: 'library-1',
        expectedRevision: 4,
      }),
    ).toMatchObject({
      route: RESOURCE_BROWSER_ROUTES.relinkSource,
      expectedRevision: 4,
    });
  });

  it('rejects unknown versions, absolute paths and stale owner identity', () => {
    expect(() =>
      parseResourceBrowserProjection({
        ...projection('files', []),
        schemaVersion: 3,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ResourceBrowserContractError>>({
        code: 'unsupported-resource-browser-version',
      }),
    );
    expect(() =>
      parseResourceBrowserProjection({
        ...projection('files', []),
        schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION + 1,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ResourceBrowserContractError>>({
        code: 'unsupported-resource-browser-version',
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
        projection('materials', [
          {
            resourceId: 'entity-1',
            facet: 'materials',
            kind: 'character',
            label: 'Neko',
            entityRef: {
              entityId: 'character-1',
              entityKind: 'character',
              projectRoot: '/Users/private/project',
            },
            capabilities: ['add-to-agent'],
          },
        ]),
      ),
    ).toThrowError(ResourceBrowserContractError);
    expect(() =>
      assertResourceBrowserIdentity(identity, { ...identity, viewEpoch: 3 }),
    ).toThrowError(
      expect.objectContaining<Partial<ResourceBrowserContractError>>({
        code: 'resource-browser-stale-identity',
      }),
    );
  });

  it('covers every fixed Host route and parses monotonic events', () => {
    expect(Object.values(RESOURCE_BROWSER_ROUTES).sort()).toEqual(
      [
        'canvas.add',
        'children',
        'cut.add',
        'cut.open',
        'preview',
        'quick-preview.release',
        'quick-preview.resolve',
        'refresh',
        'reveal',
        'search',
        'snapshot.get',
        'source.add-directory-library',
        'source.link-global-library',
        'source.relink',
        'source.remove',
        'thumbnail.resolve',
      ].sort(),
    );
    expect(
      parseResourceBrowserProjectionEvent({
        schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
        sequence: 1,
        projection: projection('media', []),
      }).sequence,
    ).toBe(1);
    expect(
      parseResourceBrowserIntentRequest({
        schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
        requestId: 'source-1',
        identity,
        route: RESOURCE_BROWSER_ROUTES.linkGlobalLibrary,
        expectedRevision: 0,
      }),
    ).toMatchObject({
      requestId: 'source-1',
      route: RESOURCE_BROWSER_ROUTES.linkGlobalLibrary,
      expectedRevision: 0,
    });
  });

  it('rejects legacy generic source and facet routes', () => {
    for (const facet of ['all', 'entities']) {
      expect(() =>
        parseResourceBrowserProjection({
          ...projection('files', []),
          facet,
        }),
      ).toThrowError(ResourceBrowserContractError);
    }
    expect(() =>
      parseResourceBrowserIntentRequest({
        schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
        requestId: 'legacy-source',
        identity,
        route: 'source.add',
        expectedRevision: 0,
      }),
    ).toThrowError(ResourceBrowserContractError);
  });

  it('requires explicit Preview and Cut handoff targets', () => {
    expect(
      parseResourceBrowserIntentRequest({
        schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
        requestId: 'preview-1',
        identity,
        route: RESOURCE_BROWSER_ROUTES.preview,
        resourceId: 'content:clip',
        targetPreview: {
          viewId: 'preview:project-view-1:temporary',
          presentation: 'temporary',
          expectedWorkbenchRevision: 4,
        },
      }),
    ).toMatchObject({
      targetPreview: {
        viewId: 'preview:project-view-1:temporary',
        expectedWorkbenchRevision: 4,
      },
    });
    expect(
      parseResourceBrowserIntentRequest({
        schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
        requestId: 'cut-1',
        identity,
        route: RESOURCE_BROWSER_ROUTES.addToCut,
        resourceId: 'content:clip',
        targetCut: {
          viewId: 'cut:view-1',
          viewEpoch: 3,
          documentId: 'cuts/story.otio',
          sessionId: 'cut-session:cut:view-1:3',
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
        schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
        requestId: 'cut-without-target',
        identity,
        route: RESOURCE_BROWSER_ROUTES.addToCut,
        resourceId: 'content:clip',
      }),
    ).toThrowError(ResourceBrowserContractError);
  });
});

function projection(facet: 'files' | 'media' | 'materials', items: readonly unknown[]) {
  return {
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    identity,
    revision: 1,
    facet,
    query: '',
    items,
  };
}
