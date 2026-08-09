import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { DEFAULT_CANVAS_DATA } from '@neko/canvas-domain';
import type { ILogger } from '@neko/shared/logger';
import { parseCanvasHostIntentRequest, type CanvasHostIntentResult } from '@neko/canvas-domain';
import {
  createResourceBrowserEntityIntentRequest,
  createResourceBrowserSearchRequest,
  createResourceBrowserSnapshotRequest,
  type ResourceBrowserProjectionEvent,
} from '@neko/assets-domain/resource-browser/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCanvasHostSessionId } from '@neko/canvas-domain';
import { createDesktopResourceBrowserIdentity } from '../shared/resource-browser-bridge-contract';
import {
  DESKTOP_PRIMARY_MAIN_GROUP_ID,
  createDefaultDesktopWorkbenchLayout,
  type DesktopWorkbenchViewRef,
} from '@neko/host/desktop-workbench-contract';
import {
  createResourceToCanvasInteraction,
  ResourceBrowserNodeRuntime,
  type ResourceBrowserNodeRuntimeOptions,
} from '@neko/assets-node';
import { createElectronNekoHostPorts } from './electron-host-ports';
import { createGlobalMediaLibraryConnection } from '@neko/assets-node';
import { DesktopShellService } from '@neko/host/desktop-shell-service';
import {
  resolveActiveDesktopWindowWorkbench,
  resolveDesktopWindowWorkspaceWorkbench,
  type DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';
import {
  createDefaultDesktopApplicationSidebar,
  createDesktopSceneTransitionRequest,
  parseDesktopWorkbenchSceneProjection,
} from '@neko/host/desktop-scene-contract';
import { createDesktopWindowComposition } from '@neko/host/desktop-window-composition-contract';
import { DesktopWorkspaceGrantAuthority } from '@neko/host/desktop-workspace-grant-authority';
import { createInMemoryDesktopShellStateRepository } from '@neko/host/testing/desktop-shell-state';
import type { DesktopWorkspaceRegistry } from './desktop-workspace-registry';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import {
  initializeAssetLibraryMembershipTables,
  resolveGlobalStorageLayout,
  type LocalMetadataStore,
} from '@neko/local-metadata';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import { initializeCoreLocalMetadataTables } from '@neko/local-metadata/sqlite';

const temporaryRoots: string[] = [];
const metadataStores: LocalMetadataStore[] = [];

afterEach(async () => {
  await Promise.all(
    metadataStores.splice(0).map(async (store) => {
      if (store.state !== 'disposed') await store.dispose();
    }),
  );
  for (const root of temporaryRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

const resourceIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'resource-browser:project-view-1',
  viewInstanceId: 'view-instance-1',
  rendererSessionId: 'endpoint-1',
} as const;
const canvasView: DesktopWorkbenchViewRef = {
  viewId: 'canvas:board-a',
  viewInstanceId: 'view-instance-1',
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  kind: 'canvas',
  ownerId: 'canvas:board-a',
  displayLabel: 'a.nkc',
  documentId: 'boards/a.nkc',
};

describe('createResourceToCanvasInteraction', () => {
  it('routes a stable ContentLocator to the exact revisioned Canvas session', async () => {
    const executeIntent = vi.fn<ResourceBrowserNodeRuntimeOptions['canvas']['executeIntent']>(
      async (_windowId, payload) => accepted(payload),
    );
    const addToCanvas = createResourceToCanvasInteraction({
      shell: shellWithViews([canvasView]),
      canvas: { executeIntent },
      windowId: 'window-1',
    });

    await addToCanvas({
      identity: resourceIdentity,
      item: {
        resourceId: 'content:cat',
        facet: 'media',
        role: 'content',
        depth: 0,
        kind: 'image',
        label: 'cat.png',
        locator: { kind: 'workspace-file', path: 'media/cat.png' },
        capabilities: ['preview', 'reveal', 'add-to-canvas'],
      },
      target: {
        documentId: 'boards/a.nkc',
        sessionId: createCanvasHostSessionId(canvasView.viewId, canvasView.viewInstanceId),
      },
    });

    expect(executeIntent).toHaveBeenCalledWith(
      'window-1',
      expect.objectContaining({
        identity: expect.objectContaining({
          viewId: canvasView.viewId,
          documentId: 'boards/a.nkc',
          sessionId: createCanvasHostSessionId(canvasView.viewId, canvasView.viewInstanceId),
        }),
        intent: {
          type: 'author-material',
          request: {
            kind: 'direct-reference',
            identity: {
              projectId: 'project-1',
              canvasId: 'boards/a.nkc',
              canvasSessionId: createCanvasHostSessionId(
                canvasView.viewId,
                canvasView.viewInstanceId,
              ),
            },
            locator: { kind: 'workspace-file', path: 'media/cat.png' },
            mediaKind: 'image',
            title: 'cat.png',
          },
        },
      }),
    );
  });

  it('rejects a stale target instead of falling back to another active Canvas', async () => {
    const executeIntent = vi.fn<ResourceBrowserNodeRuntimeOptions['canvas']['executeIntent']>();
    const addToCanvas = createResourceToCanvasInteraction({
      shell: shellWithViews([
        {
          ...canvasView,
          viewId: 'canvas:active',
          documentId: 'boards/active.nkc',
        },
      ]),
      canvas: { executeIntent },
      windowId: 'window-1',
    });

    await expect(
      addToCanvas({
        identity: resourceIdentity,
        item: {
          resourceId: 'content:cat',
          facet: 'media',
          role: 'content',
          depth: 0,
          kind: 'image',
          label: 'cat.png',
          locator: { kind: 'workspace-file', path: 'media/cat.png' },
          capabilities: ['add-to-canvas'],
        },
        target: {
          documentId: 'boards/missing.nkc',
          sessionId: 'canvas-session:missing',
        },
      }),
    ).rejects.toThrow('stale or not attached');
    expect(executeIntent).not.toHaveBeenCalled();
  });

  it('retains stable Entity and active representation evidence in Canvas authoring', async () => {
    const executeIntent = vi.fn<ResourceBrowserNodeRuntimeOptions['canvas']['executeIntent']>(
      async (_windowId, payload) => accepted(payload),
    );
    const addToCanvas = createResourceToCanvasInteraction({
      shell: shellWithViews([canvasView]),
      canvas: { executeIntent },
      windowId: 'window-1',
    });

    await addToCanvas({
      identity: resourceIdentity,
      item: {
        resourceId: 'entity:character-neko',
        facet: 'entities',
        role: 'entity',
        depth: 0,
        kind: 'character',
        label: 'Neko',
        entityRef: { entityId: 'character-neko', entityKind: 'character' },
        entityStatus: 'confirmed',
        sourceOwners: ['project-entity'],
        attentionBindingIds: [],
        inspector: {
          status: 'confirmed',
          kind: 'character',
          names: { canonical: 'Neko', aliases: [] },
          facts: {},
          entityId: 'character-neko',
          bindings: [],
          operations: ['edit'],
          blockers: [],
        },
        representationAvailability: 'active',
        representationLocator: {
          kind: 'workspace-file',
          path: 'characters/neko.png',
        },
        representationBindingId: 'binding-neko-portrait',
        representationRole: 'portrait',
        capabilities: ['preview', 'add-to-canvas'],
      },
      target: {
        documentId: 'boards/a.nkc',
        sessionId: createCanvasHostSessionId(canvasView.viewId, canvasView.viewInstanceId),
      },
    });

    expect(executeIntent).toHaveBeenCalledWith(
      'window-1',
      expect.objectContaining({
        intent: {
          type: 'author-material',
          request: expect.objectContaining({
            kind: 'direct-reference',
            locator: {
              kind: 'workspace-file',
              path: 'characters/neko.png',
            },
            entity: {
              entityId: 'character-neko',
              bindingId: 'binding-neko-portrait',
              role: 'portrait',
            },
          }),
        },
      }),
    );
  });
});

describe('ResourceBrowserNodeRuntime Project identity', () => {
  it('authorizes the right-Dock browser through its Project View without a Resource Main View', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-project-resource-runtime-'));
    temporaryRoots.push(root);
    const workspacePath = path.join(root, 'workspace');
    await mkdir(workspacePath, { recursive: true });
    const registry: DesktopWorkspaceRegistry = {
      listProjects: async () => [],
      removeProjects: async () => false,
      resolve: async () => ({
        workspaceId: 'workspace-1',
        workspacePath,
        displayName: 'Workspace',
        locator: { kind: 'relative', value: 'workspace' },
      }),
      dispose: async () => undefined,
    };
    const workspaceGrantAuthority = new DesktopWorkspaceGrantAuthority({
      resolver: registry,
      createIdentity: () => 'workspace-grant-1',
    });
    const shell = new DesktopShellService({
      applicationInstanceId: 'app-1',
      stateRepository: createInMemoryDesktopShellStateRepository(),
      workspaceRegistry: registry,
      workspaceGrantAuthority,
      createIdentity: () => 'window-1',
    });
    const windowId = await shell.claimWindowId();
    shell.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await shell.getProjection(windowId);
    const opened = await shell.openContent(windowId, workspacePath, initial.rendererSessionId);
    const workspaceGrant = workspaceGrantAuthority.authorize({
      windowId,
      label: 'Workspace',
      hostResource: workspacePath,
    });
    await shell.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'open-workspace-scene',
        rendererSessionId: opened.projection.rendererSessionId,
        windowId,
        sceneId: resolveActiveDesktopWindowWorkbench(opened.projection.window).scene.sceneId,
        intent: { kind: 'open-workspace', workspaceGrantId: workspaceGrant.workspaceGrantId },
      }),
    );
    const projection = await shell.getProjection(windowId);
    const tab = projection.window.tabs[0];
    const project = projection.catalog.projects[0];
    if (!tab || !project) throw new Error('Project Resource runtime fixture failed to attach.');
    await mkdir(path.join(workspacePath, 'neko'), { recursive: true });
    await writeFile(
      path.join(workspacePath, 'neko', 'entities.json'),
      `${JSON.stringify({
        projectId: project.workspaceId,
        entities: [
          {
            entityId: 'character-rin',
            kind: 'character',
            names: { canonical: 'Rin', aliases: [] },
            facts: {},
            representations: [],
            lifecycle: { state: 'active' },
            createdAt: '2026-08-05T00:00:00.000Z',
            updatedAt: '2026-08-05T00:00:00.000Z',
          },
        ],
      })}\n`,
      'utf8',
    );
    const identity = createDesktopResourceBrowserIdentity({
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      windowId,
      projectViewId: tab.viewId,
      projectViewInstanceId: tab.viewInstanceId,
      rendererSessionId: projection.rendererSessionId,
    });
    const host = createElectronNekoHostPorts({
      homedir: root,
      nekoHome: path.join(root, '.neko'),
      logger: createLogger(),
      revealPath: () => undefined,
    });
    const executeEntityIntent = vi.fn(async () => undefined);
    const runtime = new ResourceBrowserNodeRuntime({
      globalAssetRoot: path.join(root, '.neko', 'assets'),
      globalMediaLibraryRoot: path.join(root, '.neko', 'media-libraries'),
      shell,
      host,
      openPreview: async () => undefined,
      openCreativeDocument: async () => undefined,
      openTextEditor: async () => undefined,
      selectSource: async () => undefined,
      trashWorkspaceItem: async () => undefined,
      selectConfiguredGlobalMediaLibrary: async () => undefined,
      selectGlobalMediaLibrarySource: async () => undefined,
      selectGlobalAssetSources: async () => undefined,
      selectGlobalLibraryMoveDestination: async () => undefined,
      createThumbnail: async () => 'data:image/png;base64,AA==',
      createGlobalLibraryThumbnail: async () => 'data:image/png;base64,AA==',
      openQuickPreview: async () => {
        throw new Error('Quick Preview is not expected by this identity test.');
      },
      releaseQuickPreview: () => undefined,
      canvas: {
        executeIntent: async () => {
          throw new Error('Canvas execution is not expected by this identity test.');
        },
      },
      entity: {
        executeIntent: executeEntityIntent,
      },
      cut: { addResource: async () => undefined },
    });

    try {
      await expect(
        runtime.getSnapshot(
          windowId,
          createResourceBrowserSnapshotRequest({ requestId: 'snapshot-1', identity }),
        ),
      ).resolves.toMatchObject({ identity });
      const projectionEvents: ResourceBrowserProjectionEvent[] = [];
      const unsubscribe = await runtime.subscribe(windowId, identity, (event) => {
        projectionEvents.push(event);
      });
      try {
        await writeFile(path.join(workspacePath, 'externally-added.txt'), 'external', 'utf8');
        await vi.waitFor(
          () => {
            expect(
              projectionEvents.some((event) =>
                event.projection.items.some((item) => item.label === 'externally-added.txt'),
              ),
            ).toBe(true);
          },
          { timeout: 5_000, interval: 25 },
        );
        const focusEventStart = projectionEvents.length;
        await writeFile(path.join(workspacePath, 'focus-reconciled.txt'), 'focus', 'utf8');
        await runtime.reconcileWindow(windowId);
        expect(
          projectionEvents
            .slice(focusEventStart)
            .some((event) =>
              event.projection.items.some((item) => item.label === 'focus-reconciled.txt'),
            ),
        ).toBe(true);

        const removalEventStart = projectionEvents.length;
        await rm(path.join(workspacePath, 'externally-added.txt'));
        await runtime.reconcileWindow(windowId);
        expect(
          projectionEvents
            .slice(removalEventStart)
            .some(
              (event) =>
                !event.projection.items.some((item) => item.label === 'externally-added.txt'),
            ),
        ).toBe(true);
      } finally {
        unsubscribe();
      }
      expect(
        resolveDesktopWindowWorkspaceWorkbench(projection.window, project.workspaceId).layout.main
          .views,
      ).toEqual([expect.objectContaining({ kind: 'canvas' })]);
      const entities = await runtime.search(
        windowId,
        createResourceBrowserSearchRequest({
          requestId: 'search-entities',
          identity,
          facet: 'entities',
          query: 'Rin',
        }),
      );
      const entity = entities.items[0];
      if (!entity || entity.facet !== 'entities' || entity.entityStatus === 'candidate') {
        throw new Error('Project Resource runtime fixture did not project its canonical Entity.');
      }
      const intent = {
        type: 'edit' as const,
        entityId: 'character-rin',
        changes: { facts: { role: 'lead' } },
      };
      await runtime.execute(
        windowId,
        createResourceBrowserEntityIntentRequest({
          requestId: 'edit-entity',
          identity,
          resourceId: entity.resourceId,
          intent,
        }),
      );
      expect(executeEntityIntent).toHaveBeenCalledWith({
        identity,
        item: entity,
        intent,
        workspace: expect.objectContaining({
          workspaceId: project.workspaceId,
          workspacePath,
        }),
      });
      await expect(
        runtime.getSnapshot(
          windowId,
          createResourceBrowserSnapshotRequest({
            requestId: 'snapshot-stale',
            identity: { ...identity, viewId: 'resource-browser:unattached-main-view' },
          }),
        ),
      ).rejects.toThrow('Project is not attached');
      await shell.transitionScene(
        createDesktopSceneTransitionRequest({
          requestId: 'leave-workspace-scene',
          rendererSessionId: projection.rendererSessionId,
          windowId,
          sceneId: resolveActiveDesktopWindowWorkbench(projection.window).scene.sceneId,
          intent: { kind: 'open-agent-entry' },
        }),
      );
      await expect(
        runtime.getSnapshot(
          windowId,
          createResourceBrowserSnapshotRequest({ requestId: 'snapshot-assistant', identity }),
        ),
      ).rejects.toThrow("Desktop Workspace 'workspace-1' is not the current composition");
    } finally {
      runtime.dispose();
      shell.releaseWindow(windowId);
      await shell.dispose();
    }
  });
});

describe('ResourceBrowserNodeRuntime global libraries', () => {
  it('resolves only the exact current thumbnail and rejects stale or cross-owner effects', async () => {
    const fixture = await createGlobalLibraryRuntimeFixture();
    const assetPath = path.join(fixture.assetRoot, 'hero.png');
    const externalRoot = path.join(fixture.root, 'Footage');
    await mkdir(fixture.assetRoot, { recursive: true });
    await mkdir(externalRoot, { recursive: true });
    await writeFile(assetPath, 'image');
    await writeFile(path.join(externalRoot, 'shot.mp4'), 'video');
    await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: fixture.mediaLibraryRoot,
      sourceDirectory: externalRoot,
      locationKind: 'local',
    });

    const assets = await fixture.runtime.searchHomeAssets({
      windowId: fixture.windowId,
      query: '',
      sortBy: 'name',
      sortDirection: 'ascending',
      limit: 20,
    });
    const asset = assets.items[0];
    if (!asset?.thumbnail) throw new Error('Fixture asset thumbnail is required.');
    const result = await fixture.runtime.resolveHomeLibraryThumbnail({
      windowId: fixture.windowId,
      request: {
        owner: asset.owner,
        itemId: asset.id,
        descriptorId: asset.thumbnail.descriptorId,
        sourceFingerprint: asset.thumbnail.sourceFingerprint,
        variant: 'icon',
      },
    });

    expect(fixture.createGlobalLibraryThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({
        absolutePath: await realpath(assetPath),
        mediaType: 'image',
        variant: 'icon',
      }),
    );
    expect(result).toMatchObject({ itemId: asset.id, variant: 'icon' });
    expect(JSON.stringify(result)).not.toContain(fixture.root);

    await expect(
      fixture.runtime.resolveHomeLibraryThumbnail({
        windowId: fixture.windowId,
        request: {
          owner: asset.owner,
          itemId: asset.id,
          descriptorId: asset.thumbnail.descriptorId,
          sourceFingerprint: 'stale-fingerprint',
          variant: 'hover',
        },
      }),
    ).rejects.toThrow('thumbnail identity is stale');

    const media = await fixture.runtime.searchHomeMediaLibraries({
      windowId: fixture.windowId,
      query: 'shot',
      sortBy: 'name',
      sortDirection: 'ascending',
      limit: 20,
    });
    const mediaItem = media.items[0];
    if (!mediaItem) throw new Error('Fixture Media Library item is required.');
    await expect(
      fixture.runtime.removeHomeAssets({
        windowId: fixture.windowId,
        assetIds: [mediaItem.id],
      }),
    ).rejects.toThrow('requires Asset items');
  });

  it('removes only the membership record and preserves source bytes across metadata reopen', async () => {
    const fixture = await createGlobalLibraryRuntimeFixture();
    const assetPath = path.join(fixture.assetRoot, 'hero.png');
    await mkdir(fixture.assetRoot, { recursive: true });
    await writeFile(assetPath, 'preserved-source');
    const initial = await fixture.runtime.searchHomeAssets({
      windowId: fixture.windowId,
      query: '',
      sortBy: 'name',
      sortDirection: 'ascending',
      limit: 20,
    });
    const asset = initial.items[0];
    if (!asset) throw new Error('Fixture Asset is required.');

    await expect(
      fixture.runtime.removeHomeAssets({
        windowId: fixture.windowId,
        assetIds: [asset.id],
      }),
    ).resolves.toMatchObject({ status: 'removed', assetIds: [asset.id] });
    await expect(readFile(assetPath, 'utf8')).resolves.toBe('preserved-source');
    await expect(
      fixture.runtime.searchHomeAssets({
        windowId: fixture.windowId,
        query: '',
        sortBy: 'name',
        sortDirection: 'ascending',
        limit: 20,
      }),
    ).resolves.toMatchObject({ items: [] });

    await fixture.metadataStore.dispose();
    const reopened = createNodeSqliteLocalMetadataStore({ homedir: fixture.home });
    metadataStores.push(reopened);
    await reopened.open({
      databasePath: resolveGlobalStorageLayout(fixture.home).database,
      busyTimeoutMs: 1_000,
    });
    await initializeCoreLocalMetadataTables(reopened);
    await initializeAssetLibraryMembershipTables(reopened);
    await expect(reopened.repositories.assetLibraryMemberships.listActive()).resolves.toEqual([]);
    await expect(readFile(assetPath, 'utf8')).resolves.toBe('preserved-source');
  });

  it('serializes Asset mutations without blocking Media Library reads', async () => {
    const selectedSources = deferred<readonly string[] | undefined>();
    const selectGlobalAssetSources = vi.fn(() => selectedSources.promise);
    const fixture = await createGlobalLibraryRuntimeFixture({
      selectGlobalAssetSources,
    });
    const externalRoot = path.join(fixture.root, 'Footage');
    await mkdir(externalRoot, { recursive: true });
    await writeFile(path.join(externalRoot, 'shot.mp4'), 'video');
    await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: fixture.mediaLibraryRoot,
      sourceDirectory: externalRoot,
      locationKind: 'local',
    });

    const pendingImport = fixture.runtime.importHomeAssets({
      windowId: fixture.windowId,
    });
    await waitFor(() => selectGlobalAssetSources.mock.calls.length === 1);

    const queuedImport = fixture.runtime.importHomeAssets({
      windowId: fixture.windowId,
    });
    expect(selectGlobalAssetSources).toHaveBeenCalledTimes(1);
    await expect(
      fixture.runtime.searchHomeMediaLibraries({
        windowId: fixture.windowId,
        query: '',
        sortBy: 'name',
        sortDirection: 'ascending',
        limit: 20,
      }),
    ).resolves.toMatchObject({ items: expect.any(Array) });

    selectedSources.resolve(undefined);
    await expect(pendingImport).resolves.toEqual({ status: 'cancelled' });
    await expect(queuedImport).resolves.toEqual({ status: 'cancelled' });
    expect(selectGlobalAssetSources).toHaveBeenCalledTimes(2);
  });

  it('rejects unknown Windows, permits bounded parallel thumbnail variants, and aborts on detach', async () => {
    const thumbnailsStarted = deferred<void>();
    let startedCount = 0;
    const fixture = await createGlobalLibraryRuntimeFixture({
      createGlobalLibraryThumbnail: vi.fn(
        ({
          signal,
        }: Parameters<ResourceBrowserNodeRuntimeOptions['createGlobalLibraryThumbnail']>[0]) =>
          new Promise<string>((_resolve, reject) => {
            startedCount += 1;
            if (startedCount === 2) thumbnailsStarted.resolve();
            signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
          }),
      ),
    });
    await mkdir(fixture.assetRoot, { recursive: true });
    await writeFile(path.join(fixture.assetRoot, 'hero.png'), 'image');

    await expect(
      fixture.runtime.importHomeAssets({
        windowId: 'missing-window',
      }),
    ).rejects.toThrow('missing-window');
    expect(fixture.selectGlobalAssetSources).not.toHaveBeenCalled();

    const assets = await fixture.runtime.searchHomeAssets({
      windowId: fixture.windowId,
      query: '',
      sortBy: 'name',
      sortDirection: 'ascending',
      limit: 20,
    });
    const asset = assets.items[0];
    if (!asset?.thumbnail) throw new Error('Fixture asset thumbnail is required.');
    const thumbnailRequest = {
      windowId: fixture.windowId,
      request: {
        owner: asset.owner,
        itemId: asset.id,
        descriptorId: asset.thumbnail.descriptorId,
        sourceFingerprint: asset.thumbnail.sourceFingerprint,
        variant: 'hover',
      },
    } as const;
    const pendingHoverThumbnail = fixture.runtime.resolveHomeLibraryThumbnail(thumbnailRequest);
    const pendingIconThumbnail = fixture.runtime.resolveHomeLibraryThumbnail({
      ...thumbnailRequest,
      request: { ...thumbnailRequest.request, variant: 'icon' },
    });
    await thumbnailsStarted.promise;
    fixture.runtime.detachWindow(fixture.windowId);
    await expect(pendingHoverThumbnail).rejects.toThrow('detached');
    await expect(pendingIconThumbnail).rejects.toThrow('detached');
  });
});

function shellWithViews(views: readonly DesktopWorkbenchViewRef[]) {
  const scope = {
    kind: 'workspace' as const,
    draftId: 'draft-workspace-1',
    workspaceId: 'workspace-1',
    workspaceGrantId: 'workspace-grant-1',
  };
  const scene = parseDesktopWorkbenchSceneProjection({
    sceneId: 'scene:window-1:workspace-1',
    windowId: 'window-1',
    context: { kind: 'agent', agentViewId: 'agent-view-1', scope },
    slots: {
      interaction: {
        kind: 'agent',
        agentSurfaceId: 'agent-surface:window-1:workspace-1',
        agentViewId: 'agent-view-1',
        phase: 'draft',
        scope,
      },
      rightManager: { kind: 'workspace-resources', workspaceId: 'workspace-1' },
      status: { kind: 'scene-status', sceneId: 'scene:window-1:workspace-1' },
    },
  });
  const defaultLayout = createDefaultDesktopWorkbenchLayout('window-1');
  const layout = {
    ...defaultLayout,
    main: {
      views,
      groups: [
        {
          groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
          viewIds: views.map((view) => view.viewId),
          ...(views[0] ? { activeViewId: views[0].viewId } : {}),
        },
      ],
      activeGroupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
    },
  };
  const workbench = createDesktopWindowComposition({
    workbenchInstanceId: 'workbench:window-1:workspace-1',
    layout,
    scene,
  });
  const projection: Pick<DesktopShellProjection, 'window'> = {
    window: {
      windowId: 'window-1',
      activeTarget: { kind: 'home' },
      tabs: [],
      workbench,
      applicationSidebar: createDefaultDesktopApplicationSidebar('window-1'),
    },
  };
  return {
    getProjection: async () => projection,
  };
}

function accepted(value: unknown): CanvasHostIntentResult {
  const request = parseCanvasHostIntentRequest(value);
  return {
    requestId: request.requestId,
    commandId: request.commandId,
    status: 'accepted',
    snapshot: {
      identity: request.identity,
      dirty: true,
      canvas: DEFAULT_CANVAS_DATA,
      presentation: {
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        selectedNodeIds: [],
      },
      authoringCapabilities: {
        sourceModes: ['import', 'reference'],
        generationKinds: [],
      },
      generationNodes: [],
    },
  };
}

async function createGlobalLibraryRuntimeFixture(
  overrides: {
    readonly selectGlobalAssetSources?: ResourceBrowserNodeRuntimeOptions['selectGlobalAssetSources'];
    readonly createGlobalLibraryThumbnail?: ResourceBrowserNodeRuntimeOptions['createGlobalLibraryThumbnail'];
  } = {},
) {
  const root = await mkdtemp(path.join(tmpdir(), 'openneko-global-library-runtime-'));
  temporaryRoots.push(root);
  const home = path.join(root, 'home');
  const assetRoot = path.join(home, '.neko', 'assets');
  const mediaLibraryRoot = path.join(home, '.neko', 'media-libraries');
  const shell = createGlobalLibraryShell();
  const windowId = await shell.claimWindowId();
  shell.setRendererSessionId(windowId, 'renderer-session-1');
  const host = createElectronNekoHostPorts({
    homedir: home,
    nekoHome: path.join(home, '.neko'),
    logger: createLogger(),
    revealPath: () => undefined,
  });
  const selectGlobalAssetSources =
    overrides.selectGlobalAssetSources ?? vi.fn(async () => undefined);
  const createGlobalLibraryThumbnail =
    overrides.createGlobalLibraryThumbnail ?? vi.fn(async () => 'data:image/png;base64,AA==');
  const metadataStore = createNodeSqliteLocalMetadataStore({ homedir: home });
  metadataStores.push(metadataStore);
  await metadataStore.open({
    databasePath: resolveGlobalStorageLayout(home).database,
    busyTimeoutMs: 1_000,
  });
  await initializeCoreLocalMetadataTables(metadataStore);
  await initializeAssetLibraryMembershipTables(metadataStore);
  const runtime = new ResourceBrowserNodeRuntime({
    globalAssetRoot: assetRoot,
    globalMediaLibraryRoot: mediaLibraryRoot,
    assetLibraryMemberships: metadataStore.repositories.assetLibraryMemberships,
    shell,
    host,
    openPreview: async () => undefined,
    openCreativeDocument: async () => undefined,
    openTextEditor: async () => undefined,
    selectSource: async () => undefined,
    trashWorkspaceItem: async () => undefined,
    selectConfiguredGlobalMediaLibrary: async () => undefined,
    selectGlobalMediaLibrarySource: async () => undefined,
    selectGlobalAssetSources,
    selectGlobalLibraryMoveDestination: async () => undefined,
    createThumbnail: async () => 'data:image/png;base64,AA==',
    createGlobalLibraryThumbnail,
    openQuickPreview: async () => {
      throw new Error('Quick preview is not expected by this global-library test.');
    },
    releaseQuickPreview: () => undefined,
    canvas: {
      executeIntent: async () => {
        throw new Error('Canvas execution is not expected by this global-library test.');
      },
    },
    entity: {
      executeIntent: async () => {
        throw new Error('Entity execution is not expected by this global-library test.');
      },
    },
    cut: {
      addResource: async () => undefined,
    },
  });
  return {
    root,
    home,
    assetRoot,
    mediaLibraryRoot,
    runtime,
    windowId,
    selectGlobalAssetSources,
    metadataStore,
    createGlobalLibraryThumbnail,
  };
}

function createGlobalLibraryShell(): DesktopShellService {
  const registry: DesktopWorkspaceRegistry = {
    listProjects: async () => [],
    removeProjects: async () => false,
    resolve: async (): Promise<AssetWorkspaceResolution> => {
      throw new Error('Workspace resolution is not expected by this global-library test.');
    },
    dispose: async () => undefined,
  };
  return new DesktopShellService({
    applicationInstanceId: 'app-1',
    stateRepository: createInMemoryDesktopShellStateRepository(),
    workspaceRegistry: registry,
    createIdentity: () => 'window-1',
  });
}

function createLogger(): ILogger {
  return {
    source: 'test',
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => createLogger(),
    setLevel: vi.fn(),
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => {
      if (!resolvePromise) throw new Error('Deferred promise is unavailable.');
      resolvePromise(value);
    },
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Runtime test condition was not reached.');
}
