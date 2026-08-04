import type { ProjectEntityRecord } from '@neko/entity-domain';
import { describe, expect, it, vi } from 'vitest';
import {
  RESOURCE_BROWSER_CONTRACT_VERSION,
  RESOURCE_BROWSER_ROUTES,
  ResourceBrowserContractError,
  createResourceBrowserChildrenRequest,
  createResourceBrowserSearchRequest,
  createResourceBrowserThumbnailRequest,
  type ResourceBrowserIdentity,
} from './contract';
import { ResourceBrowserController } from './controller';
import type {
  ResourceBrowserInteractionPort,
  ResourceBrowserContentEntry,
  ResourceBrowserProjectionSource,
} from './ports';

const identity: ResourceBrowserIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'resource-view-1',
  viewEpoch: 3,
  endpointEpoch: 'endpoint-1',
};

describe('Resource Browser controller', () => {
  it('uses one projection source for snapshot, facets, refresh and monotonic events', async () => {
    const source = createSource();
    const interactions = createInteractions();
    const controller = new ResourceBrowserController({
      identity,
      source,
      interactions,
      canvasAvailable: true,
    });
    const listener = vi.fn();
    controller.subscribe(listener);

    const snapshot = await controller.getSnapshot();
    const thumbnail = snapshot.items[0]?.thumbnail;
    const resourceId = snapshot.items[0]?.resourceId;
    expect(thumbnail).toBeDefined();
    expect(resourceId).toBeDefined();
    await expect(
      controller.resolveThumbnail(
        createResourceBrowserThumbnailRequest({
          requestId: 'thumbnail-1',
          identity,
          resourceId: resourceId ?? '',
          descriptor: thumbnail ?? {
            descriptorId: 'missing',
            revision: 'missing',
            mediaType: 'image',
          },
        }),
      ),
    ).resolves.toMatchObject({
      resourceId,
      descriptorId: thumbnail?.descriptorId,
      dataUrl: 'data:image/png;base64,aW1hZ2U=',
    });
    const entities = await controller.search(
      createResourceBrowserSearchRequest({
        requestId: 'search-1',
        identity,
        facet: 'entities',
        query: 'neko',
      }),
    );
    const refreshed = await controller.execute({
      schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
      requestId: 'refresh-1',
      identity,
      route: RESOURCE_BROWSER_ROUTES.refresh,
    });
    const withGlobalLibrary = await controller.execute({
      schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
      requestId: 'global-library-1',
      identity,
      route: RESOURCE_BROWSER_ROUTES.linkGlobalLibrary,
      expectedRevision: 2,
    });
    const withDirectoryLibrary = await controller.execute({
      schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
      requestId: 'directory-library-1',
      identity,
      route: RESOURCE_BROWSER_ROUTES.addDirectoryLibrary,
      expectedRevision: 3,
    });

    expect(snapshot.facet).toBe('files');
    expect(entities.items[0]).toMatchObject({
      facet: 'entities',
      kind: 'character',
      label: 'Neko',
      representationLocator: { kind: 'workspace-file', path: 'characters/neko.png' },
    });
    expect(source.refresh).toHaveBeenCalledWith(identity);
    expect(refreshed.revision).toBe(2);
    expect(interactions.linkGlobalLibrary).toHaveBeenCalledWith({ identity });
    expect(interactions.addDirectoryLibrary).toHaveBeenCalledWith({ identity });
    expect(withGlobalLibrary.revision).toBe(3);
    expect(withDirectoryLibrary.revision).toBe(4);
    expect(listener.mock.calls.map(([event]) => event.sequence)).toEqual([1, 2, 3, 4]);
  });

  it('fences stale owners and stale resource identity before an effect runs', async () => {
    const interactions = createInteractions();
    const controller = new ResourceBrowserController({
      identity,
      source: createSource(),
      interactions,
    });

    await expect(
      controller.search(
        createResourceBrowserSearchRequest({
          requestId: 'stale-search',
          identity: { ...identity, viewEpoch: identity.viewEpoch + 1 },
          facet: 'media',
          query: '',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'resource-browser-stale-identity',
    } satisfies Partial<ResourceBrowserContractError>);
    await expect(
      controller.execute({
        schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
        requestId: 'stale-item',
        identity,
        route: RESOURCE_BROWSER_ROUTES.preview,
        resourceId: 'content:missing',
        targetPreview: {
          viewId: 'preview:resource-view-1:temporary',
          presentation: 'temporary',
          expectedWorkbenchRevision: 0,
        },
      }),
    ).rejects.toMatchObject({
      code: 'resource-browser-stale-identity',
    } satisfies Partial<ResourceBrowserContractError>);
    expect(interactions.preview).not.toHaveBeenCalled();
    const snapshot = await controller.getSnapshot();
    const thumbnail = snapshot.items[0]?.thumbnail;
    if (!thumbnail) throw new Error('Resource Browser fixture has no thumbnail.');
    await expect(
      controller.resolveThumbnail(
        createResourceBrowserThumbnailRequest({
          requestId: 'stale-thumbnail',
          identity,
          resourceId: snapshot.items[0]?.resourceId ?? 'missing',
          descriptor: { ...thumbnail, revision: 'stale-revision' },
        }),
      ),
    ).rejects.toMatchObject({
      code: 'resource-browser-stale-identity',
    } satisfies Partial<ResourceBrowserContractError>);
    expect(interactions.resolveThumbnail).not.toHaveBeenCalled();
  });

  it('requires an explicit Canvas target and releases subscriptions on dispose', async () => {
    const interactions = createInteractions();
    const controller = new ResourceBrowserController({
      identity,
      source: createSource(),
      interactions,
    });
    const snapshot = await controller.getSnapshot();
    const resourceId = snapshot.items[0]?.resourceId;
    expect(resourceId).toBeDefined();

    await expect(
      controller.execute({
        schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
        requestId: 'canvas-without-target',
        identity,
        route: RESOURCE_BROWSER_ROUTES.addToCanvas,
        resourceId,
      }),
    ).rejects.toMatchObject({
      code: 'invalid-resource-browser-payload',
    } satisfies Partial<ResourceBrowserContractError>);

    const listener = vi.fn();
    controller.subscribe(listener);
    controller.dispose();
    await expect(controller.getSnapshot()).rejects.toThrow('disposed');
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not publish a stale search that resolves after a newer request', async () => {
    let resolveOlder: ((entries: readonly ResourceBrowserContentEntry[]) => void) | undefined;
    const baseSource = createSource();
    const source: ResourceBrowserProjectionSource = {
      ...baseSource,
      files: {
        children: baseSource.files.children,
        list: vi.fn(({ query }) => {
          if (query === 'older') {
            return new Promise<readonly ResourceBrowserContentEntry[]>((resolve) => {
              resolveOlder = resolve;
            });
          }
          return Promise.resolve([]);
        }),
      },
    };
    const controller = new ResourceBrowserController({
      identity,
      source,
      interactions: createInteractions(),
      initialFacet: 'entities',
    });
    await controller.getSnapshot();
    const listener = vi.fn();
    controller.subscribe(listener);

    const older = controller.search(
      createResourceBrowserSearchRequest({
        requestId: 'search-older',
        identity,
        facet: 'files',
        query: 'older',
      }),
    );
    const newer = controller.search(
      createResourceBrowserSearchRequest({
        requestId: 'search-newer',
        identity,
        facet: 'files',
        query: 'newer',
      }),
    );
    await newer;
    resolveOlder?.([]);
    await older;

    expect((await controller.getSnapshot()).query).toBe('newer');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('loads only direct children for an explicit expandable parent', async () => {
    const parent: ResourceBrowserContentEntry = {
      locator: { kind: 'workspace-file', path: 'characters' },
      label: 'characters',
      availability: 'available',
      capabilities: ['read'],
      metadata: { mediaType: 'directory' },
      role: 'directory',
      depth: 0,
    };
    const child: ResourceBrowserContentEntry = {
      locator: { kind: 'workspace-file', path: 'characters/hero.glb' },
      parentLocator: parent.locator,
      label: 'hero.glb',
      availability: 'available',
      capabilities: ['read', 'preview'],
      metadata: { mediaType: 'model' },
      role: 'content',
      depth: 1,
    };
    const source = createSource();
    source.files.list = vi.fn(async () => [parent]);
    source.files.children = vi.fn(async () => [child]);
    const controller = new ResourceBrowserController({
      identity,
      source,
      interactions: createInteractions(),
      initialFacet: 'files',
    });
    const snapshot = await controller.getSnapshot();
    const parentItem = snapshot.items[0];
    if (!parentItem) throw new Error('Missing parent fixture.');

    const next = await controller.children(
      createResourceBrowserChildrenRequest({
        requestId: 'children-1',
        identity,
        facet: 'files',
        parentResourceId: parentItem.resourceId,
      }),
    );

    expect(source.files.children).toHaveBeenCalledWith({
      identity,
      parent: parentItem,
      limit: 100,
    });
    expect(next.items.map((item) => item.label)).toEqual(['characters', 'hero.glb']);
    expect(next.items[1]?.parentResourceId).toBe(parentItem.resourceId);
  });
});

function createSource(): ResourceBrowserProjectionSource & {
  readonly refresh: ReturnType<typeof vi.fn>;
} {
  const media: ResourceBrowserContentEntry = {
    locator: { kind: 'workspace-file', path: 'assets/cat.png' },
    label: 'cat.png',
    availability: 'available',
    capabilities: ['read', 'preview', 'bind'],
    metadata: { mediaType: 'image' },
    role: 'content',
    depth: 0,
  };
  const entity: ProjectEntityRecord = {
    entityId: 'character-neko',
    kind: 'character',
    names: { canonical: 'Neko', aliases: ['猫'] },
    facts: {},
    representations: [
      {
        bindingId: 'binding-neko',
        target: { kind: 'workspace-file', path: 'characters/neko.png' },
        role: 'portrait',
        source: 'user',
        acceptedAt: '2026-07-28T00:00:00.000Z',
      },
    ],
    lifecycle: { state: 'active' },
    createdAt: '2026-07-28T00:00:00.000Z',
    updatedAt: '2026-07-28T00:00:00.000Z',
  };
  return {
    files: {
      list: vi.fn(async () => [media]),
      children: vi.fn(async () => []),
    },
    media: {
      search: vi.fn(async () => [media]),
      children: vi.fn(async () => []),
    },
    assets: {
      list: vi.fn(async () => [
        {
          id: 'global-asset-library:lighting',
          owner: 'global-asset-library' as const,
          label: 'Lighting preset',
          kind: 'asset' as const,
          availability: 'available' as const,
        },
      ]),
    },
    entities: {
      list: vi.fn(async () => ({
        projections: [
          {
            projectionId: `entity:${entity.entityId}`,
            status: 'confirmed' as const,
            entity,
            bindingAvailability: [],
            sourceOwners: ['project-entity'] as const,
          },
        ],
      })),
    },
    refresh: vi.fn(async () => undefined),
  };
}

function createInteractions(): ResourceBrowserInteractionPort & {
  readonly linkGlobalLibrary: ReturnType<typeof vi.fn>;
  readonly addDirectoryLibrary: ReturnType<typeof vi.fn>;
  readonly preview: ReturnType<typeof vi.fn>;
  readonly openCut: ReturnType<typeof vi.fn>;
  readonly reveal: ReturnType<typeof vi.fn>;
  readonly resolveThumbnail: ReturnType<typeof vi.fn>;
  readonly addToCanvas: ReturnType<typeof vi.fn>;
  readonly addToCut: ReturnType<typeof vi.fn>;
} {
  return {
    linkGlobalLibrary: vi.fn(async () => 'linked' as const),
    addDirectoryLibrary: vi.fn(async () => 'added' as const),
    relinkSource: vi.fn(async () => 'relinked' as const),
    removeSource: vi.fn(async () => undefined),
    preview: vi.fn(async () => undefined),
    openCut: vi.fn(async () => undefined),
    reveal: vi.fn(async () => undefined),
    resolveThumbnail: vi.fn(async () => 'data:image/png;base64,aW1hZ2U='),
    addToCanvas: vi.fn(async () => undefined),
    addToCut: vi.fn(async () => undefined),
  };
}
