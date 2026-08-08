import type { ProjectEntityRecord } from '@neko/entity-domain';
import { describe, expect, it, vi } from 'vitest';
import {
  RESOURCE_BROWSER_ROUTES,
  ResourceBrowserContractError,
  createResourceBrowserChildrenRequest,
  createResourceBrowserEntityIntentRequest,
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
  viewInstanceId: 'view-instance-3',
  rendererSessionId: 'endpoint-1',
};

describe('Resource Browser controller', () => {
  it('uses one projection source for snapshot, facets, reconciliation and monotonic events', async () => {
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
            sourceFingerprint: 'missing',
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
    const refreshed = await controller.reconcile();
    const withGlobalLibrary = await controller.execute({
      requestId: 'global-library-1',
      identity,
      route: RESOURCE_BROWSER_ROUTES.linkGlobalLibrary,
    });
    const withDirectoryLibrary = await controller.execute({
      requestId: 'directory-library-1',
      identity,
      route: RESOURCE_BROWSER_ROUTES.addDirectoryLibrary,
    });

    expect(snapshot.facet).toBe('files');
    expect(entities.items[0]).toMatchObject({
      facet: 'entities',
      kind: 'character',
      label: 'Neko',
      representationLocator: { kind: 'workspace-file', path: 'characters/neko.png' },
    });
    expect(source.refresh).toHaveBeenCalledWith(identity);
    expect(refreshed.facet).toBe('entities');
    expect(interactions.linkGlobalLibrary).toHaveBeenCalledWith({ identity });
    expect(interactions.addDirectoryLibrary).toHaveBeenCalledWith({ identity });
    expect(withGlobalLibrary.facet).toBe('entities');
    expect(withDirectoryLibrary.facet).toBe('entities');
    expect(listener.mock.calls.map(([event]) => event.sequence)).toEqual([1, 2, 3, 4]);
  });

  it('keeps valid Entity items available beside an exact record diagnostic', async () => {
    const source = createSource();
    const entityResult = await source.entities.list({ identity, query: '', limit: 20 });
    vi.mocked(source.entities.list).mockResolvedValue({
      ...entityResult,
      diagnostics: [
        {
          code: 'invalid-project-entity-document',
          message: "Project Entity 'character-invalid' violates the canonical fact contract.",
          entityId: 'character-invalid',
        },
      ],
    });
    const controller = new ResourceBrowserController({
      identity,
      source,
      interactions: createInteractions(),
    });

    await expect(
      controller.search(
        createResourceBrowserSearchRequest({
          requestId: 'search-local-diagnostic',
          identity,
          facet: 'entities',
          query: '',
        }),
      ),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ label: 'Neko' })],
      diagnostics: [
        {
          code: 'invalid-project-entity-document',
          message: "Project Entity 'character-invalid' violates the canonical fact contract.",
          recordId: 'character-invalid',
        },
      ],
    });
  });

  it('allows Rescan only after an observation failure and clears the local diagnostic', async () => {
    const source = createSource();
    const controller = new ResourceBrowserController({
      identity,
      source,
      interactions: createInteractions(),
    });
    await controller.getSnapshot();

    await expect(
      controller.execute({
        requestId: 'rescan-before-failure',
        identity,
        route: RESOURCE_BROWSER_ROUTES.reconcile,
      }),
    ).rejects.toThrow('only after an observation failure');

    await controller.reportObservationFailure('Watcher stopped.');
    const reconciled = await controller.execute({
      requestId: 'rescan-after-failure',
      identity,
      route: RESOURCE_BROWSER_ROUTES.reconcile,
    });
    expect(reconciled.diagnostics).toBeUndefined();
    expect(source.refresh).toHaveBeenCalledWith(identity);
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
          identity: { ...identity, viewInstanceId: 'view-instance-stale' },
          facet: 'media',
          query: '',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'resource-browser-stale-identity',
    } satisfies Partial<ResourceBrowserContractError>);
    await expect(
      controller.execute({
        requestId: 'stale-item',
        identity,
        route: RESOURCE_BROWSER_ROUTES.preview,
        resourceId: 'content:missing',
        targetPreview: {
          viewId: 'preview:resource-view-1:temporary',
          presentation: 'temporary',
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
          descriptor: { ...thumbnail, sourceFingerprint: 'stale-fingerprint' },
        }),
      ),
    ).rejects.toMatchObject({
      code: 'resource-browser-stale-identity',
    } satisfies Partial<ResourceBrowserContractError>);
    expect(interactions.resolveThumbnail).not.toHaveBeenCalled();
  });

  it('retains opened facet projections and does not reload an unchanged facet', async () => {
    const source = createSource();
    const controller = new ResourceBrowserController({
      identity,
      source,
      interactions: createInteractions(),
    });

    const files = await controller.getSnapshot();
    const media = await controller.search(
      createResourceBrowserSearchRequest({
        requestId: 'open-media',
        identity,
        facet: 'media',
        query: '',
      }),
    );
    const restoredFiles = await controller.search(
      createResourceBrowserSearchRequest({
        requestId: 'restore-files',
        identity,
        facet: 'files',
        query: '',
      }),
    );

    expect(media.facet).toBe('media');
    expect(restoredFiles).toBe(files);
    expect(source.files.list).toHaveBeenCalledTimes(1);
    expect(source.media.search).toHaveBeenCalledTimes(1);
  });

  it('keeps a valid sibling facet available when one facet entry read fails', async () => {
    const source = createSource();
    source.media.search = vi.fn(async () => {
      throw new Error('Media entry media:broken is invalid.');
    });
    const controller = new ResourceBrowserController({
      identity,
      source,
      interactions: createInteractions(),
    });
    const files = await controller.getSnapshot();

    await expect(
      controller.search(
        createResourceBrowserSearchRequest({
          requestId: 'media-invalid-entry',
          identity,
          facet: 'media',
          query: '',
        }),
      ),
    ).rejects.toThrow('media:broken');

    await expect(
      controller.search(
        createResourceBrowserSearchRequest({
          requestId: 'files-after-media-failure',
          identity,
          facet: 'files',
          query: '',
        }),
      ),
    ).resolves.toBe(files);
    expect(source.files.list).toHaveBeenCalledOnce();
  });

  it('routes Workspace File mutations only through Files interactions', async () => {
    const interactions = createInteractions();
    const controller = new ResourceBrowserController({
      identity,
      source: createSource(),
      interactions,
    });
    await controller.getSnapshot();

    await controller.execute({
      requestId: 'create-directory-1',
      identity,
      route: RESOURCE_BROWSER_ROUTES.createDirectory,
      entryName: 'References',
    });
    await controller.execute({
      requestId: 'create-file-1',
      identity,
      route: RESOURCE_BROWSER_ROUTES.createFile,
      entryName: 'notes.md',
    });
    await controller.execute({
      requestId: 'create-cut-1',
      identity,
      route: RESOURCE_BROWSER_ROUTES.createCreativeDocument,
      entryName: 'Rough Cut',
      documentKind: 'cut',
    });
    const current = await controller.getSnapshot();
    const file = current.items[0];
    if (!file) throw new Error('Expected a projected Workspace File.');
    await controller.execute({
      requestId: 'trash-file-1',
      identity,
      route: RESOURCE_BROWSER_ROUTES.trashContent,
      resourceId: file.resourceId,
    });

    expect(interactions.createDirectory).toHaveBeenCalledWith({ identity, name: 'References' });
    expect(interactions.createFile).toHaveBeenCalledWith({ identity, name: 'notes.md' });
    expect(interactions.createCreativeDocument).toHaveBeenCalledWith({
      identity,
      kind: 'cut',
      name: 'Rough Cut',
    });
    expect(interactions.trashContent).toHaveBeenCalledWith({ identity, item: file });
  });

  it('preserves the Files projection when a published creative document cannot open', async () => {
    const interactions = createInteractions();
    vi.mocked(interactions.createCreativeDocument).mockResolvedValue({
      status: 'created',
      diagnostic: {
        code: 'creative-document-open-failed',
        message: 'Created Board.nkc, but its editor could not open.',
        recordId: 'content:board',
      },
    });
    const controller = new ResourceBrowserController({
      identity,
      source: createSource(),
      interactions,
    });
    await controller.getSnapshot();

    const result = await controller.execute({
      requestId: 'create-canvas-open-failed',
      identity,
      route: RESOURCE_BROWSER_ROUTES.createCreativeDocument,
      entryName: 'Board',
      documentKind: 'canvas',
    });

    expect(result.items).not.toHaveLength(0);
    expect(result.diagnostics).toContainEqual({
      code: 'creative-document-open-failed',
      message: 'Created Board.nkc, but its editor could not open.',
      recordId: 'content:board',
    });
  });

  it('reconciles the exact target directory after nested creative document creation', async () => {
    const directory: ResourceBrowserContentEntry = {
      locator: { kind: 'workspace-file', path: 'References' },
      label: 'References',
      availability: 'available',
      capabilities: ['read'],
      metadata: { mediaType: 'directory' },
      role: 'directory',
      depth: 0,
    };
    const board: ResourceBrowserContentEntry = {
      locator: { kind: 'workspace-file', path: 'References/Board.nkc' },
      parentLocator: directory.locator,
      label: 'Board.nkc',
      availability: 'available',
      capabilities: ['read'],
      metadata: { mediaType: 'application/json' },
      role: 'content',
      depth: 1,
    };
    const source = createSource();
    source.files.list = vi.fn(async () => [directory]);
    source.files.children = vi.fn(async () => [board]);
    const controller = new ResourceBrowserController({
      identity,
      source,
      interactions: createInteractions(),
    });
    const snapshot = await controller.getSnapshot();
    const target = snapshot.items[0];
    if (!target) throw new Error('Creation target fixture is missing.');

    const result = await controller.execute({
      requestId: 'create-board-in-references',
      identity,
      route: RESOURCE_BROWSER_ROUTES.createCreativeDocument,
      resourceId: target.resourceId,
      entryName: 'Board',
      documentKind: 'canvas',
    });

    expect(result.items.map((item) => item.label)).toEqual(['References', 'Board.nkc']);
    expect(source.files.children).toHaveBeenCalledWith({
      identity,
      parent: expect.objectContaining({ resourceId: target.resourceId }),
      limit: 100,
    });
  });

  it('resolves selected directories, selected-file parents, and no selection without fallback', async () => {
    const directory: ResourceBrowserContentEntry = {
      locator: { kind: 'workspace-file', path: 'References' },
      label: 'References',
      availability: 'available',
      capabilities: ['read'],
      metadata: { mediaType: 'directory' },
      role: 'directory',
      depth: 0,
    };
    const file: ResourceBrowserContentEntry = {
      locator: { kind: 'workspace-file', path: 'References/notes.md' },
      parentLocator: directory.locator,
      label: 'notes.md',
      availability: 'available',
      capabilities: ['read'],
      metadata: { mediaType: 'text' },
      role: 'content',
      depth: 1,
    };
    const source = createSource();
    source.files.list = vi.fn(async () => [directory]);
    source.files.children = vi.fn(async () => [file]);
    const interactions = createInteractions();
    const controller = new ResourceBrowserController({ identity, source, interactions });
    const snapshot = await controller.getSnapshot();
    const directoryItem = snapshot.items.find((item) => item.label === 'References');
    if (!directoryItem) throw new Error('Creation directory fixture is missing.');
    const expanded = await controller.children(
      createResourceBrowserChildrenRequest({
        requestId: 'load-creation-directory',
        identity,
        facet: 'files',
        parentResourceId: directoryItem.resourceId,
      }),
    );
    const fileItem = expanded.items.find((item) => item.label === 'notes.md');
    if (!fileItem) throw new Error('Creation file fixture is missing.');

    await controller.execute({
      requestId: 'create-under-directory',
      identity,
      route: RESOURCE_BROWSER_ROUTES.createFile,
      resourceId: directoryItem.resourceId,
      entryName: 'sources.md',
    });
    await controller.execute({
      requestId: 'create-beside-file',
      identity,
      route: RESOURCE_BROWSER_ROUTES.createDirectory,
      resourceId: fileItem.resourceId,
      entryName: 'Drafts',
    });
    await controller.execute({
      requestId: 'create-at-root',
      identity,
      route: RESOURCE_BROWSER_ROUTES.createFile,
      entryName: 'README.md',
    });

    expect(interactions.createFile).toHaveBeenNthCalledWith(1, {
      identity,
      parent: directoryItem,
      name: 'sources.md',
    });
    expect(interactions.createDirectory).toHaveBeenCalledWith({
      identity,
      parent: directoryItem,
      name: 'Drafts',
    });
    expect(interactions.createFile).toHaveBeenNthCalledWith(2, {
      identity,
      name: 'README.md',
    });
  });

  it('delegates Entity intents only after capability and exact identity checks', async () => {
    const interactions = createInteractions();
    const controller = new ResourceBrowserController({
      identity,
      source: createSource(),
      interactions,
      initialFacet: 'entities',
    });
    const snapshot = await controller.getSnapshot();
    const item = snapshot.items[0];
    if (!item || item.facet !== 'entities' || item.entityStatus === 'candidate') {
      throw new Error('Missing confirmed Entity fixture.');
    }
    const intent = {
      type: 'edit' as const,
      entityId: item.entityRef.entityId,
      changes: { names: { canonical: 'Neko Aoki', aliases: ['Neko'] } },
    };

    await controller.execute(
      createResourceBrowserEntityIntentRequest({
        requestId: 'entity-edit',
        identity,
        resourceId: item.resourceId,
        intent,
      }),
    );
    expect(interactions.manageEntity).toHaveBeenCalledWith({ identity, item, intent });

    await expect(
      controller.execute(
        createResourceBrowserEntityIntentRequest({
          requestId: 'entity-wrong-owner',
          identity,
          resourceId: item.resourceId,
          intent: { ...intent, entityId: 'character-other' },
        }),
      ),
    ).rejects.toMatchObject({ code: 'resource-browser-stale-identity' });
    expect(interactions.manageEntity).toHaveBeenCalledTimes(1);
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

  it('re-reads loaded empty directories during authoritative reconciliation', async () => {
    const parent: ResourceBrowserContentEntry = {
      locator: { kind: 'workspace-file', path: 'References' },
      label: 'References',
      availability: 'available',
      capabilities: ['read'],
      metadata: { mediaType: 'directory' },
      role: 'directory',
      depth: 0,
    };
    const child: ResourceBrowserContentEntry = {
      locator: { kind: 'workspace-file', path: 'References/Board.nkc' },
      parentLocator: parent.locator,
      label: 'Board.nkc',
      availability: 'available',
      capabilities: ['read'],
      metadata: { mediaType: 'application/json' },
      role: 'content',
      depth: 1,
    };
    const source = createSource();
    source.files.list = vi.fn(async () => [parent]);
    source.files.children = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([child]);
    const controller = new ResourceBrowserController({
      identity,
      source,
      interactions: createInteractions(),
      initialFacet: 'files',
    });
    const snapshot = await controller.getSnapshot();
    const parentItem = snapshot.items[0];
    if (!parentItem) throw new Error('Missing empty directory fixture.');

    await controller.children(
      createResourceBrowserChildrenRequest({
        requestId: 'load-empty-directory',
        identity,
        facet: 'files',
        parentResourceId: parentItem.resourceId,
      }),
    );
    const reconciled = await controller.reconcile();

    expect(reconciled.items.map((item) => item.label)).toEqual(['References', 'Board.nkc']);
    expect(source.files.children).toHaveBeenCalledTimes(2);
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
  readonly manageEntity: ReturnType<typeof vi.fn>;
  readonly linkGlobalLibrary: ReturnType<typeof vi.fn>;
  readonly addDirectoryLibrary: ReturnType<typeof vi.fn>;
  readonly preview: ReturnType<typeof vi.fn>;
  readonly openCreativeDocument: ReturnType<typeof vi.fn>;
  readonly reveal: ReturnType<typeof vi.fn>;
  readonly resolveThumbnail: ReturnType<typeof vi.fn>;
  readonly addToCanvas: ReturnType<typeof vi.fn>;
  readonly addToCut: ReturnType<typeof vi.fn>;
} {
  return {
    createCreativeDocument: vi.fn(async () => ({ status: 'opened' as const })),
    createFile: vi.fn(async () => undefined),
    createDirectory: vi.fn(async () => undefined),
    trashContent: vi.fn(async () => undefined),
    manageEntity: vi.fn(async () => undefined),
    linkGlobalLibrary: vi.fn(async () => 'linked' as const),
    addDirectoryLibrary: vi.fn(async () => 'added' as const),
    relinkSource: vi.fn(async () => 'relinked' as const),
    removeSource: vi.fn(async () => undefined),
    preview: vi.fn(async () => undefined),
    openCreativeDocument: vi.fn(async () => undefined),
    reveal: vi.fn(async () => undefined),
    resolveThumbnail: vi.fn(async () => 'data:image/png;base64,aW1hZ2U='),
    addToCanvas: vi.fn(async () => undefined),
    addToCut: vi.fn(async () => undefined),
  };
}
